// Verwaltungs-Anbindung Ende-zu-Ende in einer vollständig getrennten Testumgebung (nur künstliche Daten):
// eigene PostgreSQL-Instanz mit nachgebildeter Verwaltung + die echte Edge Function unter Deno + die App.
// Prüft: nur zusammengefasste Kennzahlen aus vorhandenen Auswertungen, keine Personendaten, Datenbankrechte,
// Kopplung/Widerruf/Begrenzung, Fehlerbehandlung, automatische Aktualisierung in der App.
// Läuft, wenn PostgreSQL installiert ist (lokal und in GitHub Actions); VL_REQUIRE_VERWALTUNG=1 macht Fehlen zum Fehler.
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { startEnv, pgBin, TEST_MAPPING } from "./verwaltung/env.mjs";
import { pgRepo, parseMapping } from "../server/kpi-pg.mjs";
import { KPI_KEYS, buildKpis, MAX_PAIR_FAILS } from "../server/kpi-core.mjs";
import { grantsSql, INVENTORY_SQL } from "../scripts/verwaltung.mjs";
import { ready, state, kv, expectToast } from "./helpers.mjs";

test.describe.configure({ mode: "serial", timeout: 120_000 });
const available = !!pgBin();
if (process.env.VL_REQUIRE_VERWALTUNG && !available) throw new Error("PostgreSQL fehlt, Verwaltungs-Tests können nicht laufen");
test.skip(!available, "PostgreSQL nicht installiert");

let env, fnPort, tok503;
test.beforeAll(async ({}, info) => {
  test.setTimeout(240_000); // erster Start lädt Deno und postgres.js
  fnPort = 8740 + info.parallelIndex;
  env = await startEnv({ pgPort: 54400 + info.parallelIndex, fnPort });
});
test.afterAll(async () => env && (await env.stop()));

