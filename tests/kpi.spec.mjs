// Anbindung der Verwaltung: nur zusammengefasste Kennzahlen, Kopplung per Einmalcode, strikte Ablehnung von Personendaten.
import { test, expect } from "@playwright/test";
import { ready, state, kv, expectToast } from "./helpers.mjs";

async function dev(browser, variant) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript((u) => (window.VL_KPI_URL = u), "http://127.0.0.1:4173/kpi/" + variant);
  const p = await ctx.newPage();
  await p.goto("/");
  await ready(p);
  return p;
}
const vals = (s, key) => s.metrics.find((m) => m.key === key).entries.filter((e) => !e.deleted);

test("Kopplung, Abruf und Speicherung als Historie (Quelle „verwaltung“), keine Doppelungen", async ({ browser }) => {
  const p = await dev(browser, "ok");
  expect(await p.evaluate(() => kpiPair("000000"))).toMatchObject({ ok: false, error: "Code ungültig oder abgelaufen" });
  expect(await p.evaluate(() => kpiPair("123456"))).toEqual({ ok: true });
  const r = await p.evaluate(() => kpiSync());
  expect(r).toMatchObject({ ok: true, n: 3, ignored: 1 });
  const s = await state(p);
  expect(vals(s, "reg_total")[0]).toMatchObject({ value: 321, date: "2026-03-09", src: "verwaltung", status: "confirmed" });
  expect(vals(s, "active_users")[0].value).toBe(88);
  expect(vals(s, "invite_rate")[0].value).toBe(41.5);
  await p.evaluate(() => kpiSync());
  expect(vals(await state(p), "reg_total")).toHaveLength(1);
  // Zugang steht nicht in Backup oder synchronisierten Daten
  const bk = await p.evaluate(async () => JSON.stringify(await makeBackup()));
  expect(bk).not.toContain("ab".repeat(32));
});

for (const [variant, msg] of [["pii", "Unerwartete Felder in einem Wert"], ["extra", "Unerwartete Felder (users)"]])
  test(`Antwort mit möglichen Personendaten (${variant}) wird vollständig abgelehnt`, async ({ browser }) => {
    const p = await dev(browser, variant);
    await p.evaluate(() => kpiPair("123456"));
    const r = await p.evaluate(() => kpiSync());
    expect(r.ok).toBe(false);
    expect(r.error).toContain(msg);
    const s = await state(p);
    expect(s.metrics.every((m) => m.entries.length === 0)).toBe(true);
    expect(await p.evaluate(() => LOG.some((e) => e.code === "kpi.reject"))).toBe(true);
  });

test("Prüfregeln der Schnittstelle (ohne Netz)", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const r = await page.evaluate(() => [
    validateKpis({ format: "vivalink-kpis", version: 1, values: [{ key: "reg_total", date: "2026-01-01", value: 1 }] }).ok,
    validateKpis({ format: "vivalink-kpis", version: 1, values: [{ key: "reg_total", date: "gestern", value: 1 }] }).ok,
    validateKpis({ format: "vivalink-kpis", version: 1, values: [{ key: "reg_total", date: "2026-01-01", value: "1" }] }).ok,
    validateKpis({ format: "vivalink-kpis", version: 1, values: [{ key: "reg_total", date: "2026-01-01", value: 1, source: "max@example.invalid" }] }).ok,
    validateKpis({ format: "anders", version: 1, values: [] }).ok,
    validateKpis({ format: "vivalink-kpis", version: 1, values: [], meta: { userList: [] } }).ok,
  ]);
  expect(r).toEqual([true, false, false, false, false, false]);
  expect(await page.evaluate(() => kpiSync())).toMatchObject({ ok: false, error: "Nicht eingerichtet" });
});

// ---------- Gegenstelle der Verwaltung (server/kpi-core.mjs, spätere Edge Function) mit künstlichen Daten ----------
import { handleKpi, memoryRepo, buildKpis, MAX_CALLS_PER_HOUR } from "../server/kpi-core.mjs";

