// Regressionstests: alle Funktionen aus Version 1 (GitHub) und Version 2 (Artefakt) über die Oberfläche.
import { test, expect } from "@playwright/test";
import { APP, SCHEMA, CACHE, METRICS } from "./version.mjs";
import { guard, open, ready, nav, state, stubClipboard, clip, toastText, seed } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";

let g;
test.beforeEach(async ({ page }) => {
  g = await guard(page);
  await stubClipboard(page);
});
test.afterEach(async () => {
  expect(g.errors, "JavaScript-Fehler").toEqual([]);
  expect(g.external, "Anfragen an fremde Server").toEqual([]);
});

test("Start: Übersicht, Empfehlungen, Meetup, Kennzahlen, Navigation", async ({ page }) => {
  await open(page);
  await expect(page.locator("h1")).toHaveText("Vivalink Management AI");
  for (const t of ["offen", "überfällig", "Wissen", "Entscheidungen"]) await expect(page.locator(".stat span", { hasText: t })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Empfehlungen" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nächstes Meetup" })).toBeVisible();
  await expect(page.locator('[data-a="met"]')).toHaveCount(0); // ohne Werte eingeklappt
  await page.click('button[data-a="allMet"]');
  await expect(page.locator('[data-a="met"]')).toHaveCount(METRICS);
  for (const id of ["tasks", "memory", "ai", "more", "home"]) {
    await nav(page, id);
    await expect(page.locator(`nav button[data-id="${id}"]`)).toHaveClass(/on/);
  }
});

test("Kein fest eingebauter Unternehmenswert: Kennzahlen starten leer", async ({ page }) => {
  await open(page);
  const s = await state(page);
  expect(s.metrics.every((m) => m.entries.length === 0)).toBe(true);
  expect(JSON.stringify(s)).not.toMatch(/Registrierungen in/);
});

test("Aufgaben: anlegen, sortieren, überfällig, erledigen, wieder öffnen, Persistenz", async ({ page }) => {
  await open(page);
  await nav(page, "tasks");
  const add = async (t, p, d) => {
    await page.click('button[data-a="newTask"]');
    await page.fill("#t-t", t);
    await page.selectOption("#t-p", p);
    if (d) await page.fill("#t-d", d);
    await page.click('button[data-a="saveTask"]');
  };
  await page.click('button[data-a="newTask"]');
  await page.click('button[data-a="saveTask"]');
  expect(await toastText(page)).toContain("Bitte eine Aufgabe eingeben");
  await page.click('#sheet button[data-a="close"]');
  await add("Niedrige Testaufgabe", "niedrig");
  await nav(page, "tasks");
  await add("Hohe Testaufgabe", "hoch", "2020-01-01");
  const cards = page.locator("#app .card");
  await expect(cards.first()).toContainText("Hohe Testaufgabe");
  await expect(cards.first()).toContainText("überfällig");
  await cards.first().locator('button[data-a="toggle"]').click();
  await expect(page.getByText("Erledigt (1)")).toBeVisible();
  await page.click('[data-a="doneToggle"]');
  await page.locator('.card:has-text("Hohe Testaufgabe") button[data-a="toggle"]').click();
  await expect(page.getByText("Erledigt (0)")).toBeVisible();
  await page.reload();
  await ready(page);
  const s = await state(page);
  expect(s.tasks.map((t) => t.title).sort()).toEqual(["Hohe Testaufgabe", "Niedrige Testaufgabe"]);
  expect(s.tasks.find((t) => t.title === "Hohe Testaufgabe").revs.length).toBeGreaterThanOrEqual(2);
});

