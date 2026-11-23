// Getrennte Testversion (dist-test): eigener Speicher, eigener Offline-Speicher, Demodaten.
// Prüft außerdem, dass echte App und Testversion sich gegenseitig nicht stören.
import { test, expect } from "@playwright/test";
import { APP, SCHEMA, CACHE } from "./version.mjs";
import { spawn, execFileSync } from "node:child_process";
import { ready, state } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });
let prod, testv, P, T;
const start = (port, root) => spawn(process.execPath, ["tests/server.mjs"], { env: { ...process.env, PORT: String(port), ...(root ? { ROOT: root } : {}) }, stdio: "ignore" });
const up = (u) => expect.poll(async () => (await fetch(u).catch(() => null))?.status ?? 0, { timeout: 10_000 }).toBe(200);

test.beforeAll(async ({}, info) => {
  const out = "test-results/dist-test-" + info.project.name;
  execFileSync(process.execPath, ["scripts/build-test.mjs", out]);
  // Gleiche Adresse (Port) für beide Ausgaben wie bei GitHub Pages (gleicher Origin, verschiedene Pfade)
  // ist lokal nicht nachstellbar; daher prüfen wir Speicher und Cache-Namen direkt.
  const port = 4200 + info.parallelIndex * 2;
  P = `http://127.0.0.1:${port}/`;
  T = `http://127.0.0.1:${port + 1}/`;
  prod = start(port);
  testv = start(port + 1, out);
  await up(P);
  await up(T);
});
test.afterAll(() => {
  prod?.kill();
  testv?.kill();
});

test("Testversion: Hinweis, eigener Name, eigener Speicher, Demodaten, Übernahme alter Backups, Konflikt", async ({ page, request }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(T);
  await ready(page);
  await expect(page.locator(".testbar")).toContainText("TESTVERSION");
  expect(await page.title()).toBe("Vivalink TEST");
  const man = await (await request.get(T + "manifest.webmanifest")).json();
  expect(man).toMatchObject({ name: "Vivalink AI TEST", short_name: "VL Test" });
  expect(await page.evaluate(() => [window.VL_CHANNEL, window.VL_DB])).toEqual(["test", "vivalink-test"]);
  await page.click('nav button[data-id="more"]');
  await page.click('button[data-a="demoLoad"]');
  await page.click('button[data-a="demoLoad"]');
  await expect(page.locator("#toast")).toContainText("Demodaten geladen");
  let s = await state(page);
  expect(s.v).toBe(SCHEMA);
  expect(s.tasks.length).toBe(3);
  expect(s.metrics.find((m) => m.key === "reg_week").entries).toHaveLength(4);
  await expect(page.locator('#app .card:has(button[data-a="mk"])').first()).toBeVisible();
  // Altes Backup (V1) prüfen und zusammenführen
  await page.click('nav button[data-id="more"]');
  await page.click('button[data-a="demoV1"]');
  await page.click('button[data-a="chkImp"]');
  await expect(page.locator("#impRes")).toContainText("Datenversion 1");
  await page.click('button[data-a="imp"]');
  await page.click('button[data-a="impGo"]');
  await expect(page.locator("#toast")).toContainText("2 Einträge übernommen");
  // Konflikt erzeugen und entscheiden
  await page.click('button[data-a="demoConflict"]');
  await page.click('button[data-a="imp"]');
  await page.click('button[data-a="impGo"]');
  await expect(page.locator("#toast")).toContainText("1 Konflikt(e)");
  await page.locator('button[data-a="cfx"][data-v="other"]').click();
  s = await state(page);
  expect(s.tasks.find((t) => t.id === "d-t2").title).toBe("Demo: Wichtige Aufgabe ohne Frist");
  // Studio-Demo: Monatsplan mit Grafiken ohne KI
  await page.click('nav button[data-id="more"]');
  await page.click('button[data-a="demoStudio"]');
  await expect(page.locator("#toast")).toContainText("Demo-Beiträge mit Grafiken im Studio");
  await expect(page.locator("[data-thumb] canvas").first()).toBeVisible();
  // Eigener Speicher: Datenbank "vivalink-test", keine Datenbank "vivalink"
  const dbs = await page.evaluate(async () => (indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : null));
  if (dbs) {
    expect(dbs).toContain("vivalink-test");
    expect(dbs).not.toContain("vivalink");
  }
  expect(errors).toEqual([]);
});

test("Echte App zeigt keinen Testhinweis und keine Demodaten-Funktionen", async ({ page }) => {
  await page.goto(P);
  await ready(page);
  await expect(page.locator(".testbar")).toHaveCount(0);
  await page.click('nav button[data-id="more"]');
  await expect(page.locator('button[data-a="demoLoad"]')).toHaveCount(0);
  // Demofunktionen sind in der produktiven App gar nicht enthalten
  expect(await page.evaluate(() => [typeof demoAction, typeof demoState, typeof demoCard, window.VL_CHANNEL, window.VL_DB])).toEqual(["undefined", "undefined", "undefined", "prod", undefined]);
  expect(await page.evaluate(() => [...document.scripts].map((s) => s.src).filter((s) => /demo/.test(s)))).toEqual([]);
  expect((await state(page)).tasks).toHaveLength(0);
});

test.describe("Offline-Speicher sind getrennt", () => {
  test.use({ serviceWorkers: "allow" });
  for (const [name, which, mine, stale, foreign] of [
    ["Testversion löscht keine Offline-Speicher der echten App", "T", "vivalink-test-" + APP, "vivalink-test-0.9", ["vivalink-v1", "vivalink-2.0.0"]],
    ["Echte App löscht keine Offline-Speicher der Testversion", "P", CACHE, "vivalink-v1", ["vivalink-test-1.0.0"]],
  ])
    test(name, async ({ page }) => {
      const base = which === "T" ? T : P;
      await page.goto(base + "manifest.webmanifest");
      await page.evaluate(async (names) => {
        for (const n of names) await (await caches.open(n)).put("/x", new Response("x"));
      }, [stale, ...foreign]);
      await page.goto(base);
      await ready(page);
      await page.evaluate(() => navigator.serviceWorker.ready);
      await expect.poll(() => page.evaluate(async () => await caches.keys())).toContain(mine);
      // eigener veralteter Speicher wird aufgeräumt (bei der echten App: der alte Speicher von Version 1)
      await expect.poll(() => page.evaluate(async () => await caches.keys())).not.toContain(stale);
      const keys = await page.evaluate(async () => caches.keys());
      for (const f of foreign) expect(keys, f).toContain(f);
    });
});
