// Management: „Heute zu tun“ mit Begründung, Entscheidungen, Entwicklungen, Aufgaben bearbeiten/löschen mit
// Abhängigkeiten, Risiken je Maßnahme, Vergleich mit dem Zeitraum davor, weniger wiederholte Hinweise. Nur künstliche Daten.
import { test, expect } from "@playwright/test";
import { guard, seed, nav, state, expectToast } from "./helpers.mjs";

const NOW = new Date("2026-03-10T10:00:00");
const day = (n) => new Date(NOW.getTime() + n * 864e5).toLocaleDateString("sv-SE");
const old = NOW.getTime() - 20 * 864e5;
const task = (id, title, extra = {}) => ({ id, title, prio: "mittel", area: "App", due: "", done: false, updatedAt: old, ...extra });
function scen() {
  return {
    v: 4, dev: "devA", accent: "", lastBackup: "", suggest: {}, conflicts: [], memory: [],
    tasks: [task("t-a", "Flyer drucken", { due: day(-2), prio: "hoch" }), task("t-b", "Flyer verteilen", { due: day(-1), after: "t-a" }), task("t-c", "Heute fällig", { due: day(0) })],
    metrics: [{ id: "m_regw", key: "reg_week", name: "Neue Registrierungen pro Woche", unit: "", dir: "up", goal: "", updatedAt: old, entries: [{ id: "e1", date: day(-8), value: 10, status: "confirmed", src: "manual", note: "", updatedAt: old }, { id: "e2", date: day(0), value: 15, status: "confirmed", src: "manual", note: "", updatedAt: old }] }],
    meetup: null,
    studio: { brand: { region: "Testregion", signup: "Registrierung über vivalink.me", colorsConfirmed: true }, settings: {}, posts: [], learned: {} },
  };
}
test.beforeEach(async ({ page }) => page.clock.setFixedTime(NOW));

test("Startseite: Heute zu tun (geordnet, mit Begründung), Entscheidungen und Entwicklungen", async ({ page }) => {
  const g = await guard(page);
  await seed(page, { state: scen() });
  await page.evaluate(() => {
    const a = makePost({ date: today(), pillar: "tipps", type: "einzelbild", title: "Heute raus", slides: [{ template: "frage", title: "x" }], caption: "Text vivalink.me" }, "ki");
    approvePost(a);
    const b = makePost({ date: addDays(today(), 2), pillar: "tipps", type: "einzelbild", title: "Mit Preis", slides: [{ template: "frage", title: "y" }], caption: "Nur 9 € vivalink.me" }, "ki");
    S.studio.posts.push(a, b);
    return save().then(render);
  });
  const items = page.locator("#today .todo");
  await expect(items.first()).toContainText("Veröffentlichen: Heute raus");
  await expect(page.locator("#today")).toContainText("Prüfen und freigeben: Mit Preis");
  await expect(page.locator("#today")).toContainText("Flyer drucken");
  await expect(page.locator("#today")).toContainText("überschritten");
  await expect(page.locator("#today")).toContainText("andere Aufgaben warten darauf");
  await expect(page.locator("#today")).not.toContainText("Flyer verteilen"); // wartet noch auf „Flyer drucken“
  await expect(page.locator("#decide")).toContainText("Beitrag mit Prüfhinweis: Mit Preis");
  await expect(page.locator("#devs")).toContainText("Neue Registrierungen pro Woche");
  await expect(page.locator("#devs")).toContainText("▲ +50 %");
  await expect(page.locator("#devs")).toContainText("keine Ursachen");
  // Eintrag öffnet direkt den Beitrag
  await items.first().click();
  await expect(page.locator("#sheet h1")).toContainText("Heute raus");
  expect(g.errors).toEqual([]);
});