const pair = (code, device = "Test") => fetch(env.url + "/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, device }) });
const kpis = (token, h = {}) => fetch(env.url + "/kpis", { headers: { authorization: "Bearer " + token, ...h } });
async function newToken() {
  const r = await pair(await env.code());
  expect(r.status).toBe(200);
  return (await r.json()).token;
}
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const valueOf = (j, key, date = today()) => j.values.find((v) => v.key === key && v.date === date)?.value;
const serverOnly = (info) => test.skip(info.project.name !== "chromium-desktop", "Server-Prüfung einmal je Lauf (Chromium Desktop)");

test("Gegenstelle liefert genau die Werte der vorhandenen Auswertungen; Testkonten und Demo-Meetups zählen nicht", async ({}, info) => {
  serverOnly(info);
  const tok = await newToken();
  let j = await (await kpis(tok)).json();
  expect(Object.keys(j).sort()).toEqual(["format", "generatedAt", "meta", "values", "version"]);
  expect(j.meta).toEqual({ excludesTestAccounts: true, excludesDemoMeetups: true, timezone: "Europe/Berlin" });
  // Unabhängig aus den künstlichen Basistabellen berechnet (nicht über die Views)
  const [x] = await env.sql`select
    (select count(*)::int from profiles where not is_test_account) as reg_total,
    (select count(*)::int from meetup_participants mp join profiles p on p.id = mp.profile_id where mp.meetup_id = 2 and mp.status = 'angemeldet' and not p.is_test_account) as signups,
    (select count(*)::int from meetup_participants mp join profiles p on p.id = mp.profile_id where mp.meetup_id = 1 and mp.status = 'teilgenommen' and not p.is_test_account) as attend,
    (select (sum(amount_cents) filter (where kind = 'zahlung') / 100.0)::float from payments where created_at >= now() - interval '30 days') as payments`;
  expect({ reg_total: valueOf(j, "reg_total"), signups: valueOf(j, "signups"), attend: valueOf(j, "attend"), payments: valueOf(j, "payments") }).toEqual(x);
  expect(x.reg_total).toBe(108); // 120 künstliche Personen, davon 12 Testkonten
  // Zeitreihen: bis zu 31 Tage Verlauf, Momentaufnahmen nur heute; nicht zugeordnete Schlüssel fehlen
  expect(j.values.filter((v) => v.key === "reg_total").length).toBeGreaterThanOrEqual(30);
  expect(j.values.filter((v) => v.key === "signups").map((v) => v.date)).toEqual([today()]);
  expect(j.values.some((v) => v.key === "inc" || v.key === "exp")).toBe(false);
  // Neues Testkonto und Anmeldungen zum Demo-Meetup ändern nichts; eine echte (künstliche) Registrierung schon
  await env.sql`insert into profiles (full_name, email, is_test_account, created_at) values ('Testkonto neu', 'neu@example.invalid', true, now())`;
  await env.sql`insert into meetup_participants (meetup_id, profile_id, status) select 3, id, 'angemeldet' from profiles where is_test_account`;
  j = await (await kpis(tok)).json();
  expect([valueOf(j, "reg_total"), valueOf(j, "signups")]).toEqual([x.reg_total, x.signups]);
  await env.sql`insert into profiles (full_name, email, created_at) values ('Person neu', 'pneu@example.invalid', now())`;
  j = await (await kpis(tok)).json();
  expect(valueOf(j, "reg_total")).toBe(x.reg_total + 1);
});

test("Keine Personendaten, Zugangsdaten oder internen Angaben in Antworten; Token nur als Hash gespeichert", async ({}, info) => {
  serverOnly(info);
  const tok = await newToken();
  const body = await (await kpis(tok)).text();
  const people = await env.sql`select id::text, full_name, email, phone from profiles`;
  const secrets = people.flatMap((p) => [p.id, p.full_name, p.email, p.phone]).filter(Boolean);
  const leaked = secrets.filter((s) => body.includes(s));
  expect(leaked).toEqual([]);
  expect(body).not.toMatch(/@|postgres|management_ai|admin_|select|error/i);
  const j = JSON.parse(body);
  for (const v of j.values) expect(Object.keys(v)).toEqual(["key", "date", "value", "source"]);
  expect(j.values.every((v) => KPI_KEYS.includes(v.key) && typeof v.value === "number")).toBe(true);
  // Token liegt nirgends im Klartext in der Datenbank
  const dump = JSON.stringify(await env.sql`select * from management_ai.devices`) + JSON.stringify(await env.sql`select * from management_ai.pair_codes`);
  expect(dump).not.toContain(tok);
});

test("Datenbankrechte: eingeschränkte Rolle liest nur die zugeordneten Auswertungen; API-Rollen erreichen nichts", async ({}, info) => {
  serverOnly(info);
  const as = async (role, q) => {
    try {
      await env.sql.begin(async (t) => {
        await t.unsafe(`set local role ${role}`);
        await t.unsafe(q);
      });
      return "erlaubt";
    } catch (e) {
      return /permission denied|read-only/.test(e.message) ? "verweigert" : "Fehler: " + e.message;
    }
  };
  // management_ai: keine Basistabellen mit Personendaten, keine Auswertung außerhalb der Zuordnung, kein Schreiben
  expect(await as("management_ai", "select email from public.profiles limit 1")).toBe("verweigert");
  expect(await as("management_ai", "select * from public.payments limit 1")).toBe("verweigert");
  expect(await as("management_ai", "select * from public.admin_user_list limit 1")).toBe("verweigert");
  expect(await as("management_ai", "insert into public.meetups (title, starts_at) values ('x', now())")).toBe("verweigert");
  expect(await as("management_ai", "delete from management_ai.devices")).toBe("verweigert");
  expect(await as("management_ai", "select management_ai.new_pair_code()")).toBe("verweigert");
  expect(await as("management_ai", "select registrations_total from public.admin_stats_daily limit 1")).toBe("erlaubt");
  expect(await as("management_ai", "select * from public.admin_finance_summary()")).toBe("erlaubt");
  // anon / authenticated (Supabase-API): kein Zugriff auf Gerätezugänge, Codes oder die Code-Erzeugung
  for (const r of ["anon", "authenticated"]) {
    expect(await as(r, "select * from management_ai.devices")).toBe("verweigert");
    expect(await as(r, "select * from management_ai.pair_codes")).toBe("verweigert");
    expect(await as(r, "select management_ai.new_pair_code()")).toBe("verweigert");
  }
  // Kennzahlen werden in einer READ-ONLY-Transaktion gelesen
  const ro = await env.sql.begin("read only", (t) => t`insert into management_ai.calls (token_hash) values ('x')`).then(() => "erlaubt", (e) => e.message);
  expect(ro).toContain("read-only");
  // Rechte-SQL nur für zugeordnete Quellen; keine Basistabellen
  const g = grantsSql(TEST_MAPPING);
  expect(g).toContain('grant select on "public"."admin_stats_daily" to management_ai;');
  expect(g).not.toMatch(/profiles|payments|admin_user_list/);
});

test("Kopplung, Widerruf, Begrenzung, CORS und Schutz vor dem Durchprobieren von Codes", async ({}, info) => {
  serverOnly(info);
  expect((await fetch(env.url + "/kpis")).status).toBe(401);
  expect((await kpis("abc")).status).toBe(401);
  expect((await kpis("f".repeat(64))).status).toBe(401);
  // Code einmalig
  const code = await env.code();
  expect(code).toMatch(/^\d{8}$/);
  const r1 = await pair(code);
  expect(r1.status).toBe(200);
  const tok = (await r1.json()).token;
  expect(tok).toMatch(/^[0-9a-f]{64}$/);
  expect((await pair(code)).status).toBe(410);
  // Abgelaufener Code
  const old = await env.code();
  await env.sql`update management_ai.pair_codes set expires_at = now() - interval '1 minute' where used_at is null`;
  expect((await pair(old)).status).toBe(410);
  // Gerätename wird bereinigt (keine Steuerzeichen/HTML), Länge begrenzt
  await pair(await env.code(), "<script>x</script>" + "a".repeat(100));
  const [dv] = await env.sql`select name from management_ai.devices order by created_at desc limit 1`;
  expect(dv.name).not.toMatch(/[<>]/);
  expect(dv.name.length).toBeLessThanOrEqual(60);
  // Durchprobieren: nach MAX_PAIR_FAILS Fehlversuchen ist auch ein richtiger Code für 10 Minuten gesperrt
  await env.sql`delete from management_ai.calls where token_hash = 'pair:fail'`;
  for (let i = 0; i < MAX_PAIR_FAILS; i++) expect((await pair(String(10000000 + i))).status).toBe(401);
  const good = await env.code();
  expect((await pair(good)).status).toBe(429);
  await env.sql`update management_ai.calls set at = now() - interval '11 minutes' where token_hash = 'pair:fail'`;
  expect((await pair(good)).status).toBe(200);
  // Begrenzung: 60 Abrufe je Stunde und Gerät
  const th = (await env.sql`select token_hash from management_ai.devices order by created_at desc limit 1`)[0].token_hash;
  const t2 = await newToken();
  const th2 = (await env.sql`select token_hash from management_ai.devices order by created_at desc limit 1`)[0].token_hash;
  await env.sql`insert into management_ai.calls (token_hash, at) select ${th2}, now() from generate_series(1, 60)`;
  expect((await kpis(t2)).status).toBe(429);
  expect((await kpis(tok)).status).toBe(200); // andere Geräte nicht betroffen
  expect(th).not.toBe(th2);
  // Widerruf in der Verwaltung → sofort 401
  await env.sql`update management_ai.devices set revoked_at = now() where token_hash = encode(sha256(convert_to(${tok}, 'UTF8')), 'hex')`;
  expect((await kpis(tok)).status).toBe(401);
  // CORS: nur die Adresse der App; fremde Seiten werden abgewiesen
  const pre = await fetch(env.url + "/kpis", { method: "OPTIONS", headers: { origin: "http://127.0.0.1:4173", "access-control-request-method": "GET", "access-control-request-headers": "authorization" } });
  expect(pre.status).toBe(204);
  expect(pre.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:4173");
  expect((await fetch(env.url + "/kpis", { headers: { origin: "https://fremde-seite.example.com", authorization: "Bearer " + t2 } })).status).toBe(403);
  expect((await fetch(env.url + "/irgendwas")).status).toBe(404);
});

test("Fehlerhafte oder gefährliche Zuordnungen: kaputte Auswertung wird übersprungen, Texte werden verworfen, Einschleusen unmöglich", async ({}, info) => {
  serverOnly(info);
  // Einschleusungsversuche in mapping.json werden abgelehnt
  for (const bad of ["public.x; drop table profiles", 'public."x"', "a.b.c", "public.x()--"]) expect(parseMapping({ reg_total: { source: bad, date: "day", value: "v" } }, KPI_KEYS).errors).toHaveLength(1);
  expect(parseMapping({ reg_total: { source: "public.x", date: "day", value: "v); drop" } }, KPI_KEYS).errors).toHaveLength(1);
  expect(() => grantsSql({ reg_total: { source: "public.x;--", date: "d", value: "v" } })).toThrow();
  // Eigener Repo-Zugang (gleiche Logik wie die Edge Function) mit absichtlich fehlerhafter Zuordnung
  await env.sql.unsafe("create view public.admin_mail_view as select current_date as day, email as wert from public.profiles; grant select on public.admin_mail_view to management_ai;");
  const sql = postgres(`postgres://postgres@127.0.0.1:${54400 + info.parallelIndex}/postgres`, { max: 1, onnotice: () => {} });
  const errs = [];
  const repo = pgRepo(sql, { reg_total: TEST_MAPPING.reg_total, reg_week: { source: "public.gibt_es_nicht", date: "day", value: "x" }, active_users: { source: "public.admin_mail_view", date: "day", value: "wert" } }, KPI_KEYS, { onError: (k) => errs.push(k) });
  const out = buildKpis(await repo.aggregates(), Date.now(), await repo.meta());
  expect(errs).toEqual(["reg_week"]);
  expect([...new Set(out.values.map((v) => v.key))]).toEqual(["reg_total"]);
  expect(JSON.stringify(out)).not.toContain("@");
  expect(out.meta.excludesTestAccounts).toBe(false); // ohne bestätigte Angabe in mapping.json nie „true“
  await sql.end();
  await env.sql.unsafe("drop view public.admin_mail_view");
});

test("App ↔ echte Gegenstelle: Kopplung in der Oberfläche, Historie, automatische Aktualisierung, Widerruf, Wiederholversuche", async ({ browser }) => {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const base = "http://127.0.0.1:4173/kpi-edge/" + fnPort;
  await ctx.addInitScript((u) => (window.VL_KPI_URL = u), base);
  const p = await ctx.newPage();
  const calls = [];
  p.on("request", (r) => r.url().startsWith(base) && calls.push(r.url()));
  const t0 = new Date(Date.now() + 60e3);
  await p.clock.setFixedTime(t0);
  await p.goto("/");
  await ready(p);
  await p.click('nav button[data-id="more"]');
  await p.click('button[data-a="kpi"]');
  await p.fill("#kpCode", "12345678");
  await p.click('button[data-a="kpPair"]');
  await expectToast(p, "Code ungültig oder abgelaufen");
  await p.fill("#kpCode", await env.code());
  await p.click('button[data-a="kpPair"]');
  await expectToast(p, "Gekoppelt ·");
  await expect(p.locator("#sheet")).toContainText("gekoppelt");
  const [{ n: regNow }] = await env.sql`select count(*)::int as n from profiles where not is_test_account`;
  const vals = async (k) => (await state(p)).metrics.find((m) => m.key === k).entries.filter((e) => !e.deleted && e.src === "verwaltung");
  expect((await vals("reg_total")).find((e) => e.date === today()).value).toBe(regNow);
  expect((await vals("reg_total")).length).toBeGreaterThanOrEqual(30); // Verlauf übernommen
  expect((await kv(p, "kpi-config")).token).toMatch(/^[0-9a-f]{64}$/);
  // Startseite zeigt den übernommenen Wert, keine Fehler
  await p.click('#sheet button[data-a="close"]');
  // Automatische Aktualisierung: innerhalb von 6 Stunden kein Abruf, danach neue Werte ohne Doppelungen
  await env.sql`insert into profiles (full_name, email, created_at) values ('Person App', 'papp@example.invalid', now())`;
  let n = calls.length;
  await p.evaluate(() => runCycle("test"));
  expect(calls.length).toBe(n);
  await p.clock.setFixedTime(new Date(t0.getTime() + 6.5 * 3600e3));
  const rep = await p.evaluate(() => runCycle("test"));
  expect(rep.steps[0].note).toMatch(/\d+ Kennzahlen aus der Verwaltung \([1-9]\d* neu oder geändert\)/);
  const reg = (await vals("reg_total")).filter((e) => e.date === today());
  expect(reg.map((e) => e.value)).toEqual([regNow + 1]);
  // Verwaltung vorübergehend nicht erreichbar: Fehler gemeldet, wachsende Pause statt Dauerabruf, danach Erholung
  let t = t0.getTime() + 13 * 3600e3;
  await p.clock.setFixedTime(new Date(t));
  await p.evaluate(() => (window.VL_KPI_URL = "http://127.0.0.1:4173/kpi-edge/8799"));
  expect(await p.evaluate(() => kpiSync())).toMatchObject({ ok: false, error: expect.stringContaining("nicht erreichbar") });
  const dead = () => p.evaluate(() => kpiAuto());
  expect(await dead()).toBeNull(); // Pause nach dem Fehler (30 Minuten)
  await p.clock.setFixedTime(new Date((t += 31 * 60e3)));
  expect(await dead()).toContain("nicht erreichbar");
  for (let i = 0; i < 3; i++) await p.clock.setFixedTime(new Date((t += 9 * 3600e3))), await dead();
  await p.evaluate(() => loadKpiState());
  expect(await p.evaluate(() => findings().find((f) => f.id === "sys-kpi")?.title)).toContain("nicht abrufbar");
  await p.evaluate((u) => (window.VL_KPI_URL = u), base);
  await p.clock.setFixedTime(new Date((t += 9 * 3600e3)));
  expect(await dead()).toContain("Kennzahlen aus der Verwaltung");
  expect(await p.evaluate(() => findings().some((f) => f.id === "sys-kpi"))).toBe(false);
  // Widerruf in der Verwaltung → App erkennt es, ruft nicht weiter ab, Kennzahlen bleiben, Hinweis erscheint
  await env.sql`update management_ai.devices set revoked_at = now()`;
  await p.clock.setFixedTime(new Date((t += 7 * 3600e3)));
  expect(await dead()).toContain("widerrufen");
  n = calls.length;
  await p.clock.setFixedTime(new Date((t += 7 * 3600e3)));
  await p.evaluate(() => runCycle("test"));
  expect(calls.length).toBe(n);
  expect((await vals("reg_total")).length).toBeGreaterThanOrEqual(30);
  expect(await p.evaluate(() => findings().find((f) => f.id === "sys-kpi")?.title)).toContain("widerrufen");
  await p.click('nav button[data-id="more"]');
  await p.click('button[data-a="kpi"]');
  await expect(p.locator("#kpRevoked")).toBeVisible();
  // Neu koppeln funktioniert
  await p.evaluate(() => (document.querySelector("#toast").textContent = "")); // alte Meldung nicht verwechseln
  await p.fill("#kpCode", await env.code());
  await p.click('button[data-a="kpPair"]');
  await expectToast(p, "Gekoppelt ·");
  expect(await p.evaluate(() => findings().some((f) => f.id === "sys-kpi"))).toBe(false);
  await ctx.close();
});

test("Bestandsaufnahme: nur Namen, Spalten und Datentypen – keine Inhalte, keine Zeilenzahlen, keine Änderungen", async ({}, info) => {
  serverOnly(info);
  // Als eingeschränkte, rein lesende Rolle ausführbar (wie es im SQL-Editor bei einem einzelnen SELECT der Fall ist)
  const rows = await env.sql.begin("read only", (t) => t.unsafe(INVENTORY_SQL));
  expect(Object.keys(rows[0])).toEqual(["art", "quelle", "spalten", "hinweis"]);
  const byName = Object.fromEntries(rows.map((r) => [r.quelle, r]));
  expect(byName["public.admin_stats_daily"]).toMatchObject({ art: "view", spalten: "day date, registrations_total bigint, registrations_7d bigint, active_users_30d bigint" });
  expect(byName["public.admin_finance_summary()"]).toMatchObject({ art: "funktion", hinweis: "security_definer" });
  expect(byName["public.profiles"].art).toBe("tabelle");
  expect(rows.some((r) => r.quelle.startsWith("management_ai.") || r.quelle.startsWith("pg_catalog."))).toBe(false);
  // Keine Inhalte: keine künstlichen Namen, E-Mail-Adressen, Telefonnummern oder Zahlen aus den Daten
  const out = JSON.stringify(rows);
  const people = await env.sql`select full_name, email, phone from profiles`;
  expect(people.flatMap((p) => [p.full_name, p.email, p.phone]).filter((x) => x && out.includes(x))).toEqual([]);
  expect(out).not.toMatch(/@|\b108\b|\b120\b/);
  // Nur ein einzelnes SELECT (kein Befehl, der etwas verändern könnte)
  const stmt = INVENTORY_SQL.replace(/--.*$/gm, "").trim();
  expect(stmt).toMatch(/^with /);
  expect(stmt).not.toMatch(/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|do|call|set)\b/i);
  expect(stmt.replace(/;\s*$/, "")).not.toContain(";");
  // Die Datei für den SQL-Editor entspricht genau dieser geprüften Abfrage
  expect(readFileSync(new URL("../docs/bestandsaufnahme-verwaltung.sql", import.meta.url), "utf8")).toBe(INVENTORY_SQL);
});

test("Rückbau entfernt nur die Anbindung; Daten und Auswertungen der Verwaltung bleiben unverändert", async ({}, info) => {
  serverOnly(info);
  const snap = async () => JSON.stringify(await env.sql`select (select count(*) from profiles) p, (select count(*) from payments) z, (select registrations_total from admin_stats_daily order by day desc limit 1) r, (select count(*) from information_schema.views where table_schema = 'public') v`);
  const before = await snap();
  tok503 = await newToken();
  await env.sql.unsafe("drop schema management_ai cascade; drop owned by management_ai; drop role management_ai;");
  expect(await snap()).toBe(before);
  expect((await env.sql`select count(*)::int n from pg_roles where rolname = 'management_ai'`)[0].n).toBe(0);
  expect((await env.sql`select count(*)::int n from pg_namespace where nspname = 'management_ai'`)[0].n).toBe(0);
});

test("Datenbank nicht erreichbar → 503 ohne Einzelheiten (keine internen Meldungen nach außen)", async ({}, info) => {
  serverOnly(info);
  // nach dem Rückbau (Schema fehlt) und bei gestoppter Datenbank: jeweils 503 ohne Einzelheiten
  for (const step of ["ohne Schema", "Datenbank aus"]) {
    if (step === "Datenbank aus") await env.stopPg();
    const r = await kpis(tok503);
    expect(r.status, step).toBe(503);
    expect(await r.text()).toBe('{"error":"unavailable"}');
  }
});
