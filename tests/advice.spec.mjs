// Empfehlungen mit Bedeutung, Ursachen (Annahme) und priorisierten Maßnahmen; Maßnahmenkontrolle ohne Kausalbehauptung.
import { test, expect } from "@playwright/test";
import { guard, seed, nav, state, expectToast } from "./helpers.mjs";
import { T0 } from "./fixtures.mjs";

const NOW = new Date("2026-03-10T10:00:00");
const day = (n) => new Date(NOW.getTime() + n * 864e5).toLocaleDateString("sv-SE");
function scen() {
  const old = NOW.getTime() - 20 * 864e5;
  return {
    v: 4, dev: "devA", accent: "", lastBackup: "", suggest: {}, conflicts: [], memory: [], tasks: [],
    metrics: [{ id: "m_signups", key: "signups", name: "Anmeldungen pro Meetup", unit: "", dir: "up", goal: "", updatedAt: old, entries: [{ id: "s1", date: day(0), value: 4, status: "confirmed", src: "manual", note: "", updatedAt: old }] }],
    meetup: { date: day(5), place: "Testort", goal: "20", note: "", updatedAt: old },
    studio: { brand: { region: "Testregion", colorsConfirmed: true }, settings: {}, posts: [], learned: {} },
  };
}
test.beforeEach(async ({ page }) => page.clock.setFixedTime(NOW));

test("Befund zeigt Fakten, Bedeutung, Ursachen als Annahme und priorisierte Maßnahmen", async ({ page }) => {
  const g = await guard(page);
  await seed(page, { state: scen() });
  const card = page.locator(".card.rec", { hasText: "Anmeldungen hinter dem Richtwert" });
  await card.locator("summary").click();
  await expect(card).toContainText("Fakten");
  await expect(card).toContainText("Aktuell 4 von Ziel 20");
  await expect(card).toContainText("Bedeutung");
  await expect(card).toContainText("Mögliche Ursachen");
  await expect(card.locator(".chip", { hasText: "Annahme" }).first()).toBeVisible();
  const ms = card.locator('button[data-a="msr"]');
  await expect(ms).toHaveCount(3);
  // Priorisierung: höchster Nutzen + Dringlichkeit bei geringem Aufwand zuerst
  await expect(card.locator(".card").first()).toContainText("Instagram-Story als Meetup-Erinnerung");
  await expect(card.locator(".card").first()).toContainText("Priorität hoch");
  expect(g.errors).toEqual([]);
});

test("Maßnahme freigeben: Aufgabe mit Ausgangswert, Instagram-Entwurf aus Fakten, Auswertung zum Prüftermin", async ({ page }) => {
  await seed(page, { state: scen() });
  const card = page.locator(".card.rec", { hasText: "Anmeldungen hinter dem Richtwert" });
  await card.locator("summary").click();
  await card.locator('button[data-a="msr"]').first().click();
  await expectToast(page, "Maßnahme freigegeben · Prüfung am");
  let s = await state(page);
  const x = s.tasks.find((t) => t.src === "massnahme");
  expect(x.measure).toMatchObject({ metric: "signups", baseline: { value: 4, date: day(0) }, checkAt: day(5), outcome: null });
  const p = s.studio.posts.find((q) => q.id === x.measure.postId);
  expect(p).toMatchObject({ type: "story", status: "entwurf", pillar: "meetup" });
  expect(p.caption).toContain("Testort");
  expect(p.warnings).toEqual([]);
  // gleicher Befund wird nicht erneut als offene Aufgabe angezeigt
  expect(await page.evaluate(() => findings().some((f) => f.id === "mt-pace"))).toBe(false);
  // Neue Zahl, Prüftermin erreicht → Auswertungsbefund mit vorher/nachher und Kausalitätshinweis
  await page.evaluate(() => {
    addVal("m_signups", { date: new Date(Date.now() + 3 * 864e5).toLocaleDateString("sv-SE"), value: 15, status: "confirmed" });
    return save();
  });
  await page.clock.setFixedTime(new Date(NOW.getTime() + 5 * 864e5));
  await page.reload();
  await page.waitForFunction(() => typeof S !== "undefined" && S && S.studio);
  const f = await page.evaluate(() => findings().find((y) => y.id.startsWith("ms-")));
  expect(f.why.join(" ")).toContain("vorher 4");
  expect(f.why.join(" ")).toContain("jetzt 15");
  expect(f.why.join(" ")).toContain("Veränderung +11");
  expect(f.why.join(" ")).toContain("kein Beweis");
  await nav(page, "tasks");
  await expect(page.locator("#app")).toContainText("Zeitlicher Zusammenhang – keine bewiesene Ursache");
  await page.click('button[data-a="msrOut"][data-v="wirksam"]');
  s = await state(page);
  const done = s.tasks.find((t) => t.src === "massnahme");
  expect(done.measure).toMatchObject({ outcome: "wirksam", after: { value: 15 } });
  expect(done.done).toBe(true);
  const mem = s.memory.find((m) => m.title.startsWith("Maßnahme:"));
  expect(mem).toMatchObject({ status: "estimate", cat: "Entscheidung" });
  expect(mem.result).toContain("keine bewiesene Ursache");
});

test("Startseite: kompakte Statuszeile, Zielfortschritt, eingeklappte Kennzahlen", async ({ page }) => {
  const s = scen();
  s.metrics[0].goal = "20";
  await seed(page, { state: s });
  await expect(page.locator(".stat span", { hasText: "Freigaben" })).toBeVisible();
  await expect(page.locator(".stat span", { hasText: "Technik" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ziele" })).toBeVisible();
  await expect(page.locator(".bar span")).toHaveAttribute("style", /width:20%/);
  await expect(page.locator('#app [data-a="met"]')).toHaveCount(2); // Ziel-Karte + Kennzahl mit Wert
  await page.click('button[data-a="allMet"]');
  await expect(page.locator('#app [data-a="met"]')).toHaveCount(12);
});
