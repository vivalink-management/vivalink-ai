// Echte Aktualisierung und Rückbau mit dem ORIGINALEN Code von Version 1 (tests/fixtures/legacy-v1 = main, Stand f32f745).
// Gleiche Web-Adresse wie auf iPhone/iPad: Der Server liefert erst Version 1, dann Version 2.1 (bzw. zurück).
import { test, expect } from "@playwright/test";
import { APP, SCHEMA, CACHE } from "./version.mjs";
import { spawn } from "node:child_process";
import { ready, state, kv, stubClipboard, waitClip } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";

test.use({ serviceWorkers: "allow" });
const LEGACY = "tests/fixtures/legacy-v1";
let srv = null;
async function serve(port, root) {
  if (srv) await stop();
  srv = spawn(process.execPath, ["tests/server.mjs"], { env: { ...process.env, PORT: String(port), ...(root ? { ROOT: root } : {}) }, stdio: "ignore" });
  await expect.poll(async () => (await fetch(`http://127.0.0.1:${port}/`).catch(() => null))?.status ?? 0, { timeout: 10_000 }).toBe(200);
}
async function stop() {
  const p = srv;
  srv = null;
  if (!p || p.exitCode !== null) return;
  await new Promise((r) => {
    p.once("exit", r);
    p.kill();
  });
}
test.afterEach(stop);
const version = (page) => page.evaluate(() => (typeof APP_VERSION === "undefined" ? "1" : APP_VERSION));
/* Wartet, bis der Service Worker die Seite kontrolliert. Wurde die Seite genau während der Aktivierung
   neu geladen, übernimmt der Browser sie erst beim nächsten Öffnen – wie auf dem Gerät. Dann einmal neu öffnen. */
async function waitController(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
    await page.reload();
    await ready(page);
  }
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 10_000 }).toBe(true);
}

