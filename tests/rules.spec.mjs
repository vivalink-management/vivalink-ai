// Regelmotor mit fester Testuhr: dieselben Daten ergeben immer dieselben Befunde.
import { test, expect } from "@playwright/test";
import { guard, seed, nav, state } from "./helpers.mjs";

const NOW = new Date("2026-03-10T10:00:00");
const day = (d) => new Date(NOW.getTime() + d * 864e5).toLocaleDateString("sv-SE");

function scenario() {
  const old = NOW.getTime() - 20 * 864e5;
  const e = (id, d, v) => ({ id, date: day(d), value: v, status: "confirmed", src: "manual", note: "", updatedAt: old });
  return {
    v: 3, dev: "devRules", accent: "", lastBackup: day(-40), suggest: {}, conflicts: [],
    memory: [
      { id: "d1", cat: "Entscheidung", title: "Testentscheidung", text: "", status: "confirmed", date: day(-30), reason: "", result: "", private: false, active: true, createdAt: old, updatedAt: old },
      { id: "u1", cat: "Ziele", title: "Unklarer Testeintrag", text: "", status: "unknown", date: day(-1), reason: "", result: "", private: false, active: true, createdAt: old, updatedAt: old },
    ],
    tasks: [
      { id: "o1", title: "Überfällige Testaufgabe", prio: "hoch", area: "App", due: day(-3), done: false, updatedAt: old },
      { id: "h1", title: "Wichtige Testaufgabe ohne Frist", prio: "hoch", area: "App", due: "", done: false, updatedAt: NOW.getTime() },
    ],
    metrics: [
      { id: "m_reg_week", key: "reg_week", name: "Neue Registrierungen pro Woche", unit: "", dir: "up", goal: "20", updatedAt: old, entries: [e("w1", -21, 12), e("w2", -14, 10), e("w3", -7, 8), e("w4", 0, 6)] },
      { id: "m_signups", key: "signups", name: "Anmeldungen pro Meetup", unit: "", dir: "up", goal: "", updatedAt: old, entries: [e("s1", 0, 4)] },
    ],
    meetup: { date: day(5), place: "Testort", goal: "20", note: "", updatedAt: old },
  };
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test("Erwartete Befunde werden erkannt und richtig als Fakt bzw. Annahme gekennzeichnet", async ({ page }) => {
  const g = await guard(page);
  await seed(page, { state: scenario() });
  const F = await page.evaluate(() => findings().map((f) => ({ id: f.id, kind: f.kind, sev: f.sev })));
  const ids = F.map((f) => f.id);
  for (const id of ["t-od", "t-hn", "t-st", "g-gap", "g-un", "g-nr", "m-tr-reg_week", "mt-pace", "bk"]) expect(ids, id).toContain(id);
  expect(F.find((f) => f.id === "mt-pace")).toMatchObject({ kind: "annahme", sev: 3 });
  expect(F.find((f) => f.id === "t-od")).toMatchObject({ kind: "fakt", sev: 3 });
  expect(F.find((f) => f.id === "m-tr-reg_week")).toMatchObject({ kind: "fakt", sev: 2 });
  // Sortierung: schwerste zuerst, bei Gleichstand Fakt vor Annahme
  expect(F[0].id).toBe("t-od");
  // Startseite zeigt höchstens 3 Hinweise, maximal 2 je Bereich
  await expect(page.locator('#app .card:has(button[data-a="mk"])')).toHaveCount(3);
  expect(g.errors).toEqual([]);
});

test("Befund mit offener Aufgabe oder Ausblendung erscheint nicht erneut", async ({ page }) => {
  await seed(page, { state: scenario() });
  await page.locator('button[data-a="mk"][data-id="t-od"]').click();
  await expect(page.locator('button[data-a="mk"][data-id="t-od"]')).toHaveCount(0);
  const t = (await state(page)).tasks.find((x) => x.fid === "t-od");
  expect(t).toMatchObject({ prio: "hoch", due: day(3), src: "regelmotor" });
  await page.locator('button[data-a="nope"]').first().click();
  const ids = await page.evaluate(() => findings().map((f) => f.id));
  const sup = Object.keys((await state(page)).suggest);
  for (const s of sup) expect(ids).not.toContain(s);
});

test("Ohne Auffälligkeiten: „Aktuell kein Handlungsbedarf erkannt“", async ({ page }) => {
  const s = scenario();
  s.tasks = [];
  s.memory = ["Ziele", "Geschäftsmodell", "Finanzen", "Meetup", "Marketing", "Instagram", "App", "Webseite"].map((c, i) => ({ id: "k" + i, cat: c, title: "Testwissen " + c, text: "", status: "confirmed", date: day(-1), reason: "", result: "", private: false, active: true, createdAt: 1, updatedAt: 1 }));
  s.metrics = [];
  s.meetup = { date: day(40), place: "Testort", goal: "10", note: "", updatedAt: 1 };
  s.lastBackup = day(0);
  // Studio vollständig eingerichtet und Beitrag für die nächsten Tage freigegeben
  s.studio = { posts: [{ id: "p1", status: "freigegeben", source: "ki", date: day(2), time: "18:00", pillar: "tipps", type: "einzelbild", title: "Testbeitrag", hook: "", slides: [{ template: "frage", title: "Testfrage", text: "" }], caption: "Test", hashtags: [], updatedAt: 1 }], brand: { region: "Testregion", signup: "Registrierung über die Test-Website", colorsConfirmed: true }, settings: {}, learned: {} };
  await seed(page, { state: s });
  const ids = await page.evaluate(() => findings().map((f) => f.id));
  expect(ids.filter((i) => !i.startsWith("m-nv"))).toEqual([]);
  await nav(page, "home");
});
