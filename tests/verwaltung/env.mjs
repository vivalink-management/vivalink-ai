// Vollständig getrennte, lokale Testumgebung der Verwaltungs-Gegenstelle (nur künstliche Daten):
// eigene PostgreSQL-Instanz in einem Temp-Ordner (Supabase-Grundeinstellungen nachgebildet) + die echte Edge Function
// (gebündelt wie für Supabase) unter Deno. Keine Verbindung zu Rork, Supabase oder einer produktiven Datenbank.
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import net from "node:net";
import { bundle, grantsSql } from "../../scripts/verwaltung.mjs";

const HERE = new URL(".", import.meta.url).pathname;
const ROOT = join(HERE, "../..");
export const TEST_MAPPING = JSON.parse(readFileSync(join(HERE, "mapping.test.json"), "utf8"));

export function pgBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  const base = "/usr/lib/postgresql";
  if (!existsSync(base)) return null;
  const v = readdirSync(base).sort((a, b) => b - a).find((x) => existsSync(join(base, x, "bin/initdb")));
  return v ? join(base, v, "bin") : null;
}
const asRoot = process.getuid && process.getuid() === 0;
// initdb/postgres laufen nicht als root → dann als Benutzer postgres
const run = (bin, args, opts = {}) => (asRoot ? ["runuser", ["-u", "postgres", "--", bin, ...args], opts] : [bin, args, opts]);

export async function startEnv({ pgPort, fnPort, mapping = TEST_MAPPING, fixtures = [join(HERE, "fixture.sql")], extraSql = [] }) {
  const bin = pgBin();
  if (!bin) throw new Error("PostgreSQL nicht installiert (Testumgebung der Verwaltung)");
  // Port muss frei sein – sonst würde unbemerkt eine übrig gebliebene Instanz mit altem Stand verwendet
  const busy = await new Promise((r) => {
    const c = net.connect(pgPort, "127.0.0.1", () => (c.destroy(), r(true)));
    c.on("error", () => r(false));
  });
  if (busy) throw new Error(`Port ${pgPort} belegt (übrig gebliebene Testdatenbank?)`);
  const dir = mkdtempSync(join(tmpdir(), "vl-verwaltung-"));
  if (asRoot) execFileSync("chown", ["postgres", dir]), chmodSync(dir, 0o755);
  const data = join(dir, "data");
  const r = spawnSync(...run(join(bin, "initdb"), ["-D", data, "-A", "trust", "-U", "postgres", "--no-sync", "-E", "UTF8"], { encoding: "utf8" }));
  if (r.status) throw new Error("initdb: " + r.stderr);
  const pg = spawn(...run(join(bin, "postgres"), ["-D", data, "-p", String(pgPort), "-k", dir, "-c", "listen_addresses=127.0.0.1", "-c", "fsync=off", "-c", "timezone=Europe/Berlin"], { stdio: "ignore", detached: true }));
  const admin = `postgres://postgres@127.0.0.1:${pgPort}/postgres`;
  let sql;
  for (let i = 0; i < 100; i++) {
    try {
      sql = postgres(admin, { max: 1, onnotice: () => {} });
      await sql`select 1`;
      break;
    } catch {
      await sql?.end().catch(() => {});
      sql = null;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!sql) throw new Error("PostgreSQL startet nicht");
  // Reihenfolge wie später in Supabase: vorhandene Verwaltung → Migration → zusätzliche Auswertungen der Anbindung → Rechte
  for (const f of [join(HERE, "supabase-stub.sql"), ...fixtures, join(ROOT, "server/supabase/migrations/20261126_management_kpis.sql"), ...extraSql]) await sql.unsafe(readFileSync(f, "utf8"));
  await sql.unsafe(grantsSql(mapping));
  // Edge Function wie für Supabase bündeln und unter Deno starten
  const fnDir = bundle(mapping, join(dir, "bundle"));
  const deno = process.env.DENO || "npx";
  const args = process.env.DENO ? [] : ["-y", "deno@2.9.6"];
  const fn = spawn(deno, [...args, "run", "--allow-net", "--allow-env", "--allow-read", "--allow-sys", join(fnDir, "index.ts")], {
    env: { ...process.env, SUPABASE_DB_URL: admin, DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${fnPort}`, VL_ALLOWED_ORIGIN: "http://127.0.0.1:4173", NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // eigene Prozessgruppe: beim Beenden auch den von npx gestarteten Deno-Prozess stoppen
  });
  let log = "";
  fn.stdout.on("data", (d) => (log += d));
  fn.stderr.on("data", (d) => (log += d));
  const url = `http://127.0.0.1:${fnPort}/functions/v1/management-kpis`;
  for (let i = 0; i < 600; i++) {
    if (fn.exitCode !== null) throw new Error("Edge Function beendet: " + log);
    const ok = await fetch(url + "/kpis").then((r) => r.status === 401).catch(() => false);
    if (ok) break;
    if (i === 599) throw new Error("Edge Function antwortet nicht: " + log);
    await new Promise((r) => setTimeout(r, 200));
  }
  return {
    url,
    sql,
    log: () => log,
    /* Kopplungscode wie ein Admin der Verwaltung erzeugen (SQL-Funktion aus der Migration) */
    code: async () => (await sql`select management_ai.new_pair_code() as c`)[0].c,
    async stopPg() {
      await sql.end({ timeout: 1 }).catch(() => {});
      if (pg.exitCode !== null) return;
      const done = new Promise((r) => pg.once("exit", r));
      try {
        process.kill(-pg.pid, "SIGINT"); // schnelles, sauberes Herunterfahren
      } catch {}
      await done;
    },
    async stop() {
      try {
        process.kill(-fn.pid, "SIGTERM");
      } catch {}
      await this.stopPg();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
