// Update vom veröffentlichten Stand 2.11.1 (Originalcode, tests/fixtures/legacy-v2111) auf 2.12 und Rückbau – mit Chats
// (geschrieben und gesprochen), Aufträgen mit Rückgängig, Aufgaben, Gedächtnis, Kennzahlen und Gerätekopplungen.
// 2.12 fügt nur optionale Felder hinzu (Vorschläge in Chat-Aufträgen, Schutzschlüssel an Aufgaben, Sprachprotokoll auf
// dem Gerät); die Datenversion bleibt 5. Nur künstliche Daten; nichts wird an echte Server gesendet.
import { test, expect } from "@playwright/test";
import { APP } from "./version.mjs";
import { spawn } from "node:child_process";
import { ready, state } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";

test.use({ serviceWorkers: "allow" });
const V2111 = "tests/fixtures/legacy-v2111";
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
const version = (page) => page.evaluate(() => APP_VERSION);
async function waitController(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
    await page.reload();
    await ready(page);
  }
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 10_000 }).toBe(true);
}
async function switchTo(page, port, root, v) {
  await serve(port, root);
  await page.reload();
  await ready(page);
  await expect.poll(() => version(page), { timeout: 15_000 }).toBe(v);
  await waitController(page);
}
const KV = ["sync-config", "kpi-config", "ki-config", "voice-config"];
const kvAll = (page) => page.evaluate(async (K) => Object.fromEntries(await Promise.all(K.map(async (k) => [k, await kvGet(k)]))), KV);

test("2.11.1 → 2.12 → Rückbau → 2.12: Chats, Aufträge, Aufgaben, Gedächtnis, Kennzahlen und Kopplungen bleiben", async ({ page }, info) => {
  test.setTimeout(120_000);
  const port = 4440 + info.parallelIndex;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.context().route((u) => !u.href.startsWith(`http://127.0.0.1:${port}/`), (r) => r.abort()); // keine echten Server
  await serve(port, V2111);
  await page.goto(`http://127.0.0.1:${port}/`);
  await ready(page);
  expect(await version(page)).toBe("2.11.1");
  await page.evaluate(async (s) => kvPut("state", s), v2State());
  await page.reload();
  await ready(page);
  // Zustand in 2.11.1: Chat mit Auftrag (angelegt, dann rückgängig), gesprochene Nachricht, Kopplungen
  await page.evaluate(async () => {
    await kvPut("sync-config", { vid: "a".repeat(32), token: "b".repeat(64), mk: "c", kv: 1, version: 12, last: Date.now(), devices: { iPad: 1 } });
    await kvPut("kpi-config", { token: "d".repeat(64), since: 1, last: Date.now(), fails: 0, lastError: null });
    await kvPut("voice-config", { voice: "Anna", rate: 1.1, barge: false });
  });
  await page.click('nav button[data-id="ai"]');
  await page.click('button[data-a="chatNew"]');
  await page.fill("#chatIn", "Lege eine Aufgabe an: Aufgabe aus 2.11.1");
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => page.evaluate(() => S.chatMsgs.length)).toBe(2);
  await page.evaluate(async () => {
    const c = S.chats.find((x) => !x.deleted);
    addMsg(c, { role: "user", text: "Gesprochene Frage aus 2.11.1", via: "voice" });
    await save();
  });
  await waitController(page);
  const before = await state(page);
  const kvBefore = await kvAll(page);

  // → 2.12: alles erhalten; reine Frage legt nichts an, Vorschlag wird gespeichert
  await switchTo(page, port, null, APP);
  let s = await state(page);
  for (const k of ["tasks", "memory", "meetup", "metrics", "chats", "chatMsgs"]) expect(s[k], k).toEqual(before[k]);
  expect(s.v).toBe(5);
  expect(await kvAll(page)).toEqual(kvBefore);
  await page.click('nav button[data-id="ai"]');
  await page.locator('[data-a="chatOpen"]').first().click();
  await expect(page.locator(".msg.ai .bub").first()).toContainText("Aufgabe aus 2.11.1");
  await page.fill("#chatIn", "Was empfiehlst du als nächste Aufgabe?");
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => page.evaluate(() => S.chatMsgs.length)).toBe(before.chatMsgs.length + 2);
  expect((await state(page)).tasks.filter((t) => !t.deleted)).toEqual(before.tasks.filter((t) => !t.deleted));
  // ein Vorschlag (neuer Status) zum Prüfen des Rückbaus
  await page.evaluate(async () => {
    const c = S.chats.find((x) => !x.deleted);
    addMsg(c, { role: "assistant", text: "Vorschlag", engine: "ki", blocks: [{ k: "ki", t: "Vorschlag" }], actions: [{ id: "v1", type: "task.add", args: { title: "Vorschlag aus 2.12" }, title: "Aufgabe anlegen: „Vorschlag aus 2.12“", lvl: 1, status: "vorschlag", note: "Nicht ausgeführt", key: "x:vorschlag" }] });
    await save();
  });
  s = await state(page);
  const chats = s.chats,
    msgs = s.chatMsgs,
    tasks = s.tasks;

  // Rückbau auf 2.11.1: läuft fehlerfrei, zeigt den Chat, Daten unverändert; Vorschlag wird nicht ausgeführt
  await switchTo(page, port, V2111, "2.11.1");
  s = await state(page);
  expect(s.chats).toEqual(chats);
  expect(s.chatMsgs).toEqual(msgs);
  expect(s.tasks).toEqual(tasks);
  await page.click('nav button[data-id="ai"]');
  await page.locator('[data-a="chatOpen"]').first().click();
  await expect(page.locator(".msg.ai .bub").last()).toContainText("Vorschlag aus 2.12");
  expect((await state(page)).tasks).toEqual(tasks);
  // wieder 2.12: Vorschlag ausführbar, genau einmal
  await switchTo(page, port, null, APP);
  await page.click('nav button[data-id="ai"]');
  await page.locator('[data-a="chatOpen"]').first().click();
  const last = page.locator(".msg.ai .bub").last();
  await last.locator('button[data-a="chatAct"]').dblclick();
  await expect(last.locator(".ca")).toContainText("✅ erledigt");
  s = await state(page);
  expect(s.tasks.filter((t) => !t.deleted && t.title === "Vorschlag aus 2.12").length).toBe(1);
  expect(await kvAll(page)).toEqual(kvBefore);
  expect(errors).toEqual([]);
});