test("Aktualisierung einer installierten Version 1 auf 2.1: alle Daten bleiben, offline lauffähig, alter Offline-Speicher entfernt", async ({ page }, info) => {
  const port = 4300 + info.parallelIndex,
    base = `http://127.0.0.1:${port}/`;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await stubClipboard(page);
  // 1. Version 1 wie heute auf dem Gerät: Daten über die Oberfläche anlegen
  await serve(port, LEGACY);
  await page.goto(base);
  await ready(page);
  expect(await version(page)).toBe("1");
  await page.click('nav button[data-id="tasks"]');
  await page.click('button[data-a="newTask"]');
  await page.fill("#t-t", "Aufgabe aus Version 1");
  await page.selectOption("#t-p", "hoch");
  await page.click('button[data-a="saveTask"]');
  await page.click('nav button[data-id="memory"]');
  await page.click('button[data-a="newMem"]');
  await page.fill("#f-title", "Wissen aus Version 1");
  await page.fill("#f-text", "Künstlicher Testinhalt");
  await page.click('button[data-a="saveMem"]');
  await page.click('button[data-a="editMem"]');
  await page.fill("#f-title", "Wissen aus Version 1 (geändert)");
  await page.fill("#f-cr", "Testgrund");
  await page.click('button[data-a="saveMem"]');
  await page.click('nav button[data-id="more"]');
  await page.click('button[data-a="aiTest"]');
  await page.fill("#a-mod", "Testmodell V1");
  await page.click('button[data-a="saveAi"]');
  await expect(page.locator("#sheet")).toContainText("Testmodell V1");
  await page.click('#sheet button[data-a="close"]');
  await page.click('button[data-a="exp"]'); // Backup wie bisher (Version 1)
  const v1Backup = await waitClip(page);
  await waitController(page);
  expect(await page.evaluate(async () => caches.keys())).toContain("vivalink-v1");
  const before = await state(page);
  expect(before.v).toBe(1);

  // 2. Veröffentlichung von 2.1 (gleiche Adresse) und normales Öffnen der App
  await serve(port, null);
  await page.reload();
  await ready(page);
  await expect.poll(() => version(page)).toBe(APP);
  const after = await state(page);
  expect(after.v).toBe(SCHEMA);
  expect(after.memory).toEqual(before.memory);
  expect(after.tasks).toEqual(before.tasks);
  expect(after.dev).toBe(before.dev);
  expect(after.lastBackup).toBe(before.lastBackup);
  expect((await kv(page, "safety-v1")).data).toEqual(before);
  expect(await kv(page, "aitest")).toHaveLength(1);
  // neuer Service Worker übernimmt, alter Offline-Speicher wird entfernt
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).sort())).toEqual([CACHE]);
  await expect.poll(() => page.evaluate(async (c) => (await (await caches.open(c)).match("index.html"))?.text(), CACHE)).toContain("js/app.js?v=" + APP);
  // altes Backup (Version 1) ist vollständig lesbar und bereits enthalten
  const chk = await page.evaluate((t) => inspectBackup(t).then((r) => ({ ok: r.ok, allHere: r.allHere, p: r.preview })), v1Backup);
  expect(chk).toMatchObject({ ok: true, allHere: true, p: { added: 0, updated: 0, conflicts: 0 } });

  // 3. Offline (Server aus): App 2.1 startet vollständig aus dem Offline-Speicher
  await stop();
  await page.reload();
  await ready(page);
  expect(await version(page)).toBe(APP);
  expect((await state(page)).tasks).toEqual(before.tasks);
  await expect(page.locator(".testbar")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Rückbau auf Version 1 und erneutes Update: keine Daten gehen verloren", async ({ page }, info) => {
  const port = 4320 + info.parallelIndex,
    base = `http://127.0.0.1:${port}/`;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Version 2.1 mit Kennzahlen, Meetup und einem entschiedenen Konflikt
  await serve(port, null);
  await page.goto(base);
  await ready(page);
  await page.evaluate(async (s) => kvPut("state", s), v2State());
  await page.reload();
  await ready(page);
  await page.click('[data-a="met"][data-id="m_signups"]');
  await page.fill("#v-v", "17");
  await page.click('button[data-a="saveVal"]');
  await page.click('#sheet button[data-a="close"]');
  await waitController(page);
  const v21 = await state(page);
  expect(v21.v).toBe(SCHEMA);

  // Rückbau: Server liefert wieder Version 1
  await serve(port, LEGACY);
  await page.reload();
  await ready(page);
  await expect.poll(() => version(page)).toBe("1");
  await page.click('nav button[data-id="tasks"]');
  await expect(page.locator("#app")).toContainText("Testaufgabe Eins");
  await page.click('button[data-a="newTask"]');
  await page.fill("#t-t", "Während des Rückbaus angelegt");
  await page.click('button[data-a="saveTask"]');
  await expect(page.locator("#app")).toContainText("Während des Rückbaus angelegt");

  // Erneutes Update auf 2.1
  await serve(port, null);
  await page.reload();
  await ready(page);
  await expect.poll(() => version(page)).toBe(APP);
  const s = await state(page);
  expect(s.v).toBe(SCHEMA);
  expect(s.metrics).toEqual(v21.metrics);
  expect(s.meetup).toEqual(v21.meetup);
  expect(s.suggest).toEqual(v21.suggest);
  expect(s.memory).toEqual(v21.memory);
  expect(s.tasks.map((t) => t.title)).toEqual([...v21.tasks.map((t) => t.title), "Während des Rückbaus angelegt"]);
  expect(s.conflicts).toEqual([]);
  expect(errors).toEqual([]);
});

test("Backups aus Version 1, erzeugt mit dem originalen Code, lassen sich auf einem anderen Gerät mit 2.1 übernehmen", async ({ browser }, info) => {
  const port = 4340 + info.parallelIndex,
    base = `http://127.0.0.1:${port}/`;
  // Gerät A (Version 1) erzeugt ein Backup
  const a = await (await browser.newContext({ serviceWorkers: "block" })).newPage();
  await stubClipboard(a);
  await serve(port, LEGACY);
  await a.goto(base);
  await ready(a);
  await a.click('nav button[data-id="tasks"]');
  await a.click('button[data-a="newTask"]');
  await a.fill("#t-t", "Aufgabe von Gerät A");
  await a.click('button[data-a="saveTask"]');
  await a.click('nav button[data-id="more"]');
  await a.click('button[data-a="exp"]');
  const backup = await waitClip(a);
  // Gerät B (schon 2.1, eigene Daten) übernimmt es
  await serve(port, null);
  const b = await (await browser.newContext({ serviceWorkers: "block" })).newPage();
  await b.goto(base);
  await ready(b);
  await b.click('nav button[data-id="more"]');
  await b.fill("#imp", backup);
  await b.click('button[data-a="chkImp"]');
  await expect(b.locator("#impRes")).toContainText("Datenversion 1");
  await b.click('button[data-a="imp"]');
  await b.click('button[data-a="impGo"]');
  await expect(b.locator("#toast")).toContainText("1 Einträge übernommen");
  expect((await state(b)).tasks.map((t) => t.title)).toEqual(["Aufgabe von Gerät A"]);
});