test("Aufgaben: bearbeiten, Abhängigkeit („erst nach“), keine Kreise, löschen mit Löschvermerk", async ({ page }) => {
  await seed(page, { state: scen() });
  await nav(page, "tasks");
  const cards = page.locator("#app .card");
  // Reihenfolge: Voraussetzung vor der abhängigen Aufgabe, Hinweis „wartet auf“
  const titles = await page.locator('#app [data-a="editTask"] > div:first-child').allTextContents();
  expect(titles.indexOf("Flyer drucken")).toBeLessThan(titles.indexOf("Flyer verteilen"));
  await expect(cards.filter({ hasText: "Flyer verteilen" })).toContainText("wartet auf: Flyer drucken");
  // Bearbeiten
  await page.click('[data-a="editTask"][data-id="t-c"]');
  await expect(page.locator("#sheet h1")).toHaveText("Aufgabe bearbeiten");
  await page.fill("#t-t", "Heute fällig (geändert)");
  await page.selectOption("#t-after", "t-b");
  await page.click('button[data-a="saveTask"]');
  await expectToast(page, "Aufgabe gespeichert");
  let S1 = await state(page);
  expect(S1.tasks.find((x) => x.id === "t-c")).toMatchObject({ title: "Heute fällig (geändert)", after: "t-b" });
  // Kreis wird verhindert: t-a kann nicht nach t-c kommen (t-c → t-b → t-a)
  await page.click('[data-a="editTask"][data-id="t-a"]');
  expect(await page.locator('#t-after option[value="t-c"]').count()).toBe(0);
  expect(await page.evaluate(() => makesCycle("t-a", "t-c"))).toBe(true);
  await page.click('#sheet button[data-a="close"]');
  // Erledigen gibt die abhängige Aufgabe frei
  await page.click('[data-a="toggle"][data-id="t-a"]');
  await expect(page.locator(".card", { has: page.locator(`[data-id="t-b"][data-a="editTask"]`) })).toContainText("nach: Flyer drucken ✓");
  // Löschen (zweimal tippen), Löschvermerk bleibt für die Synchronisierung, Abhängigkeit wird gelöst
  await page.click('[data-a="editTask"][data-id="t-b"]');
  await page.click('button[data-a="delTask"]');
  await expectToast(page, "Nochmal tippen");
  await page.click('button[data-a="delTask"]');
  await expectToast(page, "Aufgabe gelöscht");
  S1 = await state(page);
  expect(S1.tasks.find((x) => x.id === "t-b").deleted).toBe(true);
  expect(S1.tasks.find((x) => x.id === "t-c").after).toBe("");
  await expect(page.locator('[data-a="editTask"][data-id="t-b"]')).toHaveCount(0);
});

test("Hinweise wiederholen sich seltener: „Später“ verdoppelt den Abstand, „Nicht relevant“ nur bei Verschärfung", async ({ page }) => {
  await seed(page, { state: scen() });
  const r = await page.evaluate(() => {
    const id = findings().find((f) => f.id === "t-od").id;
    return id;
  });
  expect(r).toBe("t-od");
  const card = () => page.locator(".card.rec", { hasText: "überfällig" }).first();
  await card().locator('button[data-a="later"]').click();
  await expectToast(page, "Für 7 Tage ausgeblendet");
  let s = (await state(page)).suggest["t-od"];
  expect(s).toMatchObject({ mode: "later", n: 1, until: day(7) });
  // Nach Ablauf erneut „Später“ → 14 Tage
  await page.evaluate(() => (S.suggest["t-od"].until = today()));
  await page.evaluate(() => render());
  await card().locator('button[data-a="later"]').click();
  await expectToast(page, "Für 14 Tage ausgeblendet");
  // „Nicht relevant“: bleibt aus, solange die Dringlichkeit nicht steigt
  const v = await page.evaluate(() => {
    S.suggest = { "t-od": { until: addDays(today(), -1), mode: "nope", at: 1, sev: 3, n: 1 } };
    const a = findings().some((f) => f.id === "t-od");
    S.suggest["t-od"].sev = 2;
    const b = findings().some((f) => f.id === "t-od");
    return [a, b];
  });
  expect(v).toEqual([false, true]);
});

test("Maßnahmen: Reihenfolge, Risiko je Maßnahme und Vergleich mit dem Zeitraum davor (keine Ursachenbehauptung)", async ({ page }) => {
  const s = scen();
  s.meetup = { date: day(5), place: "Testort", goal: "20", note: "", updatedAt: old };
  s.metrics.push({ id: "m_signups", key: "signups", name: "Anmeldungen pro Meetup", unit: "", dir: "up", goal: "", updatedAt: old, entries: [{ id: "s0", date: day(-20), value: 1, status: "confirmed", src: "manual", note: "", updatedAt: old }, { id: "s1", date: day(-10), value: 2, status: "confirmed", src: "manual", note: "", updatedAt: old }, { id: "s2", date: day(0), value: 4, status: "confirmed", src: "manual", note: "", updatedAt: old }] });
  await seed(page, { state: s });
  const card = page.locator(".card.rec", { hasText: "Anmeldungen hinter dem Richtwert" });
  await card.locator("summary").click();
  await expect(card.locator(".card").first()).toContainText("1.");
  await expect(card.locator(".card").first()).toContainText("Risiko: Zu viele Beiträge in kurzer Zeit");
  const line = await page.evaluate(() => {
    const x = { measure: { metric: "signups", baseline: { value: 2, date: addDays(today(), -10) } } };
    return measureLine(x);
  });
  expect(line).toContain("vorher 2");
  expect(line).toContain("Veränderung +2");
  expect(line).toContain("im gleichen Zeitraum davor +1");
});
