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
import { grantsSql, INVENTORY_SQL, factsSql, dryRunSql, eventTriggerDiagSql, ET_TERMS, ET_EXT } from "../scripts/verwaltung.mjs";
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
  // Nächstes Meetup automatisch aus der Verwaltung (Datum aus „Tage bis“, Ziel = Plätze)
  const [{ nd }] = await env.sql`select to_char((min(starts_at) at time zone 'Europe/Berlin')::date, 'YYYY-MM-DD') as nd from meetups where not is_demo and starts_at > now()`;
  expect((await state(p)).meetup).toMatchObject({ date: nd, goal: "12" });
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

test("Zweite Bestandsaufnahme (nur Positivlisten): kein Programmcode, keine unbekannten Zeichenketten, nur Lesen", async ({}, info) => {
  serverOnly(info);
  // Funktion und Prüfregeln mit Geheimnissen/unbekannten Werten in jeder Form
  await env.sql.unsafe(`create function public.admin_geheim() returns text language sql security definer as $$ select 'sk_live_abcdef' || 'meinpasswort' || 'leitung@example.invalid' || 'x' from public.payments where auth.uid() is not null $$`);
  await env.sql.unsafe(`create table public.regeltest (a text check (a in ('zahlung', 'geheimwert', 'leitung@example.invalid')), b text constraint geheimer_regelname check (b <> 'meinpasswort'))`);
  const q = factsSql({ functions: ["admin_finance_summary", "admin_kontakt", "admin_geheim"], tables: ["meetup_participants", "regeltest"], terms: ["auth.uid()", "is_admin()", "payments", "is_test_account", "'zahlung'", "'tester'"], codes: ["angemeldet", "teilgenommen", "abgesagt", "zahlung"] });
  // als eingeschränkte, rein lesende Transaktion
  const rows = await env.sql.begin("read only", (t) => t.unsafe(q));
  expect(Object.keys(rows[0])).toEqual(["art", "name", "befund"]);
  const by = Object.fromEntries(rows.map((r) => [r.name, r.befund]));
  expect(by.admin_finance_summary).toBe("security_definer, payments, code:zahlung");
  expect(by.admin_geheim).toBe("security_definer, auth.uid(), payments");
  expect(by.admin_kontakt).toBe("");
  // Regeln: nur Codes aus der Positivliste, Unbekanntes nur als Anzahl; Regelnamen werden nicht ausgegeben
  expect(by["meetup_participants #1"]).toBe("angemeldet, teilgenommen, abgesagt, weitere: 1"); // nicht_erschienen ist nicht in der Liste
  const rt = rows.filter((r) => r.name.startsWith("regeltest #")).map((r) => r.befund).sort();
  expect(rt).toEqual(["weitere: 1", "zahlung, weitere: 2"]);
  // Jedes ausgegebene Wort stammt aus unseren Listen (oder ist „weitere: n“) – nie Text aus der Datenbank
  const allowed = new Set(["security_definer", "auth.uid()", "is_admin()", "payments", "is_test_account", "code:zahlung", "code:tester", "angemeldet", "teilgenommen", "abgesagt", "zahlung"]);
  for (const r of rows) {
    for (const w of r.befund.split(", ").filter(Boolean)) expect(allowed.has(w) || /^weitere: \d+$/.test(w), w).toBe(true);
    expect(r.name).toMatch(/^(admin_finance_summary|admin_kontakt|admin_geheim|meetup_participants #\d+|regeltest #\d+)$/);
  }
  const out = JSON.stringify(rows);
  expect(out).not.toMatch(/sk_live|meinpasswort|geheimwert|geheimer_regelname|nicht_erschienen|@|select|from public/i);
  const people = await env.sql`select full_name, email from profiles`;
  expect(people.flatMap((p) => [p.full_name, p.email]).filter((x) => out.includes(x))).toEqual([]);
  // Nur ein lesendes SELECT; Einschleusen über Namen, Begriffe oder Codes unmöglich
  const stmt = q.replace(/--.*$/gm, "").trim();
  expect(stmt).toMatch(/^with f as/);
  expect(stmt).not.toMatch(/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call|set)\b/i);
  expect(() => factsSql({ functions: ["x'; drop table profiles; --"] })).toThrow();
  expect(() => factsSql({ functions: ["a"], terms: ["x$t$; drop"] })).toThrow();
  expect(() => factsSql({ tables: ["a"], codes: ["x'); drop"] })).toThrow();
  expect(() => factsSql({})).toThrow();
  await env.sql.unsafe("drop function public.admin_geheim(); drop table public.regeltest;");
});

test("Probelauf: ausdrückliche Transaktion mit ROLLBACK; leere Kennzahlen sind kein Fehler; Ereignistrigger nach Zuordnung und Inhalt geprüft; nur feste Fehlercodes", async ({}, info) => {
  serverOnly(info);
  test.setTimeout(120_000);
  const port = 54400 + info.parallelIndex;
  const fresh = async () => {
    await env.sql.unsafe("drop database if exists probe with (force)");
    await env.sql.unsafe("create database probe");
    const db = postgres(`postgres://postgres@127.0.0.1:${port}/probe`, { max: 1, onnotice: () => {} });
    for (const f of ["supabase-stub.sql", "fixture.sql"]) await db.unsafe(readFileSync(new URL("./verwaltung/" + f, import.meta.url), "utf8"));
    return db;
  };
  // Ausführung wie im Supabase-SQL-Editor: EIN Aufruf mit mehreren Anweisungen
  const run = async (db, q) => {
    const r = await db.unsafe(q).simple();
    const sets = Array.isArray(r[0]) ? r : [r];
    const rows = sets.filter((x) => x.length && "Prüfung" in x[0]).pop() || [];
    return { rows, by: Object.fromEntries(rows.map((x) => [x["Prüfung"], x["Ergebnis"]])) };
  };
  const snap = (db) =>
    db`select
      (select md5(string_agg(n.nspname || c.relname || c.relkind::text || coalesce(c.relacl::text, ''), '|' order by n.nspname, c.relname)) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname not like 'pg\_%' and n.nspname <> 'information_schema') k,
      (select md5(string_agg(p.proname || md5(p.prosrc) || coalesce(p.proacl::text, ''), '|' order by p.oid)) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname not like 'pg\_%' and n.nspname <> 'information_schema') f,
      (select md5(string_agg(t::text, '|' order by t::text)) from public.profiles t) d1,
      (select md5(string_agg(t::text, '|' order by t::text)) from public.payments t) d2`.then((x) => JSON.stringify(x));
  const frei = async (db) => {
    await db.unsafe("create temp table vl_frei (a int) on commit drop");
    return (await db`select to_regclass('pg_temp.vl_frei') is null as frei`)[0].frei;
  };
  // Erlaubte Ausgabe: nur unsere festen Texte, Zahlen und Fehlercodes – nie Fehlertext der Datenbank
  const clean = (rows) => {
    for (const r of rows) expect(r["Ergebnis"], r["Prüfung"]).toMatch(/^(ok|ja|nein|keine|\d+|funktioniert \((Werte vorhanden|derzeit keine Werte)\)|FEHLER E-(EINR|KZ|PRF|UNERW) \(SQLSTATE [0-9A-Z]{5}\)|\d+( \(bekannter Name, aber abweichend: [a-z_, ]+\))?( \(unbekannter Name: [a-z0-9_, ]+\))? – ABBRUCH E-ET, nichts eingerichtet|NEIN \(PROBLEM\)|\d+ \(PROBLEM\)|ja \(PROBLEM\)|Die Teilnachweise .*ROLLBACK\.|(R[1-6](, R[1-6])*|unbekannt)|OK – alles wird mit ROLLBACK zurückgenommen|PROBLEM \(\d+\) – alles wird mit ROLLBACK zurückgenommen)$/);
    expect(JSON.stringify(rows)).not.toMatch(/gibt_es_nicht|relation|column|does not exist|permission|@|Testperson/i);
  };
  const sql = dryRunSql(TEST_MAPPING);
  // Aufbau: BEGIN … ROLLBACK, kein COMMIT, kein Netzwerk/Benachrichtigung, keine Ausgabe von Fehlertexten
  const stmts = sql.replace(/--.*$/gm, "");
  expect(stmts.trim().startsWith("begin;")).toBe(true);
  expect(stmts.trim().endsWith("rollback;")).toBe(true);
  expect(stmts.replace(/on commit drop/gi, "").match(/\bcommit\b/gi)).toBeNull();
  // keine AUFRUFE von Benachrichtigungs-, Netzwerk-, Datei- oder Sequenzfunktionen (die Wörter kommen nur als Suchmuster der Ereignistrigger-Prüfung vor)
  expect(stmts).not.toMatch(/\b(pg_notify|dblink\w*|http_\w+|net\.\w+|pg_sleep|lo_export|lo_import|nextval|setval|pg_read_\w+|pg_write_\w+)\s*\(/i);
  expect(stmts).not.toMatch(/^\s*(notify|listen|copy)\b/im);
  expect(stmts.match(/\|\|\s*sqlerrm/gi)).toBeNull(); // sqlerrm nur für interne Vergleiche, nie in der Ausgabe

  let db = await fresh();
  try {
    // 1) Normaler Ablauf
    const roleBefore = (await env.sql`select count(*)::int n from pg_roles where rolname = 'management_ai'`)[0].n;
    let before = await snap(db);
    let r = await run(db, sql);
    clean(r.rows);
    expect(r.by["GESAMT"]).toMatch(/^OK/);
    expect(r.by["Einrichtung (probeweise)"]).toBe("ok");
    expect(r.by["Kennzahl reg_total"]).toBe("funktioniert (Werte vorhanden)");
    expect(r.by["Teilnachweis: Schreibvorgänge in Tabellen (auch Warteschlangen für Benachrichtigungen/Netzwerk)"]).toBe("0");
    expect(r.by["Hinweis"]).toContain("kein vollständiger Nachweis");
    expect(await snap(db)).toBe(before);
    expect(await frei(db)).toBe(true);
    expect((await db`select count(*)::int n from pg_namespace where nspname = 'management_ai'`)[0].n).toBe(0);
    expect((await env.sql`select count(*)::int n from pg_roles where rolname = 'management_ai'`)[0].n).toBe(roleBefore);

    // 2) Kennzahlen ohne Daten (kein künftiges Meetup, keine Einladungen): funktioniert, kein Fehler
    await db.unsafe("delete from meetup_participants; delete from meetups where starts_at > now(); delete from invitations;");
    before = await snap(db);
    r = await run(db, sql);
    clean(r.rows);
    expect(r.by["GESAMT"]).toMatch(/^OK/);
    expect(r.by["Kennzahl meetup_days"]).toBe("funktioniert (derzeit keine Werte)");
    expect(r.by["Kennzahl invite_rate"]).toBe("funktioniert (derzeit keine Werte)");
    expect(await snap(db)).toBe(before);

    // 3) Technischer Fehler bei einer Kennzahl (Spalte fehlt): E-KZ mit SQLSTATE, ohne Datenbanktext
    r = await run(db, dryRunSql({ ...TEST_MAPPING, reg_week: { source: "public.admin_stats_daily", date: "day", value: "gibt_es_nicht" } }));
    clean(r.rows);
    expect(r.by["Kennzahl reg_week"]).toBe("FEHLER E-KZ (SQLSTATE 42703)");
    expect(r.by["GESAMT"]).toMatch(/^PROBLEM/);
    expect(await snap(db)).toBe(before);
    expect(await frei(db)).toBe(true);

    // 4) Einrichtung schlägt fehl (Quelle fehlt): E-EINR, nichts bleibt zurück
    r = await run(db, dryRunSql({ ...TEST_MAPPING, reg_week: { source: "public.gibt_es_nicht", date: "d", value: "v" } }));
    clean(r.rows);
    expect(r.by["Einrichtung (probeweise)"]).toMatch(/^FEHLER E-EINR \(SQLSTATE 42P01\)$/);
    expect(await snap(db)).toBe(before);
    expect(await frei(db)).toBe(true);

    // 5) Supabase-Standard-Ereignistrigger (realitätsnah nachgebildet): nach Zuordnung UND Inhalt geprüft → unbedenklich
    await db.unsafe(readFileSync(new URL("./verwaltung/supabase-eventtrigger.sql", import.meta.url), "utf8"));
    const got = [];
    const listener = postgres(`postgres://postgres@127.0.0.1:${port}/probe`, { max: 1, onnotice: () => {} });
    await listener.listen("pgrst", (x) => got.push(x));
    before = await snap(db);
    r = await run(db, sql);
    clean(r.rows);
    expect(r.by["Ereignistrigger: geprüft und unbedenklich (Supabase-Standard, Zuordnung und Inhalt passen)"]).toBe("6");
    expect(r.by["Ereignistrigger: unbekannt oder verändert"]).toBe("0");
    expect(r.by["GESAMT"]).toMatch(/^OK/);
    await new Promise((x) => setTimeout(x, 500));
    expect(got).toEqual([]); // Benachrichtigung „Schema neu laden“ wird ohne Bestätigung nie zugestellt
    await listener.end();
    expect(await snap(db)).toBe(before);
    // Hilfsprüfung: Abbruch E-ET, Einrichtung nie versucht, nichts verändert, Protokolltabelle leer
    await db.unsafe("create table public.vl_et_log (at timestamptz default now())");
    const abort = async (variante, name, fremd = null) => {
      await db.unsafe("delete from public.vl_et_log");
      const b0 = await snap(db);
      const x = await run(db, sql);
      clean(x.rows);
      expect(x.by["Ereignistrigger: unbekannt oder verändert"], variante).toBe("1 " + (name ? "(bekannter Name, aber abweichend: " + name + ") " : "") + (fremd ? "(unbekannter Name: " + fremd + ") " : "") + "– ABBRUCH E-ET, nichts eingerichtet");
      expect(x.by["Einrichtung (probeweise)"], variante).toBeUndefined();
      expect(x.by["GESAMT"], variante).toMatch(/^PROBLEM/);
      expect((await db`select count(*)::int n from public.vl_et_log`)[0].n, variante).toBe(0);
      expect(await snap(db), variante).toBe(b0);
      expect(await frei(db), variante).toBe(true);
    };
    // 5a) bekannter Name, aber veränderter Inhalt (schreibt zusätzlich in eine Tabelle)
    const orig = (await db`select prosrc from pg_proc where proname = 'pgrst_ddl_watch' and pronamespace = 'extensions'::regnamespace`)[0].prosrc;
    await db.unsafe(`create or replace function extensions.pgrst_ddl_watch() returns event_trigger language plpgsql as $f$ begin insert into public.vl_et_log default values; notify pgrst, 'reload schema'; end $f$`);
    await abort("veränderter Inhalt", "pgrst_ddl_watch");
    // 5b) bekannter Name, aber Netzwerkaufruf im Rumpf
    await db.unsafe(`create or replace function extensions.pgrst_ddl_watch() returns event_trigger language plpgsql as $f$ begin if false then perform net.http_post('x'); end if; notify pgrst, 'reload schema'; end $f$`);
    await abort("Netzwerkaufruf", "pgrst_ddl_watch");
    await db.unsafe(`create or replace function extensions.pgrst_ddl_watch() returns event_trigger language plpgsql as $f$${orig}$f$`);
    // 5c) bekannter Name, aber Funktion in einem anderen Schema
    await db.unsafe(`create function public.pgrst_ddl_watch() returns event_trigger language plpgsql as $f$ begin notify pgrst, 'reload schema'; end $f$;
      alter event trigger pgrst_ddl_watch rename to vl_tmp; drop event trigger vl_tmp;
      create event trigger pgrst_ddl_watch on ddl_command_end execute function public.pgrst_ddl_watch();`);
    await abort("anderes Schema", "pgrst_ddl_watch");
    await db.unsafe(`drop event trigger pgrst_ddl_watch; create event trigger pgrst_ddl_watch on ddl_command_end execute function extensions.pgrst_ddl_watch();`);
    // 5d) bekannter Name, aber ohne Befehlsfilter (würde bei jeder Strukturänderung laufen)
    await db.unsafe(`drop event trigger issue_pg_net_access; create event trigger issue_pg_net_access on ddl_command_end execute function extensions.grant_pg_net_access();`);
    await abort("ohne Befehlsfilter", "issue_pg_net_access");
    await db.unsafe(`drop event trigger issue_pg_net_access; create event trigger issue_pg_net_access on ddl_command_end when tag in ('CREATE EXTENSION') execute function extensions.grant_pg_net_access();`);
    // 5e) bekannter Name, aber andere Funktion zugeordnet
    await db.unsafe(`drop event trigger issue_pg_cron_access; create event trigger issue_pg_cron_access on ddl_command_end when tag in ('CREATE EXTENSION') execute function extensions.grant_pg_net_access();`);
    await abort("andere Funktion", "issue_pg_cron_access");
    await db.unsafe(`drop event trigger issue_pg_cron_access; create event trigger issue_pg_cron_access on ddl_command_end when tag in ('CREATE EXTENSION') execute function extensions.grant_pg_cron_access();`);
    // 5f) issue_pg_graphql_access in der ÄLTEREN Supabase-Form (CREATE FUNCTION, Inhalt ohne Netzwerkaufrufe) → unbedenklich
    await db.unsafe(`drop event trigger issue_pg_graphql_access; create event trigger issue_pg_graphql_access on ddl_command_end when tag in ('CREATE FUNCTION') execute function extensions.grant_pg_graphql_access();`);
    expect((await run(db, sql)).by["GESAMT"], "ältere graphql-Form").toMatch(/^OK/);
    // 5g) aktuelle Form (CREATE EXTENSION), aber andere Funktion zugeordnet → Abbruch
    await db.unsafe(`drop event trigger issue_pg_graphql_access; create event trigger issue_pg_graphql_access on ddl_command_end when tag in ('CREATE EXTENSION') execute function extensions.grant_pg_net_access();`);
    await abort("graphql: andere Funktion", "issue_pg_graphql_access");
    // 5h) Befehlsfilter erweitert (CREATE EXTENSION und CREATE TABLE) → Abbruch
    await db.unsafe(`drop event trigger issue_pg_graphql_access; create event trigger issue_pg_graphql_access on ddl_command_end when tag in ('CREATE EXTENSION', 'CREATE TABLE') execute function extensions.grant_pg_graphql_access();`);
    await abort("graphql: Filter erweitert", "issue_pg_graphql_access");
    await db.unsafe(`drop event trigger issue_pg_graphql_access; create event trigger issue_pg_graphql_access on ddl_command_end when tag in ('CREATE EXTENSION') execute function extensions.grant_pg_graphql_access();`);
    // wieder Standard → OK
    expect((await run(db, sql)).by["GESAMT"]).toMatch(/^OK/);
    // Diagnose der Ereignistrigger: nur lesend, nur technische Eigenschaften, kein Programmcode
    const diag = await db.begin("read only", (t) => t.unsafe(eventTriggerDiagSql()));
    expect(diag.map((d) => d.trigger).sort()).toEqual(["issue_graphql_placeholder", "issue_pg_cron_access", "issue_pg_graphql_access", "issue_pg_net_access", "pgrst_ddl_watch", "pgrst_drop_watch"]);
    const g = diag.find((d) => d.trigger === "issue_pg_graphql_access");
    expect(g).toMatchObject({ ereignis: "ddl_command_end", befehlsfilter: "CREATE EXTENSION", status: "aktiv", funktion: "extensions.grant_pg_graphql_access", sprache: "plpgsql", prueft_erweiterung: "pg_graphql" });
    expect(diag.find((d) => d.trigger === "pgrst_ddl_watch").befehle_im_rumpf).toBe("notify");
    for (const d of diag) {
      expect(Object.keys(d)).toEqual(["trigger", "ereignis", "befehlsfilter", "status", "funktion", "sprache", "eigentuemer", "security_definer", "rumpf_pruefsumme", "befehle_im_rumpf", "prueft_erweiterung"]);
      expect(d.rumpf_pruefsumme).toMatch(/^[0-9a-f]{32}$/);
      for (const w of d.befehle_im_rumpf.split(", ").filter(Boolean)) expect(ET_TERMS).toContain(w);
      for (const w of d.prueft_erweiterung.split(", ").filter(Boolean)) expect(ET_EXT).toContain(w);
    }
    expect(JSON.stringify(diag)).not.toMatch(/reload schema|pg_event_trigger_ddl_commands|begin|loop/i);
    const dq = eventTriggerDiagSql().replace(/--.*$/gm, "");
    // genau EINE Anweisung, und zwar ein SELECT (Suchbegriffe wie „insert“ stehen nur als Text in der Begriffsliste)
    expect(dq.trim()).toMatch(/^select /);
    expect(dq.trim().replace(/;\s*$/, "").replace(/\$t\$[^$]*\$t\$/g, "").replace(/'[^']*'/g, "")).not.toContain(";");

    // 5i) ensure_rls (Supabase „RLS automatisch aktivieren“): nur mit exakter Prüfsumme UND unbedenklichem Inhalt
    await db.unsafe(readFileSync(new URL("./verwaltung/supabase-rls-auto.sql", import.meta.url), "utf8"));
    const rlsMd5 = (await db`select md5(prosrc) h from pg_proc where proname = 'rls_auto_enable'`)[0].h;
    const sqlRls = dryRunSql(TEST_MAPPING, [], { rlsAutoMd5: [rlsMd5] });
    r = await run(db, sqlRls);
    clean(r.rows);
    expect(r.by["Ereignistrigger: geprüft und unbedenklich (Supabase-Standard, Zuordnung und Inhalt passen)"]).toBe("7");
    expect(r.by["Ereignistrigger ensure_rls (RLS automatisch aktivieren): geprüft – kann höchstens RLS für neue Tabellen einschalten"]).toBe("ja");
    expect(r.by["GESAMT"]).toMatch(/^OK/);
    // ohne bekannte Prüfsumme (z. B. Funktion verändert) → Abbruch
    const abortWith = async (q, variante, name) => {
      const b0 = await snap(db);
      const x = await run(db, q);
      clean(x.rows);
      expect(x.by["Ereignistrigger: unbekannt oder verändert"], variante).toBe("1 (bekannter Name, aber abweichend: " + name + ") – ABBRUCH E-ET, nichts eingerichtet");
      expect(x.by["Einrichtung (probeweise)"], variante).toBeUndefined();
      expect(await snap(db), variante).toBe(b0);
    };
    await abortWith(sql, "ensure_rls ohne zugelassene Prüfsumme", "ensure_rls");
    expect((await run(db, sql)).by["Ereignistrigger ensure_rls: nicht anerkannt, gescheiterte Prüfungen"]).toBe("R3");
    // Inhalt verändert (führt zusätzlich eine Rechtevergabe aus) – selbst wenn diese Prüfsumme zugelassen wäre → Abbruch
    const rlsSrc = (await db`select prosrc from pg_proc where proname = 'rls_auto_enable'`)[0].prosrc;
    const evil = rlsSrc.replace("execute format('alter table if exists %s enable row level security', cmd.object_identity);", "execute format('alter table if exists %s enable row level security', cmd.object_identity); execute 'grant all on all tables in schema public to anon';");
    await db.unsafe(`create or replace function public.rls_auto_enable() returns event_trigger language plpgsql security definer set search_path = pg_catalog as $f$${evil}$f$`);
    const evilMd5 = (await db`select md5(prosrc) h from pg_proc where proname = 'rls_auto_enable'`)[0].h;
    await abortWith(dryRunSql(TEST_MAPPING, [], { rlsAutoMd5: [evilMd5] }), "ensure_rls mit Rechtevergabe", "ensure_rls");
    expect((await run(db, dryRunSql(TEST_MAPPING, [], { rlsAutoMd5: [evilMd5] }))).by["Ereignistrigger ensure_rls: nicht anerkannt, gescheiterte Prüfungen"]).toBe("R5");
    // Netzwerkaufruf versteckt in einer Zeichenkette → Abbruch
    const evil2 = rlsSrc.replace("execute format('alter table if exists %s enable row level security', cmd.object_identity);", "execute format('alter table if exists %s enable row level security', cmd.object_identity); execute 'select net.http_get(1)';");
    await db.unsafe(`create or replace function public.rls_auto_enable() returns event_trigger language plpgsql security definer set search_path = pg_catalog as $f$${evil2}$f$`);
    const evil2Md5 = (await db`select md5(prosrc) h from pg_proc where proname = 'rls_auto_enable'`)[0].h;
    await abortWith(dryRunSql(TEST_MAPPING, [], { rlsAutoMd5: [evil2Md5] }), "ensure_rls mit Netzwerkaufruf", "ensure_rls");
    // Befehlsfilter erweitert → Abbruch
    await db.unsafe(`create or replace function public.rls_auto_enable() returns event_trigger language plpgsql security definer set search_path = pg_catalog as $f$${rlsSrc}$f$;
      drop event trigger ensure_rls; create event trigger ensure_rls on ddl_command_end when tag in ('CREATE TABLE', 'ALTER TABLE') execute function public.rls_auto_enable();`);
    await abortWith(sqlRls, "ensure_rls Filter erweitert", "ensure_rls");
    expect((await run(db, sqlRls)).by["Ereignistrigger ensure_rls: nicht anerkannt, gescheiterte Prüfungen"]).toBe("R2");
    await db.unsafe(`drop event trigger ensure_rls; create event trigger ensure_rls on ddl_command_end when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') execute function public.rls_auto_enable();`);
    expect((await run(db, sqlRls)).by["GESAMT"]).toMatch(/^OK/);
    await db.unsafe("drop event trigger ensure_rls");

    // 6) Unbekannter Ereignistrigger mit NICHT zurücknehmbarer Wirkung (Sequenz): Abbruch VOR jeder Strukturänderung –
    //    die Sequenz bleibt unverändert, d. h. der Trigger ist nachweislich nie gelaufen (auch nicht für eine Ergebnistabelle)
    await db.unsafe(`create sequence public.vl_et_seq;
      create function public.vl_et_log() returns event_trigger language plpgsql as $$ begin perform nextval('public.vl_et_seq'); insert into public.vl_et_log default values; end $$;
      create event trigger fremder_trigger on ddl_command_end execute function public.vl_et_log();`);
    const seq0 = (await db`select last_value, is_called from public.vl_et_seq`)[0];
    const b6 = await snap(db);
    const r6 = await run(db, sql);
    clean(r6.rows);
    // direkt nach dem Probelauf messen (jede spätere Strukturänderung im Test würde den Trigger selbst auslösen)
    expect((await db`select last_value, is_called from public.vl_et_seq`)[0]).toEqual(seq0);
    expect(r6.by["Ereignistrigger: unbekannt oder verändert"]).toBe("1 (unbekannter Name: fremder_trigger) – ABBRUCH E-ET, nichts eingerichtet");
    expect(r6.by["Einrichtung (probeweise)"]).toBeUndefined();
    expect((await db`select count(*)::int n from public.vl_et_log`)[0].n).toBe(0);
    expect(await snap(db)).toBe(b6);

    // Transaktionsbefehle im Einrichtungs-SQL werden abgelehnt
    expect(() => dryRunSql(TEST_MAPPING, ["commit;"])).toThrow();
  } finally {
    await db.end();
    await env.sql.unsafe("drop database if exists probe with (force)");
  }
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