test("Gegenstelle: Kopplung einmalig und befristet, nur erlaubte Kennzahlen, Widerruf und Begrenzung", async () => {
  const repo = memoryRepo([
    { key: "reg_total", date: "2026-03-09", value: 321 },
    { key: "email", date: "2026-03-09", value: 1 },
    { key: "reg_week", date: "kein-datum", value: 5 },
    { key: "active_users", date: "2026-03-09", value: "x" },
  ]);
  const t0 = 1_000_000;
  await repo.addCode("123456", t0 + 600_000);
  await repo.addCode("654321", t0 - 1);
  const pair = (code, now = t0) => handleKpi({ method: "POST", path: "/pair", body: JSON.stringify({ code, device: "iPhone" }), now }, repo);
  expect((await pair("999999")).status).toBe(401);
  expect((await pair("654321")).status).toBe(410); // abgelaufen
  const ok = await pair("123456");
  expect(ok.status).toBe(200);
  const token = JSON.parse(ok.body).token;
  expect(token).toMatch(/^[0-9a-f]{64}$/);
  expect((await pair("123456")).status).toBe(410); // nur einmal
  expect([...repo.devices.values()][0]).not.toHaveProperty("token"); // nur Hash gespeichert
  const get = (tok, now = t0) => handleKpi({ method: "GET", path: "/kpis", auth: "Bearer " + tok, now }, repo);
  const r = JSON.parse((await get(token)).body);
  expect(r).toMatchObject({ format: "vivalink-kpis", version: 1, meta: { excludesTestAccounts: true } });
  expect(r.values).toEqual([{ key: "reg_total", date: "2026-03-09", value: 321, source: "verwaltung" }]); // alles andere verworfen
  expect(Object.keys(r).sort()).toEqual(["format", "generatedAt", "meta", "values", "version"]);
  expect((await get("f".repeat(64))).status).toBe(401);
  for (let i = 0; i < MAX_CALLS_PER_HOUR; i++) await get(token, t0 + 1000);
  expect((await get(token, t0 + 2000)).status).toBe(429);
  expect((await get(token, t0 + 3700_000)).status).toBe(200); // nach einer Stunde wieder
  repo.revokeAll();
  expect((await get(token, t0 + 7400_000)).status).toBe(401);
  expect(buildKpis([{ key: "invite_rate", date: "2026-03-09", value: 41.456 }]).values[0].value).toBe(41.46);
});

test("App ↔ Gegenstelle: koppeln in der Oberfläche, Werte als Historie, automatischer Abruf höchstens alle 6 Stunden, Widerruf erkannt", async ({ browser }) => {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript((u) => (window.VL_KPI_URL = u), "http://127.0.0.1:4173/kpi-core");
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date("2026-03-10T10:00:00"));
  await p.goto("/");
  await ready(p);
  await p.click('nav button[data-id="more"]');
  await p.click('button[data-a="kpi"]');
  await p.fill("#kpCode", "135790");
  await p.click('button[data-a="kpPair"]');
  await expectToast(p, "Code ungültig oder abgelaufen");
  const code = await (await p.request.get("http://127.0.0.1:4173/kpi-core/__code")).text();
  await p.fill("#kpCode", code);
  await p.click('button[data-a="kpPair"]');
  await expectToast(p, "Gekoppelt · 4 Werte übernommen");
  await expect(p.locator("#sheet")).toContainText("gekoppelt");
  let st = await state(p);
  const vals = (k) => st.metrics.find((m) => m.key === k).entries.filter((e) => e.src === "verwaltung").map((e) => e.value);
  expect(vals("reg_total")).toEqual([321]);
  expect(vals("invite_rate")).toEqual([41.46]);
  // Zyklus: innerhalb von 6 Stunden kein erneuter Abruf, danach schon – ohne Doppelungen
  const before = await p.evaluate(() => ACTIONS.filter((a) => a.name === "kpi.fetch").length);
  await p.evaluate(() => runCycle("test"));
  expect(await p.evaluate(() => ACTIONS.filter((a) => a.name === "kpi.fetch").length)).toBe(before);
  await p.clock.setFixedTime(new Date("2026-03-10T17:00:00"));
  const rep = await p.evaluate(() => runCycle("test"));
  expect(rep.steps[0].note).toContain("Kennzahlen aus der Verwaltung");
  st = await state(p);
  expect(vals("reg_total")).toEqual([321]);
  // Widerruf in der Verwaltung → App meldet es, Kennzahlen bleiben
  await p.request.get("http://127.0.0.1:4173/kpi-core/__revoke?t=" + (await kv(p, "kpi-config")).token);
  const r = await p.evaluate(() => kpiSync());
  expect(r).toMatchObject({ ok: false, error: expect.stringContaining("widerrufen") });
  expect(vals("reg_total")).toEqual([321]);
  await ctx.close();
});

