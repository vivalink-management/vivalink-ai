// Update vom veröffentlichten Stand 2.10.0 (Originalcode, tests/fixtures/legacy-v2100) auf 2.11 (KI-Chat) – mit einem
// Zustand wie beim Gründer: gekoppelte Synchronisierung und Verwaltung, Testkonten gekennzeichnet (0 echte Nutzer,
// 4 Testkonten getrennt), alte ungeprüfte Werte, Aufgaben. Danach Rückbau auf 2.10.0 und wieder 2.11.
// Nur künstliche Daten; nichts wird an echte Server gesendet.
import { test, expect } from "@playwright/test";
import { APP } from "./version.mjs";
import { spawn } from "node:child_process";
import { ready, state } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";

test.use({ serviceWorkers: "allow" });
const V2100 = "tests/fixtures/legacy-v2100";
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

test("2.10.0 (Zustand wie beim Gründer) → 2.11 → Rückbau → 2.11: Geräteverbindungen, verifizierte Kennzahlen, Testdaten, Aufgaben und Chats bleiben", async ({ page }, info) => {
  test.setTimeout(120_000);
  const port = 4420 + info.parallelIndex;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.context().route((u) => !u.href.startsWith(`http://127.0.0.1:${port}/`), (r) => r.abort()); // keine echten Server
  await serve(port, V2100);
  await page.goto(`http://127.0.0.1:${port}/`);
  await ready(page);
  expect(await version(page)).toBe("2.10.0");
  await page.evaluate(async (s) => kvPut("state", s), v2State());
  await page.reload();
  await ready(page);
  // Zustand wie beim Gründer nach der Umstellung: 0 echte Nutzer (verifiziert), 4 Testkonten getrennt, alte ungeprüfte Werte
  await page.evaluate(async () => {
    const m = (k) => S.metrics.find((x) => x.key === k);
    addVal(m("reg_total").id, { date: "2026-11-26", value: 4, status: "confirmed", src: "verwaltung" }); // aus 2.9 (ungeprüft)
    addVal(m("reg_total").id, { date: "2026-11-27", value: 0, status: "confirmed", src: "verwaltung", real: true });
    addVal(m("active_users").id, { date: "2026-11-27", value: 0, status: "confirmed", src: "verwaltung", real: true });
    await kvPut("sync-config", { vid: "a".repeat(32), token: "b".repeat(64), mk: "c", kv: 1, version: 12, last: Date.now(), devices: { iPad: 1 }, recoveryAt: Date.now() });
    await kvPut("kpi-config", { token: "d".repeat(64), since: 1, last: Date.now(), fails: 0, lastError: null, meta: { excludesTestAccounts: true, excludesDemoMeetups: true, testData: { accounts: 4, bookings: 3, invitations: 2, payments: 27, refunds: 0 } } });
    S.tasks.push({ id: "t-210", title: "Aufgabe aus 2.10.0", prio: "hoch", area: "App", due: "", done: false, updatedAt: Date.now() });
    await save();
  });
  await waitController(page);
  const before = await state(page);
  const kvBefore = await page.evaluate(async (K) => Object.fromEntries(await Promise.all(K.map(async (k) => [k, await kvGet(k)]))), KV);

  // → 2.11: alles erhalten, Datenversion 5 mit Sicherheitskopie, Chat funktioniert mit den echten Zahlen
  await switchTo(page, port, null, APP);
  let s = await state(page);
  for (const k of ["tasks", "memory", "meetup", "metrics"]) expect(s[k], k).toEqual(before[k]);
  expect(s.v).toBe(5);
  expect(await page.evaluate(async (K) => Object.fromEntries(await Promise.all(K.map(async (k) => [k, await kvGet(k)]))), KV)).toEqual(kvBefore);
  await page.click('nav button[data-id="ai"]');
  await page.click('button[data-a="chatNew"]');
  await page.fill("#chatIn", "Analysiere die aktuellen Kennzahlen von Vivalink.");
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => page.evaluate(() => S.chatMsgs.length)).toBe(2);
  const a = page.locator(".msg.ai .bub").last();
  await expect(a.locator(".cb-fakt", { hasText: "Gesamtzahl der Registrierungen: 0" })).toHaveCount(1);
  await expect(a.locator(".cb-test")).toContainText("4 Testkonten");
  await expect(a).not.toContainText("Gesamtzahl der Registrierungen: 4");
  await page.fill("#chatIn", "Welche Aufgaben sind offen?");
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => page.evaluate(() => S.chatMsgs.length)).toBe(4);
  await expect(page.locator(".msg.ai .bub").last()).toContainText("Aufgabe aus 2.10.0");
  s = await state(page);
  const chats = s.chats,
    msgs = s.chatMsgs;

  // Rückbau auf 2.10.0: läuft fehlerfrei, Chats bleiben unverändert erhalten, Kennzahlen weiter verifiziert
  await switchTo(page, port, V2100, "2.10.0");
  s = await state(page);
  expect(s.chats).toEqual(chats);
  expect(s.chatMsgs).toEqual(msgs);
  expect(s.metrics).toEqual(before.metrics);
  // wieder 2.11: Chat weiterführen
  await switchTo(page, port, null, APP);
  await page.click('nav button[data-id="ai"]');
  await page.locator('[data-a="chatOpen"]').first().click();
  await page.fill("#chatIn", "Welche Maßnahmen würdest du jetzt empfehlen?");
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => page.evaluate(() => S.chatMsgs.length)).toBe(6);
  expect(await page.evaluate(async (K) => Object.fromEntries(await Promise.all(K.map(async (k) => [k, await kvGet(k)]))), KV)).toEqual(kvBefore);
  expect(errors).toEqual([]);
});
