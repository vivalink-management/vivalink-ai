// Datenübernahme: vorhandene Daten aus Version 1 (GitHub Pages) und Version 2 (Artefakt) bleiben vollständig erhalten.
import { test, expect } from "@playwright/test";
import { APP, SCHEMA, CACHE, METRICS } from "./version.mjs";
import { guard, seed, ready, nav, state, kv, toastText } from "./helpers.mjs";
import { v1State, v2State } from "./fixtures.mjs";

let g;
test.beforeEach(async ({ page }) => (g = await guard(page)));
test.afterEach(async () => expect(g.errors).toEqual([]));

test("Version 1 → 3: alle Einträge erhalten, geprüfte Sicherheitskopie, keine Startwerte", async ({ page }) => {
  const v1 = v1State();
  await seed(page, { state: v1 });
  const s = await state(page);
  expect(s.v).toBe(SCHEMA);
  expect(s.memory).toEqual(v1.memory);
  expect(s.tasks).toEqual(v1.tasks);
  expect(s.accent).toBe(v1.accent);
  expect(s.lastBackup).toBe(v1.lastBackup);
  expect(s.dev).toBe(v1.dev);
  expect(s.metrics).toHaveLength(METRICS);
  expect(s.metrics.flatMap((m) => m.entries)).toEqual([]);
  expect(s.conflicts).toEqual([]);
  const safe = await kv(page, "safety-v1");
  expect(safe.data).toEqual(v1);
  expect(safe.to).toBe(SCHEMA);
  await nav(page, "memory");
  await expect(page.locator("#list")).toContainText("Testziel Beta");
  await nav(page, "tasks");
  await expect(page.locator("#app")).toContainText("Testaufgabe Eins");
});

test("Version 2 (Artefakt) → 3: Kennzahlen, Meetup, Ausblendungen und Daten-Startwerte bleiben", async ({ page }) => {
  const v2 = v2State();
  await seed(page, { state: v2 });
  const s = await state(page);
  expect(s.v).toBe(SCHEMA);
  expect(s.memory).toEqual(v2.memory);
  expect(s.tasks).toEqual(v2.tasks);
  expect(s.meetup).toEqual(v2.meetup);
  expect(s.suggest).toEqual(v2.suggest);
  for (const m of v2.metrics) expect(s.metrics.find((x) => x.id === m.id)).toEqual(m);
  expect((await kv(page, "safety-v2")).data).toEqual(v2);
});

test("Migration ist wiederholbar: erneutes Laden ändert nichts und überschreibt die Sicherheitskopie nicht", async ({ page }) => {
  await seed(page, { state: v1State() });
  const a = await state(page),
    safe1 = await kv(page, "safety-v1");
  await page.reload();
  await ready(page);
  expect(await state(page)).toEqual(a);
  expect(await kv(page, "safety-v1")).toEqual(safe1);
});

test("Sicherheitskopie wiederherstellen (mit Doppeltipp) legt vorher einen Rückgängig-Punkt an", async ({ page }) => {
  await seed(page, { state: v1State() });
  await nav(page, "tasks");
  await page.click('button[data-a="newTask"]');
  await page.fill("#t-t", "Nach dem Update angelegt");
  await page.click('button[data-a="saveTask"]');
  await nav(page, "more");
  await page.click('button[data-a="restore"]');
  expect(await toastText(page)).toContain("Nochmal tippen");
  await page.click('button[data-a="restore"]');
  await expect.poll(async () => (await state(page)).tasks.length).toBe(2);
  const undo = await kv(page, "pre-import");
  expect(undo.data.tasks.map((t) => t.title)).toContain("Nach dem Update angelegt");
  await page.click('button[data-a="undoImp"]');
  await page.click('button[data-a="undoImp"]');
  await expect.poll(async () => (await state(page)).tasks.length).toBe(3);
});

test("Leerer Start: neues Gerät erhält leere Daten in Version 3", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const s = await state(page);
  expect(s.v).toBe(SCHEMA);
  expect(s.memory).toEqual([]);
  expect(await kv(page, "safety-v1")).toBeNull();
});
