// Assistenz: KI-Antwort → Aufgaben (mit Auswahl, Abhängigkeiten, Entscheidungen), Wochenbericht, Selbstreparatur Stufe 1.
// Nur künstliche Daten.
import { test, expect } from "@playwright/test";
import { guard, seed, nav, state, kv, expectToast } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";

const NOW = new Date("2026-03-10T10:00:00");
test.beforeEach(async ({ page }) => page.clock.setFixedTime(NOW));
const ANSWER = `1. Kurzfazit: …
2. Empfehlungen …
\`\`\`json
{"format":"vivalink-actions","version":1,"tasks":[
 {"title":"Drei Cafés als Meetup-Orte anfragen","prio":"hoch","area":"Meetup","dueDays":5,"why":"Mehr Auswahl an Orten"},
 {"title":"Ankündigung für das nächste Meetup planen","prio":"mittel","area":"Instagram","dueDays":7,"why":"Sichtbarkeit","after":1},
 {"title":"Teilnahmepreis auf 5 Euro erhöhen","prio":"hoch","area":"Finanzen","dueDays":3,"why":"Kosten decken"},
 {"title":"Testaufgabe","prio":"unsinn","area":"Erfunden","dueDays":999}
]}
\`\`\``;

test("KI-Antwort → Aufgaben: Auswahl, Abhängigkeit, Dubletten erkannt, Preisfragen nur als Entscheidung", async ({ page }) => {
  const g = await guard(page);
  await seed(page, { state: v2State() });
  await nav(page, "ai");
  await page.click('[data-a="tpl"][data-id="week"]');
  await expect(page.locator("#pv")).toHaveValue(/vivalink-actions/);
  // Kaputte Antwort
  await page.fill("#ans", "Nur Text ohne Block");
  await page.click('button[data-a="ansTasks"]');
  await expectToast(page, "Kein Aufgabenblock");
  await page.fill("#ans", ANSWER);
  await page.click('button[data-a="ansTasks"]');
  await expect(page.locator("#sheet [data-act]")).toHaveCount(4);
  await expect(page.locator("#sheet")).toContainText("Entscheidung nötig");
  await expect(page.locator('#sheet [data-act="4"]')).toBeChecked(); // „Testaufgabe“ ähnelt nichts
  await page.locator('#sheet [data-act="4"]').uncheck();
  await page.click('button[data-a="ansApply"]');
  await expectToast(page, "3 Aufgabe(n) angelegt");
  const T = (await state(page)).tasks;
  const a = T.find((x) => x.title === "Drei Cafés als Meetup-Orte anfragen"),
    b = T.find((x) => x.title === "Ankündigung für das nächste Meetup planen"),
    c = T.find((x) => x.title.includes("Teilnahmepreis"));
  expect(a).toMatchObject({ prio: "hoch", area: "Meetup", due: "2026-03-15", src: "ki" });
  expect(b.after).toBe(a.id);
  expect(c).toMatchObject({ title: "Entscheidung: Teilnahmepreis auf 5 Euro erhöhen", area: "Entscheidung", decision: true });
  await expect(page.locator(".card", { has: page.locator('[data-a="editTask"]', { hasText: "Ankündigung für das nächste" }) })).toContainText("wartet auf: Drei Cafés");
  await nav(page, "home");
  await expect(page.locator("#decide")).toContainText("Entscheidung: Teilnahmepreis");
  // Gleiche Antwort erneut → als ähnlich markiert und nicht vorausgewählt
  await nav(page, "ai"); // der zuletzt geöffnete Auftrag bleibt geöffnet
  await expect(page.locator("#pv")).toHaveValue(/vivalink-actions/);
  await page.fill("#ans", ANSWER);
  await page.click('button[data-a="ansTasks"]');
  await expect(page.locator('#sheet [data-act="1"]')).not.toBeChecked();
  await expect(page.locator("#sheet")).toContainText("Ähnliche Aufgabe vorhanden");
  expect(await page.evaluate(() => ACTIONS.filter((x) => x.name === "ai.tasks" && x.ok).length)).toBe(1);
  expect(g.errors).toEqual([]);
});

test("Entscheidungserkennung: Preise, Zahlungen, Werbung, Verträge – aber nicht „Ankündigung“ oder „kostenlos“", async ({ page }) => {
  await seed(page, { state: v2State() });
  const r = await page.evaluate(() =>
    ["Teilnahmepreis erhöhen", "Zahlung an Café veranlassen", "Bezahlte Werbung testen", "Vertrag mit Location kündigen", "Ankündigung posten", "Kostenloses Meetup bewerben", "Abonnement abschließen", "Kosten prüfen"].map((t) => DECISION_RE.test(t)),
  );
  expect(r).toEqual([true, true, true, true, false, false, true, true]);
});

test("Wochenbericht: aus den Daten, ohne Ursachenbehauptung, wöchentlich abgelegt, einmal im Gedächtnis", async ({ page }) => {
  const s = v2State();
  s.tasks.push({ id: "t-done", title: "Erledigte Testaufgabe", prio: "mittel", area: "App", due: "", done: true, doneAt: NOW.getTime() - 2 * 864e5, updatedAt: 1 });
  await seed(page, { state: s });
  const r = await page.evaluate(() => weeklyReport());
  expect(r.text).toContain("Wochenbericht 4.3.2026 – 10.3.2026");
  expect(r.text).toContain("- Erledigte Testaufgabe");
  expect(r.text).toContain("keine Ursachen");
  expect((await kv(page, "reports"))[0].text).toContain("Wochenbericht");
  await page.click('button[data-a="report"]');
  await expect(page.locator("#wr")).toHaveValue(/ERLEDIGT/);
  await page.click('button[data-a="wrSave"]');
  await expectToast(page, "im Gedächtnis abgelegt");
  await page.click('button[data-a="report"]');
  await page.click('button[data-a="wrSave"]');
  await expectToast(page, "bereits gespeichert");
  expect((await state(page)).memory.filter((m) => m.title.startsWith("Wochenbericht"))).toHaveLength(1);
});

test("Selbstreparatur: verwaiste Verweise und ungültige Fristen beim Start behoben, mit Rückgängig-Punkt und Protokoll", async ({ page }) => {
  const s = v2State();
  s.tasks.push({ id: "t-orph", title: "Verwaiste Abhängigkeit", prio: "mittel", area: "App", due: "31.02.", after: "t-gibtsnicht", done: false, updatedAt: 1 });
  await seed(page, { state: s });
  const t = (await state(page)).tasks.find((x) => x.id === "t-orph");
  expect(t).toMatchObject({ after: "", due: "" });
  expect((await kv(page, "pre-import")).label).toBe("Automatische Reparatur");
  expect(await page.evaluate(() => ACTIONS.some((a) => a.name === "repair.auto" && a.ok && a.by === "auto"))).toBe(true);
  expect((await kv(page, "cycle-last")).steps[0].note).toContain("Datenfehler behoben");
  // Ohne Fehler: nichts angefasst, kein neuer Rückgängig-Punkt
  await page.evaluate(() => kvPut("pre-import", null));
  await page.reload();
  await page.waitForFunction(() => typeof S !== "undefined" && S && S.studio);
  expect(await kv(page, "pre-import")).toBeNull();
});