test("Gedächtnis: anlegen, ändern mit Pflichtgrund, Verlauf, Suche, Filter, ersetzte zeigen", async ({ page }) => {
  await open(page);
  await nav(page, "memory");
  await page.click('button[data-a="newMem"]');
  await page.selectOption("#f-cat", "Meetup");
  await page.fill("#f-title", "Testformat Spaziergang");
  await page.fill("#f-text", "Kleine Gruppen");
  await page.fill("#f-re", "Testbegründung");
  await page.click('button[data-a="saveMem"]');
  await expect(page.locator("#list")).toContainText("Testformat Spaziergang");
  await page.click('button[data-a="editMem"]');
  await page.fill("#f-title", "Testformat Spaziergang v2");
  await page.click('button[data-a="saveMem"]');
  expect(await toastText(page)).toContain("Grund der Änderung");
  await page.fill("#f-cr", "Teständerung");
  await page.click('button[data-a="saveMem"]');
  await expect(page.locator("#list .card")).toHaveCount(1);
  await page.click('button[data-a="hist"]');
  await expect(page.locator("#sheet")).toContainText("Früher: Testformat Spaziergang");
  await expect(page.locator("#sheet")).toContainText("Warum geändert: Teständerung");
  await page.click('#sheet button[data-a="close"]');
  await page.check("#hist");
  await expect(page.locator("#list .card")).toHaveCount(2);
  await page.fill("#q", "gibtesnicht");
  await expect(page.locator("#list")).toContainText("Keine Einträge gefunden");
  await page.fill("#q", "");
  await page.click('.chips button[data-id="Finanzen"]');
  await expect(page.locator("#list")).toContainText("Keine Einträge gefunden");
  await page.click('.chips button[data-id="Meetup"]');
  await expect(page.locator("#list .card").first()).toBeVisible();
});

test("Datenschutzfilter: E-Mail und Telefonnummer werden als vertraulich markiert", async ({ page }) => {
  await open(page);
  await nav(page, "memory");
  for (const [t, x] of [["Mailtest", "test@example.invalid"], ["Telefontest", "+1 555 010 0000"]]) {
    await page.click('button[data-a="newMem"]');
    await page.fill("#f-title", t);
    await page.fill("#f-text", x);
    await page.click('button[data-a="saveMem"]');
  }
  const s = await state(page);
  expect(s.memory.every((m) => m.private)).toBe(true);
  await expect(page.locator("#list")).toContainText("vertraulich");
});

test("Arbeitsaufträge: alle 7 Vorlagen, Vertrauliches ausgeschlossen, Optionen, Antwort speichern", async ({ page }) => {
  await seed(page, { state: v2State() });
  await nav(page, "ai");
  const tpl = page.locator('[data-a="tpl"]');
  await expect(tpl).toHaveCount(7);
  for (const k of ["ig", "cap", "strat", "week", "dec", "prob", "sum"]) {
    await page.click(`[data-a="tpl"][data-id="${k}"]`);
    await expect(page.locator("#pv")).toBeVisible();
    const p = await page.inputValue("#pv");
    expect(p).toContain("Vivalink");
    expect(p).not.toContain("kontakt@example.invalid");
    if (k !== "cap") expect(p).toContain("KENNZAHLEN");
    await page.click('button[data-a="aiBack"]');
  }
  await page.click('[data-a="tpl"][data-id="strat"]');
  expect(await page.inputValue("#pv")).toContain("VOM REGELMOTOR ERKANNTE BEFUNDE");
  await page.check("#a-p");
  expect(await page.inputValue("#pv")).toContain("kontakt@example.invalid");
  await expect(page.locator("#warn")).toContainText("Achtung");
  await page.uncheck("#a-p");
  await page.selectOption("#a-m", "k");
  expect(await page.inputValue("#pv")).toContain("Erfinde nichts");
  await page.uncheck("#a-t");
  expect(await page.inputValue("#pv")).not.toContain("OFFENE AUFGABEN");
  await page.click('.chips button[data-a="acat"][data-id="Ziele"]');
  await page.fill("#a-x", "Testzusatz");
  expect(await page.inputValue("#pv")).toContain("Zusatzinfo von mir: Testzusatz");
  await page.click('button[data-a="cpPv"]');
  await expect.poll(() => clip(page)).toContain("Testzusatz");
  await page.fill("#ans", "Künstliche KI-Antwort");
  await page.click('button[data-a="saveAns"][data-id="confirmed"]');
  expect(await toastText(page)).toContain("bestätigen");
  await page.click('button[data-a="discard"]');
  expect(await page.inputValue("#ans")).toBe("");
  await page.fill("#ans", "Künstliche KI-Antwort");
  await page.click('button[data-a="saveAns"][data-id="estimate"]');
  await expect(page.locator("#list")).toContainText("KI-Antwort: Unternehmensstrategie analysieren");
  const s = await state(page);
  expect(s.memory.find((m) => m.title.startsWith("KI-Antwort")).status).toBe("estimate");
});

