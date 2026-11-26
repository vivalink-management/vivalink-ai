// Mehr Selbstständigkeit: strategische Empfehlungen aus Verhältnissen echter Kennzahlen, weniger wiederholte
// Eingabe-Hinweise, zusätzliche eindeutige Selbstreparaturen (mit Rückgängig-Punkt). Nur künstliche Daten.
import { test, expect } from "@playwright/test";
import { seed, state } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";

const NOW = new Date("2026-03-10T09:00:00");
async function setup(page, mutate) {
  await page.clock.setFixedTime(NOW);
  await seed(page, { state: v2State() });
  if (mutate) await page.evaluate(mutate);
}
const ids = (page) => page.evaluate(() => findings().map((f) => f.id));
const put = (vals, date = "2026-03-09", src = "verwaltung") =>
  `for (const [k, v] of Object.entries(${JSON.stringify(vals)})) addVal(S.metrics.find((m) => m.key === k).id, { date: "${date}", value: v, status: "confirmed", src: "${src}" });`;

test("Empfehlungen aus Verhältnissen: Absage-, Erstattungs-, Aktivierungs- und Annahmequote (nur mit aktuellen Werten)", async ({ page }) => {
  await setup(page, new Function(put({ noshow: 4, signups: 10, refunds: 30, payments: 150, active_users: 20, reg_total: 120, invite_rate: 12 })));
  let f = await ids(page);
  for (const id of ["q-noshow", "q-refund", "q-active", "q-invite"]) expect(f, id).toContain(id);
  // Erklärung und Maßnahmen vorhanden, als Annahme gekennzeichnet
  const e = await page.evaluate(() => findings().filter((x) => x.id.startsWith("q-")).map((x) => ({ id: x.id, kind: x.kind, m: enrich(x).measures.length })));
  expect(e.every((x) => x.kind === "annahme" && x.m > 0)).toBe(true);
  // Unauffällige Werte → keine Empfehlung
  await page.evaluate(new Function(put({ noshow: 1, signups: 10, refunds: 5, payments: 150, active_users: 80, reg_total: 120, invite_rate: 35 })));
  f = await ids(page);
  expect(f.filter((x) => x.startsWith("q-"))).toEqual([]);
});

test("Veraltete Werte (über 10 Tage) ergeben keine Quoten-Empfehlung", async ({ page }) => {
  await setup(page, new Function(put({ noshow: 6, signups: 10 }, "2026-02-20")));
  expect((await ids(page)).filter((x) => x.startsWith("q-"))).toEqual([]);
});

test("Weniger wiederholte Hinweise: nie genutzte Kennzahlen ohne Ziel werden nicht dauernd nachgefragt", async ({ page }) => {
  await setup(page);
  const before = await page.evaluate(() => (findings().find((x) => x.id === "m-nv") || { why: [] }).why);
  await page.evaluate(new Function(put({ reg_total: 100, reg_week: 5, signups: 8 }, "2026-03-09", "manual")));
  const after = await page.evaluate(() => findings().find((x) => x.id === "m-nv"));
  // genutzt werden 3+ Kennzahlen → nie gefüllte ohne Ziel verschwinden aus dem Hinweis; mit Ziel bleiben sie
  expect(after ? after.why.length : 0).toBeLessThan(before.length);
  await page.evaluate(() => (S.metrics.find((m) => m.key === "web").goal = "500"));
  expect(await page.evaluate(() => (findings().find((x) => x.id === "m-nv") || { why: [] }).why)).toContain("Website-Besucher");
});

test("Selbstreparatur: exakt doppelte Kennzahl-Einträge (z. B. nach dem Zusammenführen) und Konflikte zu gelöschten Einträgen", async ({ page }) => {
  await setup(page, () => {
    const m = S.metrics.find((x) => x.key === "signups");
    m.entries.push({ id: "d1", date: "2026-03-09", value: 7, status: "confirmed", src: "verwaltung", note: "", updatedAt: 1 });
    m.entries.push({ id: "d2", date: "2026-03-09", value: 7, status: "confirmed", src: "verwaltung", note: "", updatedAt: 1 });
    m.entries.push({ id: "d3", date: "2026-03-09", value: 8, status: "confirmed", src: "manual", note: "", updatedAt: 1 }); // anderer Wert/Quelle: bleibt
    S.conflicts.push({ id: "c-x", key: "tasks:weg:1", kind: "record", coll: "tasks", ref: "gibt-es-nicht", kept: {}, other: {}, at: 1, resolved: false });
    S.conflicts.push({ id: "c-ok", key: "tasks:" + S.tasks[0].id + ":1", kind: "record", coll: "tasks", ref: S.tasks[0].id, kept: {}, other: {}, at: 1, resolved: false });
  });
  const r = await page.evaluate(() => autoRepair());
  expect(r).toMatchObject({ ok: true, n: 2 });
  const s = await state(page);
  const e = s.metrics.find((x) => x.key === "signups").entries;
  expect(e.find((x) => x.id === "d1").deleted).toBeFalsy(); // deterministisch: der erste bleibt
  expect(e.find((x) => x.id === "d2").deleted).toBe(true); // markiert, nicht entfernt
  expect(e.find((x) => x.id === "d3").deleted).toBeFalsy();
  expect(s.conflicts.find((c) => c.id === "c-x").resolved).toBe(true);
  expect(s.conflicts.find((c) => c.id === "c-ok").resolved).toBe(false);
  // Rückgängig-Punkt und Protokoll
  expect(await page.evaluate(() => ACTIONS.some((a) => a.name === "repair.auto" && a.ok))).toBe(true);
  expect(await page.evaluate(async () => (await kvGet("pre-import")).label)).toBe("Automatische Reparatur");
  // zweiter Lauf: nichts mehr zu tun
  expect(await page.evaluate(() => autoRepair())).toMatchObject({ n: 0 });
});

test("Instagram-Entwürfe richten sich nach den Kennzahlen: Schwerpunkt im Auftrag, ohne Zahlen preiszugeben", async ({ page }) => {
  await setup(page, () => {
    S.meetup = { ...S.meetup, date: "2026-03-14", place: "Testort", goal: "20", updatedAt: 1 };
    S.studio = { brand: { region: "Testregion", signup: "Registrierung über vivalink.me", colorsConfirmed: true, website: "vivalink.me" }, settings: {}, posts: [], learned: {} };
    migrate();
    addVal(S.metrics.find((m) => m.key === "signups").id, { date: "2026-03-09", value: 6, status: "confirmed", src: "verwaltung" });
  });
  let p = await page.evaluate(() => studioPrompt(today().slice(0, 7)));
  expect(p).toContain("SCHWERPUNKT");
  expect(p).toContain("braucht noch Anmeldungen");
  expect(p).not.toMatch(/\b6 (von|Anmeldungen)/); // keine Anmeldezahl im Auftrag
  // gut gefüllt → nicht weiter werben
  await page.evaluate(() => addVal(S.metrics.find((m) => m.key === "signups").id, { date: "2026-03-10", value: 21, status: "confirmed", src: "verwaltung" }));
  p = await page.evaluate(() => studioPrompt(today().slice(0, 7)));
  expect(p).toContain("gut gefüllt");
  // ohne aktuelle Kennzahlen kein Schwerpunkt-Abschnitt
  await page.evaluate(() => S.metrics.forEach((m) => (m.entries = [])));
  expect(await page.evaluate(() => studioPrompt(today().slice(0, 7)))).not.toContain("SCHWERPUNKT");
});
