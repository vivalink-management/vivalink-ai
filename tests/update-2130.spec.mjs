// Update vom veröffentlichten Stand 2.12.1 (Originalcode, tests/fixtures/legacy-v2121) auf 2.13 und Rückbau – mit Chats
// (geschrieben und gesprochen), Aufträgen mit Rückgängig, Aufgaben, Gedächtnis, Kennzahlen und Gerätekopplungen.
// 2.13 speichert Unternehmensprofil und Playbook-Freigabe als besondere Gedächtniseinträge (Bereich „KI“); die
// Datenversion bleibt 5. Ältere Versionen zeigen sie als normale Einträge. Nur künstliche Daten; nichts wird an echte Server gesendet.
import { test, expect } from "@playwright/test";
import { APP } from "./version.mjs";
import { spawn } from "node:child_process";
import { ready, state } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";

test.use({ serviceWorkers: "allow" });
const V2121 = "tests/fixtures/legacy-v2121";
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

test("2.12.1 → 2.13 → Rückbau → 2.13: Profil und Playbook-Freigabe, Chats, Gedächtnis, Aufgaben, Kopplungen bleiben", async ({ page }, info) => {
  test.setTimeout(120_000);
  const port = 4460 + info.parallelIndex;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.context().route((u) => !u.href.startsWith(`http://127.0.0.1:${port}/`), (r) => r.abort()); // keine echten Server
  await serve(port, V2121);
  await page.goto(`http://127.0.0.1:${port}/`);
  await ready(page);
  expect(await version(page)).toBe("2.12.1");
  await page.evaluate(async (s) => kvPut("state", s), v2State());
  await page.reload();
  await ready(page);
  await page.evaluate(async () => {
    await kvPut("sync-config", { vid: "a".repeat(32), token: "b".repeat(64), mk: "c", kv: 1, version: 12, last: Date.now(), devices: { iPad: 1 } });
    await kvPut("ki-config", { on: false, freigaben: { kennzahlen: true } });
    await kvPut("voice-config", { voice: "Anna", rate: 1.1, barge: false });
    S.memory.push({ id: uid(), cat: "Geschäftsmodell", title: "Testangebot aus 2.12.1", text: "künstlich", status: "confirmed", active: true, private: false, date: "2026-02-01", createdAt: 1 });
    const c = newChat("Chat aus 2.12.1");
    addMsg(c, { role: "user", text: "Frage aus 2.12.1", via: "voice" });
    await save();
  });
  await waitController(page);
  const before = await state(page);
  const kvBefore = await kvAll(page);

  // → 2.13: alles erhalten; Profil anlegen und freigeben, Playbook freigeben
  await switchTo(page, port, null, APP);
  let s = await state(page);
  for (const k of ["tasks", "memory", "meetup", "metrics", "chats", "chatMsgs"]) expect(s[k], k).toEqual(before[k]);
  expect(s.v).toBe(5);
  expect(await kvAll(page)).toEqual(kvBefore);
  await page.evaluate(async () => {
    profileSave(profileDraft(), true);
    playbookSetApproved(true);
    await save();
  });
  expect(await page.evaluate(() => profileForKi())).toContain("Testangebot aus 2.12.1");
  s = await state(page);
  const mem = s.memory;

  // Rückbau auf 2.12.1: läuft fehlerfrei, Einträge bleiben unverändert erhalten (als normale Gedächtniseinträge sichtbar)
  await switchTo(page, port, V2121, "2.12.1");
  s = await state(page);
  expect(s.memory).toEqual(mem);
  await page.click('nav button[data-id="memory"]');
  await expect(page.locator("#app")).toContainText("Unternehmensprofil für die KI"); // in 2.12.1 als normaler Eintrag sichtbar
  await page.click('nav button[data-id="ai"]');
  // wieder 2.13: Profil weiterhin freigegeben und genutzt, Playbook freigegeben
  await switchTo(page, port, null, APP);
  expect(await page.evaluate(() => profileForKi())).toContain("Testangebot aus 2.12.1");
  expect(await page.evaluate(() => playbookApproved())).toBe(true);
  s = await state(page);
  expect(s.memory).toEqual(mem);
  expect(s.chatMsgs).toEqual(before.chatMsgs);
  expect(await kvAll(page)).toEqual(kvBefore);
  expect(errors).toEqual([]);
});
