// Überwachung der geplanten KI-Aufgaben: nur belegte Ergebnisse zählen als Erfolg; ausgebliebene oder
// fehlgeschlagene Läufe werden erkannt und als Befund gemeldet. Postfach „in“ als Liste ohne Verlust. Nur künstliche Daten.
import { test, expect } from "@playwright/test";
import { seed, nav, kv } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";
import { abgeben, melden } from "../scripts/ki-aufgabe.mjs";

const BASE = "http://127.0.0.1:4173";
const MON = new Date("2026-03-02T09:00:00"); // Montag, nach dem Termin 05:17
const at = (days, h = 9, m = 0) => new Date(MON.getFullYear(), MON.getMonth(), MON.getDate() + days, h, m);

async function setup(browser) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript((u) => (window.VL_SYNC_URL = u), BASE);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(MON);
  const s = v2State();
  s.studio = { brand: { region: "Testregion", signup: "Registrierung über vivalink.me", colorsConfirmed: true, website: "vivalink.me" }, settings: {}, posts: [], learned: {} };
  await seed(page, { state: s });
  const tk = await page.evaluate(async () => (await taskSetup()).token);
  return { ctx, page, tk };
}
const status = (page) => page.evaluate(async () => Object.fromEntries((await automationStatus()).map((a) => [a.id, a.state])));

test("Vor dem ersten Termin: „wartet“; ohne Ergebnis nach dem Termin: „ausgeblieben“ mit Befund; Wartung ohne Rückmeldung: „unbelegt“", async ({ browser }) => {
  const { ctx, page } = await setup(browser);
  expect(await status(page)).toEqual({ wartung: "unbelegt", inhalte: "wartet" });
  // Eine Woche später: App 2 Stunden nach dem Termin geöffnet, kein Ergebnis im Postfach
  await page.clock.setFixedTime(at(7, 4, 0)); // vor dem Termin
  await page.evaluate(() => runCycle("test"));
  expect((await status(page)).inhalte).toBe("wartet");
  await page.clock.setFixedTime(at(7, 6, 0)); // kurz nach dem Termin: noch nicht als ausgeblieben werten
  await page.evaluate(() => runCycle("test"));
  expect((await status(page)).inhalte).toBe("offen");
  await page.clock.setFixedTime(at(7, 9, 0));
  await page.evaluate(() => runCycle("test"));
  expect((await status(page)).inhalte).toBe("ausgeblieben");
  expect(await page.evaluate(() => findings().some((f) => f.id === "sys-auto-inhalte" && f.title.includes("ausgeblieben")))).toBe(true);
  // Anzeige
  await nav(page, "more");
  await page.click('button[data-a="auto"]');
  await expect(page.locator('#sheet [data-auto="inhalte"]')).toContainText("ohne Ergebnis");
  await expect(page.locator('#sheet [data-auto="wartung"]')).toContainText("keine Rückmeldung");
  await ctx.close();
});

test("Erfolg nur mit Beleg; mehrere Rückmeldungen gehen nicht verloren; Problemmeldung wird angezeigt", async ({ browser }) => {
  const { ctx, page, tk } = await setup(browser);
  await page.clock.setFixedTime(at(7, 9, 0));
  // Wartung meldet sich, danach liefert die Inhaltsaufgabe – beides vor dem Abholen (Liste, kein Überschreiben)
  await melden(BASE, "wartung", true, "Alle Tests bestanden", tk);
  const slot = await page.evaluate(() => planSlots(sm()).find((s) => s.date > today()));
  await abgeben(BASE, { posts: { format: "vivalink-studio-plan", version: 1, posts: [{ ...slot, title: "Belegter Entwurf", hook: "Einstieg belegt", slides: [{ template: "frage", title: "Frage" }], caption: "Text vivalink.me" }] }, analysis: { text: "Eine ausreichend lange künstliche Wochenanalyse für den Überwachungstest." } }, "p1", tk);
  const r = await page.evaluate(() => runCycle("test"));
  expect(r.steps[0].note).toContain("1 Rückmeldung");
  let st = await page.evaluate(async () => (await automationStatus()).map((a) => [a.id, a.state, a.lastOk && a.lastOk.summary]));
  expect(st).toEqual([
    ["wartung", "ok", "Alle Tests bestanden"],
    ["inhalte", "ok", "1 Entwürfe, Wochenanalyse"],
  ]);
  // Postfach wurde atomar geleert: erneutes Abholen bringt nichts doppelt
  expect(await page.evaluate(() => taskFetch().then((x) => x.detail))).toBe("keine neuen Ergebnisse");
  expect((await kv(page, "task-history")).length).toBe(2);
  // Nächste Woche: Wartung meldet ein Problem, Inhaltsaufgabe liefert nichts Verwertbares
  await page.clock.setFixedTime(at(14, 9, 0));
  await melden(BASE, "wartung", false, "2 Tests fehlgeschlagen, Korrektur auf Zweig claude/wartung", tk);
  await abgeben(BASE, { posts: { format: "vivalink-studio-plan", version: 1, posts: [] } }, "p2", tk);
  await page.evaluate(() => runCycle("test"));
  st = await page.evaluate(async () => (await automationStatus()).map((a) => [a.id, a.state]));
  expect(st).toEqual([
    ["wartung", "fehler"],
    ["inhalte", "fehler"],
  ]);
  const titles = await page.evaluate(() => findings().filter((f) => f.id.startsWith("sys-auto-")).map((f) => f.title));
  expect(titles).toHaveLength(2);
  // Der letzte belegte Erfolg bleibt sichtbar
  await nav(page, "more");
  await page.click('button[data-a="auto"]');
  await expect(page.locator('#sheet [data-auto="wartung"]')).toContainText("Zuletzt belegt erfolgreich");
  await expect(page.locator('#sheet [data-auto="wartung"]')).toContainText("Problem");
  await ctx.close();
});
