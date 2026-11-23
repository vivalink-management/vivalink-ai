// Konflikterkennung: unabhängige Änderungen auf zwei Geräten werden erkannt, angezeigt und nachvollziehbar entschieden.
import { test, expect } from "@playwright/test";
import { guard, seed, nav, state, expectToast } from "./helpers.mjs";
import { v1State, T0 } from "./fixtures.mjs";

let g;
test.beforeEach(async ({ page }) => (g = await guard(page)));
test.afterEach(async () => expect(g.errors).toEqual([]));

async function importText(page, obj) {
  await nav(page, "more");
  await page.fill("#imp", typeof obj === "string" ? obj : JSON.stringify(obj));
  await page.click('button[data-a="imp"]');
  await page.click('button[data-a="impGo"]');
  await expect(page.locator("#sheet")).toBeHidden();
}
/* Gerät B hat Eintrag m2 geändert (neuer Nachfolger mb). */
function deviceBWithEdit() {
  const b = v1State();
  b.dev = "devTestB";
  const m2 = b.memory.find((m) => m.id === "m2");
  m2.active = false;
  m2.supersededBy = "mb";
  m2.updatedAt = T0 + 500;
  b.memory.push({ id: "mb", cat: "Ziele", title: "Testziel Beta (Gerät B)", text: "Version von Gerät B", status: "confirmed", date: "2026-01-11", reason: "", result: "", private: false, active: true, supersedes: "m2", changeReason: "Auf B geändert", createdAt: T0 + 500, updatedAt: T0 + 500 });
  return b;
}
async function editM2Locally(page) {
  await nav(page, "memory");
  await page.locator('.card:has-text("Testziel Beta") button[data-a="editMem"]').click();
  await page.fill("#f-title", "Testziel Beta (Gerät A)");
  await page.fill("#f-cr", "Auf A geändert");
  await page.click('button[data-a="saveMem"]');
}

test("Verzweigung im Gedächtnis: wird erkannt, angezeigt, als Befund gemeldet und entschieden", async ({ page }) => {
  await seed(page, { state: v1State() });
  await editM2Locally(page);
  await importText(page, deviceBWithEdit());
  await expectToast(page, "1 Konflikt(e) zu entscheiden");
  let s = await state(page);
  expect(s.memory.filter((m) => m.active && m.supersedes === "m2")).toHaveLength(2);
  const c = s.conflicts.find((x) => x.kind === "fork");
  expect(c.options.sort()).toHaveLength(2);
  await nav(page, "home");
  await expect(page.locator(".card.rec.bad", { hasText: "Datenkonflikt" })).toBeVisible();
  await nav(page, "more");
  const card = page.locator(`[data-conflict="${c.id}"]`);
  await expect(card).toContainText("Testziel Beta (Gerät A)");
  await expect(card).toContainText("Testziel Beta (Gerät B)");
  await card.locator('button[data-v="mb"]').click();
  await expectToast(page, "Konflikt entschieden");
  s = await state(page);
  const a = s.memory.find((m) => m.title === "Testziel Beta (Gerät A)");
  expect(a.active).toBe(false);
  expect(a.discarded).toBeTruthy();
  expect(s.memory.find((m) => m.id === "mb").active).toBe(true);
  expect(s.memory.find((m) => m.id === "m2").supersededBy).toBe("mb");
  expect(s.conflicts.find((x) => x.id === c.id)).toMatchObject({ resolved: true, choice: "mb" });
  expect(await page.evaluate(() => integrity().filter((i) => i.sev >= 2))).toEqual([]);
  await expect(page.locator("#app")).toContainText("Keine offenen Konflikte");
  // Nichts gelöscht: verworfene Version bleibt im Verlauf sichtbar
  expect(s.memory).toHaveLength(6);
});

test("Verzweigung: „Beide behalten“ lässt beide Versionen aktiv", async ({ page }) => {
  await seed(page, { state: v1State() });
  await editM2Locally(page);
  await importText(page, deviceBWithEdit());
  await nav(page, "more");
  await page.locator('button[data-a="cfx"][data-v="both"]').click();
  const s = await state(page);
  expect(s.memory.filter((m) => m.active && m.supersedes === "m2")).toHaveLength(2);
  expect(s.conflicts.every((c) => c.resolved)).toBe(true);
});

