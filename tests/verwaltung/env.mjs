// Vollständig getrennte, lokale Testumgebung der Verwaltungs-Gegenstelle (nur künstliche Daten):
// eigene PostgreSQL-Instanz in einem Temp-Ordner (Supabase-Grundeinstellungen nachgebildet) + die echte Edge Function
// (gebündelt wie für Supabase) unter Deno. Keine Verbindung zu Rork, Supabase oder einer produktiven Datenbank.
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import net from "node:net";
import { bundle, grantsSql, edgeSingleFile } from "../../scripts/verwaltung.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

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

export async function startEnv({ pgPort, fnPort, mapping = TEST_MAPPING, fixtures = [join(HERE, "fixture.sql")], extraSql = [], singleFile = true, migrate = true }) {
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
  const pg = spawn(...run(join(bin, "postgres"), ["-D", data, "-p", String(pgPort), "-k", dir, "-c", "listen_addresses=127.0.0.1", "-c", "fsync=off", "-c", "timezone=Europe/Berlin", "-c", "max_connections=30", "-c", "shared_buffers=16MB", "-c", "dynamic_shared_memory_type=mmap"], { stdio: ["ignore", "ignore", "pipe"], detached: true }));
  // Server-Meldungen mitschreiben (nur künstliche Testdaten), damit ein Startfehler nachvollziehbar ist
  let pgLog = "";
  pg.stderr.on("data", (d) => (pgLog = (pgLog + d).slice(-4000)));
  const admin = `postgres://postgres@127.0.0.1:${pgPort}/postgres`;
  let sql;
  // bis zu 60 s warten (ausgelastete CI-Rechner); beendet sich der Server, sofort mit seiner Meldung abbrechen
  for (let i = 0; i < 300; i++) {
    if (pg.exitCode !== null || pg.signalCode) throw new Error(`PostgreSQL beendet (${pg.exitCode ?? pg.signalCode}): ` + pgLog);
    try {
      sql = postgres(admin, { max: 1, onnotice: () => {} });
      await sql`select 1`;
      break;
    } catch {
      await sql?.end().catch(() => {});
      sql = null;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  if (!sql) {
    try {
      process.kill(-pg.pid, "SIGINT");
    } catch {}
    throw new Error("PostgreSQL startet nicht: " + pgLog);
  }
  // Reihenfolge wie später in Supabase: vorhandene Verwaltung → Migration → zusätzliche Auswertungen der Anbindung → Rechte
  for (const f of [join(HERE, "supabase-stub.sql"), ...fixtures, ...(migrate ? [join(ROOT, "server/supabase/migrations/20261126_management_kpis.sql"), ...extraSql] : [])]) await sql.unsafe(readFileSync(f, "utf8"));
  if (migrate) await sql.unsafe(grantsSql(mapping));
  // Edge Function wie für Supabase bündeln und unter Deno starten
  // Standard: genau die EINE Datei, die im Supabase-Dashboard eingefügt wird (singleFile=false: Ordner wie für die CLI)
  // startFn kann weitere Fassungen (andere Zuordnung) gegen DIESELBE Datenbank starten – z. B. alte und neue Edge Function
  const fns = [];
  async function startFn(fnMapping, port, single = singleFile) {
    let fnDir;
    if (single) {
      fnDir = join(dir, "single-" + port);
      mkdirSync(fnDir, { recursive: true });
      writeFileSync(join(fnDir, "index.ts"), edgeSingleFile(fnMapping));
    } else fnDir = bundle(fnMapping, join(dir, "bundle-" + port));
    const deno = process.env.DENO || "npx";
    const args = process.env.DENO ? [] : ["-y", "deno@2.9.6"];
    const fn = spawn(deno, [...args, "run", "--allow-net", "--allow-env", "--allow-read", "--allow-sys", join(fnDir, "index.ts")], {
      env: { ...process.env, SUPABASE_DB_URL: admin, DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${port}`, VL_ALLOWED_ORIGIN: "http://127.0.0.1:4173", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true, // eigene Prozessgruppe: beim Beenden auch den von npx gestarteten Deno-Prozess stoppen
    });
    let log = "";
    fn.stdout.on("data", (d) => (log += d));
    fn.stderr.on("data", (d) => (log += d));
    fns.push(fn);
    const url = `http://127.0.0.1:${port}/functions/v1/management-kpis`;
    for (let i = 0; i < 600; i++) {
      if (fn.exitCode !== null) throw new Error("Edge Function beendet: " + log);
      const ok = await fetch(url + "/kpis").then((r) => r.status === 401 || (!migrate && r.status === 503)).catch(() => false);
      if (ok) break;
      if (i === 599) throw new Error("Edge Function antwortet nicht: " + log);
      await new Promise((r) => setTimeout(r, 200));
    }
    return {
      url,
      log: () => log,
      stop: () => {
        try {
          process.kill(-fn.pid, "SIGTERM");
        } catch {}
      },
    };
  }
  const first = await startFn(mapping, fnPort);
  const url = first.url;
  const log = first.log;
  return {
    url,
    sql,
    log,
    startFn,
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
      for (const f of fns)
        try {
          process.kill(-f.pid, "SIGTERM");
        } catch {}
      await this.stopPg();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