// ---------- Update von der aktuell installierten Version 2.1 (main, Stand c8a17db) ----------
const V21 = "tests/fixtures/legacy-v21";
test("Aktualisierung 2.1 → aktuelle Version: Daten bleiben, Studio wird ergänzt, Sicherheitskopie, offline lauffähig", async ({ page }, info) => {
  const port = 4360 + info.parallelIndex,
    base = `http://127.0.0.1:${port}/`;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await serve(port, V21);
  await page.goto(base);
  await ready(page);
  await expect.poll(() => version(page)).toBe("2.1.0");
  await page.evaluate(async (s) => kvPut("state", s), v2State());
  await page.reload();
  await ready(page);
  await page.click('[data-a="met"][data-id="m_signups"]');
  await page.fill("#v-v", "21");
  await page.click('button[data-a="saveVal"]');
  await page.click('#sheet button[data-a="close"]');
  await waitController(page);
  const before = await state(page);
  expect(before.v).toBe(3);
  await serve(port, null);
  await page.reload();
  await ready(page);
  await expect.poll(() => version(page)).toBe(APP);
  const after = await state(page);
  expect(after.v).toBe(SCHEMA);
  for (const k of ["memory", "tasks", "metrics", "meetup", "suggest", "conflicts", "dev", "accent", "lastBackup"]) expect(after[k], k).toEqual(before[k]);
  expect(after.studio.posts).toEqual([]);
  expect(after.studio.brand.website).toBe("vivalink.me");
  expect((await kv(page, "safety-v3")).data).toEqual(before);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).sort())).toEqual([CACHE]);
  await stop();
  await page.reload();
  await ready(page);
  expect(await version(page)).toBe(APP);
  await page.click('nav button[data-id="studio"]');
  await expect(page.locator("h1")).toHaveText("Instagram-Studio");
  expect(errors).toEqual([]);
});

test("Rückbau aktuelle Version → 2.1 → aktuelle Version: Instagram-Beiträge und alle Daten bleiben erhalten", async ({ page }, info) => {
  const port = 4380 + info.parallelIndex,
    base = `http://127.0.0.1:${port}/`;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await serve(port, null);
  await page.goto(base);
  await ready(page);
  await page.evaluate(async (s) => kvPut("state", s), v2State());
  await page.reload();
  await ready(page);
  await page.evaluate(() => {
    S.studio.posts.push(makePost({ date: "2026-12-01", pillar: "tipps", type: "einzelbild", title: "Rückbau-Testbeitrag", slides: [{ template: "frage", title: "x" }] }, "manuell"));
    return save();
  });
  await waitController(page);
  const v22 = await state(page);
  await serve(port, V21);
  await page.reload();
  await ready(page);
  await expect.poll(() => version(page)).toBe("2.1.0");
  await page.click('nav button[data-id="tasks"]');
  await page.click('button[data-a="newTask"]');
  await page.fill("#t-t", "In 2.1 während des Rückbaus angelegt");
  await page.click('button[data-a="saveTask"]');
  await expect(page.locator("#app")).toContainText("In 2.1 während des Rückbaus angelegt");
  await serve(port, null);
  await page.reload();
  await ready(page);
  await expect.poll(() => version(page)).toBe(APP);
  const s = await state(page);
  expect(s.studio.posts.map((p) => p.title)).toEqual(["Rückbau-Testbeitrag"]);
  expect(s.studio.brand).toEqual(v22.studio.brand);
  expect(s.metrics).toEqual(v22.metrics);
  expect(s.tasks.map((t) => t.title)).toContain("In 2.1 während des Rückbaus angelegt");
  expect(errors).toEqual([]);
});