test("Kennzahlen: Wert, Ziel, Vergleich, Entfernen, früherer Stand", async ({ page }) => {
  await seed(page, { state: v2State() });
  await expect(page.locator('[data-a="met"][data-id="m_reg_total"]')).toContainText("Früherer Stand");
  await page.click('[data-a="met"][data-id="m_reg_week"]');
  await expect(page.locator("#sheet")).toContainText("7 Tage: +2 (+29 %)");
  await page.fill("#v-v", "abc");
  await page.click('button[data-a="saveVal"]');
  expect(await toastText(page)).toContain("Zahl");
  await page.fill("#v-v", "11");
  await page.fill("#v-d", "2026-01-15");
  await page.click('button[data-a="saveVal"]');
  await expect(page.locator("#sheet")).toContainText("7 Tage: +2 (+22 %)");
  await page.fill("#v-g", "20");
  await page.click('button[data-a="saveGoal"]');
  let s = await state(page);
  const m = s.metrics.find((x) => x.id === "m_reg_week");
  expect(m.goal).toBe("20");
  expect(m.goalAt).toBeGreaterThan(0);
  await page.locator('#sheet .card:has-text("11") button[data-a="delVal"]').click();
  s = await state(page);
  expect(s.metrics.find((x) => x.id === "m_reg_week").entries.find((e) => e.value === 11).deleted).toBe(true);
});

test("Nächstes Meetup: anlegen und anzeigen", async ({ page }) => {
  await open(page);
  await page.click('[data-a="meet"]');
  await page.fill("#u-d", "2099-01-01");
  await page.fill("#u-p", "Testort");
  await page.fill("#u-g", "10");
  await page.click('button[data-a="saveMeet"]');
  await expect(page.locator('[data-a="meet"]')).toContainText("Testort");
  await expect(page.locator('[data-a="meet"]')).toContainText("von Ziel 10");
  const s = await state(page);
  expect(s.meetup.updatedAt).toBeGreaterThan(0);
});

test("Regelmotor: Befund als Aufgabe, Später, Nicht relevant, Alle Hinweise", async ({ page }) => {
  await seed(page, { state: v2State() });
  const cards = page.locator('#app .card:has(button[data-a="mk"])');
  const n0 = await cards.count();
  expect(n0).toBeGreaterThan(0);
  await expect(cards.first().locator(".row.sp .chip")).toHaveText(/Fakt|Annahme/);
  const before = (await state(page)).tasks.length;
  const mkId = await cards.first().locator('button[data-a="mk"]').getAttribute("data-id");
  await cards.first().locator('button[data-a="mk"]').click();
  await expect(page.locator(`button[data-a="mk"][data-id="${mkId}"]`)).toHaveCount(0);
  expect((await state(page)).tasks.length).toBe(before + 1);
  expect((await state(page)).tasks.at(-1).src).toBe("regelmotor");
  const id = await cards.first().locator('button[data-a="later"]').getAttribute("data-id");
  await cards.first().locator('button[data-a="later"]').click();
  await expect(page.locator(`button[data-a="later"][data-id="${id}"]`)).toHaveCount(0);
  expect((await state(page)).suggest[id].mode).toBe("later");
  const id2 = await cards.first().locator('button[data-a="nope"]').getAttribute("data-id");
  await cards.first().locator('button[data-a="nope"]').click();
  await expect(page.locator(`button[data-a="nope"][data-id="${id2}"]`)).toHaveCount(0);
  expect((await state(page)).suggest[id2].mode).toBe("nope");
  const all = page.locator('button[data-a="all"]');
  if (await all.count()) {
    await all.click();
    await expect(page.locator('button[data-a="all"]')).toHaveText("Weniger anzeigen");
  }
});

test("Mehr: WebGPU-Hinweis, KI-Test speichern und kopieren, Akzentfarbe, Version", async ({ page }) => {
  await open(page);
  await nav(page, "more");
  await expect(page.locator("#app")).toContainText("WebGPU:");
  await expect(page.locator("#app")).toContainText(`Version ${APP} · Datenversion ${SCHEMA}`);
  await page.click('button[data-a="aiTest"]');
  await expect(page.locator("#sheet textarea[id^=pt]")).toHaveCount(4);
  await page.fill("#a-mod", "Testmodell");
  await page.fill("#a-load", "12");
  await page.click('button[data-a="saveAi"]');
  await expect(page.locator("#sheet")).toContainText("Testmodell");
  await page.click('button[data-a="cpAi"]');
  await expect.poll(() => clip(page)).toContain("Testmodell");
  await page.click('#sheet button[data-a="close"]');
  await page.locator("#ac").evaluate((e) => {
    e.value = "#ff0000";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(300);
  await page.reload();
  await ready(page);
  expect((await state(page)).accent).toBe("#ff0000");
});