test("Aufgabe auf zwei Geräten geändert: neuere gilt, andere bleibt wählbar, kein Wiederauftauchen", async ({ page }) => {
  await seed(page, { state: v1State() });
  await nav(page, "tasks");
  await page.locator('.card:has-text("Testaufgabe Eins") button[data-a="toggle"]').click();
  await expect(page.getByText("Erledigt (2)")).toBeVisible();
  const b = v1State();
  b.tasks[0] = { ...b.tasks[0], title: "Testaufgabe Eins (auf B umbenannt)", updatedAt: Date.now() + 60000, revs: [T0] };
  await importText(page, b);
  let s = await state(page);
  expect(s.tasks.find((t) => t.id === "t1").title).toBe("Testaufgabe Eins (auf B umbenannt)");
  const c = s.conflicts.find((x) => x.coll === "tasks");
  expect(c.other.done).toBe(true);
  await nav(page, "more");
  await expect(page.locator(`[data-conflict="${c.id}"]`)).toContainText("Andere Version");
  await page.locator(`[data-conflict="${c.id}"] button[data-v="other"]`).click();
  s = await state(page);
  const t1 = s.tasks.find((t) => t.id === "t1");
  expect(t1).toMatchObject({ title: "Testaufgabe Eins", done: true });
  // Dasselbe alte Backup noch einmal: kein neuer Konflikt, Entscheidung bleibt bestehen
  await importText(page, b);
  s = await state(page);
  expect(s.conflicts.filter((x) => !x.resolved)).toHaveLength(0);
  expect(s.tasks.find((t) => t.id === "t1").title).toBe("Testaufgabe Eins");
});

test("Reine Weiterentwicklung auf dem anderen Gerät ist kein Konflikt", async ({ page }) => {
  await seed(page, { state: v1State() });
  const b = v1State();
  // B hat den Stand von A übernommen und t1 zweimal geändert
  b.tasks[0] = { ...b.tasks[0], title: "Zweimal geändert", updatedAt: T0 + 200, revs: [T0, T0 + 100] };
  await importText(page, b);
  await expectToast(page, "1 Einträge übernommen");
  const s = await state(page);
  expect(s.conflicts).toEqual([]);
  expect(s.tasks.find((t) => t.id === "t1").title).toBe("Zweimal geändert");
});

test("Ältere Daten ohne Änderungshistorie: unterschiedliche Stände werden als möglicher Konflikt gemeldet", async ({ page }) => {
  await seed(page, { state: v1State() });
  const b = v1State();
  b.tasks[1] = { ...b.tasks[1], title: "Auf B geändert (alte Version)", updatedAt: T0 + 999 };
  await importText(page, b);
  const s = await state(page);
  const c = s.conflicts.find((x) => x.coll === "tasks");
  expect(c.other.title).toBe("Testaufgabe Zwei");
  expect(c.kept.title).toBe("Auf B geändert (alte Version)");
});

test("Kennzahl-Ziel auf zwei Geräten geändert: Konflikt mit Rücknahme", async ({ page }) => {
  await seed(page, { state: v1State() });
  await page.click('[data-a="met"][data-id="m_signups"]');
  await page.fill("#v-g", "30");
  await page.click('button[data-a="saveGoal"]');
  await page.click('#sheet button[data-a="close"]');
  const s0 = await state(page);
  const b = JSON.parse(JSON.stringify(s0));
  const m = b.metrics.find((x) => x.id === "m_signups");
  m.goal = "99";
  m.goalAt = Date.now() + 5000;
  m.goalRevs = [];
  await importText(page, b);
  let s = await state(page);
  expect(s.metrics.find((x) => x.id === "m_signups").goal).toBe("99");
  const c = s.conflicts.find((x) => x.coll === "metric-goal");
  expect(c.other.goal).toBe("30");
  await nav(page, "more");
  await page.locator(`[data-conflict="${c.id}"] button[data-v="other"]`).click();
  s = await state(page);
  expect(s.metrics.find((x) => x.id === "m_signups").goal).toBe("30");
});

test("Kennzahl-Wert auf zwei Geräten geändert: Konflikt wird erkannt", async ({ page }) => {
  const a = v1State();
  a.v = 2;
  a.metrics = [{ id: "m_attend", key: "attend", name: "Tatsächliche Teilnehmer pro Meetup", unit: "", dir: "up", goal: "", updatedAt: T0, entries: [{ id: "ex", date: "2026-01-05", value: 8, status: "confirmed", src: "manual", note: "", updatedAt: T0 + 50, revs: [T0] }] }];
  await seed(page, { state: a });
  const b = JSON.parse(JSON.stringify(a));
  b.metrics[0].entries[0] = { ...b.metrics[0].entries[0], value: 10, updatedAt: T0 + 60, revs: [T0] };
  await importText(page, b);
  const s = await state(page);
  const c = s.conflicts.find((x) => x.coll === "metric-entry");
  expect(c).toMatchObject({ mid: "m_attend", ref: "ex" });
  expect(c.other.value).toBe(8);
  await nav(page, "more");
  await expect(page.locator(`[data-conflict="${c.id}"]`)).toContainText("Tatsächliche Teilnehmer pro Meetup");
});

test("Beim Start: bereits vorhandene Verzweigungen werden erkannt", async ({ page }) => {
  const s = v1State();
  s.memory.push({ id: "mx", cat: "Ziele", title: "Zweiter Nachfolger", text: "", status: "confirmed", date: "2026-01-09", reason: "", result: "", private: false, active: true, supersedes: "m1", createdAt: T0 + 40, updatedAt: T0 + 40 });
  s.memory.find((m) => m.id === "m2").active = true;
  await seed(page, { state: s });
  const st = await state(page);
  expect(st.conflicts.filter((c) => c.kind === "fork")).toHaveLength(1);
});