// ---------- Nächstes Meetup automatisch aus der Verwaltung (Datum, Ziel = Plätze); eigene Eingaben haben Vorrang ----------
async function meetupDev(browser, meetup) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript(() => (window.VL_KPI_URL = "http://127.0.0.1:4173/kpi/meetup-5-15"));
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date("2026-03-10T10:00:00"));
  await p.goto("/");
  await ready(p);
  if (meetup) await p.evaluate(async (m) => ((S.meetup = { ...S.meetup, ...m, updatedAt: 1 }), await save()), meetup);
  await p.evaluate(() => kpiPair("123456"));
  return p;
}
const setUrl = (p, v) => p.evaluate((u) => (window.VL_KPI_URL = u), "http://127.0.0.1:4173/kpi/" + v);

test("Meetup-Karte füllt sich aus der Verwaltung: leer → Datum und Ziel; Verschiebung folgt; eigenes Ziel bleibt", async ({ browser }) => {
  const p = await meetupDev(browser);
  const r = await p.evaluate(() => kpiSync());
  expect(r).toMatchObject({ ok: true, meetup: "Meetup-Datum aus der Verwaltung übernommen" });
  expect((await state(p)).meetup).toMatchObject({ date: "2026-03-14", goal: "15", place: "" });
  expect(await p.evaluate(() => ACTIONS.some((a) => a.name === "meetup.auto" && a.ok))).toBe(true);
  // Kennzahl-Karten entstehen für diese Angaben nicht
  expect(await p.evaluate(() => S.metrics.some((m) => /meetup_/.test(m.key)))).toBe(false);
  // Verschiebung in der Verwaltung → automatisch gesetztes Datum folgt
  await setUrl(p, "meetup-6-15");
  await p.evaluate(() => kpiSync());
  expect((await state(p)).meetup.date).toBe("2026-03-15");
  // Eigenes Ziel und eigener Ort bleiben bei weiteren Abrufen erhalten
  await p.evaluate(async () => ((S.meetup.goal = "20"), (S.meetup.place = "Testcafé"), touch(S.meetup), await save()));
  await setUrl(p, "meetup-6-18");
  await p.evaluate(() => kpiSync());
  expect((await state(p)).meetup).toMatchObject({ date: "2026-03-15", goal: "20", place: "Testcafé" });
});

test("Selbst eingetragenes Datum wird nie überschrieben; Abweichung erscheint als Hinweis und verschwindet nach Korrektur", async ({ browser }) => {
  const p = await meetupDev(browser, { date: "2026-03-20", place: "Eigener Ort", goal: "10" });
  const r = await p.evaluate(() => kpiSync());
  expect(r.meetup).toBe("Meetup-Datum weicht von der Verwaltung ab");
  expect((await state(p)).meetup).toMatchObject({ date: "2026-03-20", place: "Eigener Ort", goal: "10" });
  const f = await p.evaluate(() => findings().find((x) => x.id === "mt-verw"));
  expect(f.action).toContain("14.3.2026");
  await p.evaluate(async () => ((S.meetup.date = "2026-03-14"), touch(S.meetup), await save()));
  await p.evaluate(() => kpiSync());
  expect(await p.evaluate(() => findings().some((x) => x.id === "mt-verw"))).toBe(false);
});

test("Vergangenes Meetup: Angaben werden archiviert, das nächste Meetup aus der Verwaltung übernommen", async ({ browser }) => {
  const p = await meetupDev(browser, { date: "2026-03-01", place: "Alter Ort", goal: "8", note: "Rückblick offen" });
  await p.evaluate(() => kpiSync());
  expect((await state(p)).meetup).toMatchObject({ date: "2026-03-14", goal: "15", place: "", note: "" });
  const h = await kv(p, "meetup-history");
  expect(h[h.length - 1]).toMatchObject({ date: "2026-03-01", place: "Alter Ort", goal: "8", note: "Rückblick offen" });
});

test("Unsicherheit bei Testkonten wird gekennzeichnet (Verwaltung meldet „Testkonten nicht sicher ausgeschlossen“)", async ({ browser }) => {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript(() => (window.VL_KPI_URL = "http://127.0.0.1:4173/kpi/ok"));
  const p = await ctx.newPage();
  await p.goto("/");
  await ready(p);
  await p.evaluate(() => kpiPair("123456"));
  await p.route("**/kpi/ok/kpis", async (route) => {
    const r = await route.fetch();
    const j = await r.json();
    j.meta.excludesTestAccounts = false;
    await route.fulfill({ response: r, json: j });
  });
  expect((await p.evaluate(() => kpiSync())).ok).toBe(true);
  await p.click('nav button[data-id="more"]');
  await p.click('button[data-a="kpi"]');
  await expect(p.locator("#kpTest")).toContainText("Abweichungen zum Admin-Dashboard");
  expect(await p.evaluate(() => weeklyReport().text)).toContain("ob weitere Testkonten enthalten sind, ist nicht bekannt");
  await ctx.close();
});
