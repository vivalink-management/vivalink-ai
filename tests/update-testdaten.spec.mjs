// Update 2.9.0 → aktuelle Version → Rückbau auf 2.9.0 → wieder aktuell, mit dem ORIGINALEN Code von 2.9.0
// (tests/fixtures/legacy-v290). Prüft das neue Kennzeichen „real“ an Werten aus der Verwaltung:
// Alte Werte (ohne Kennzeichen, möglicherweise mit Testkonten) bleiben gespeichert, werden aber nicht verwendet;
// verifizierte Werte überstehen einen Rückbau. Keine Daten gehen verloren. Nur künstliche Daten, nichts wird gesendet.
import { test, expect } from "@playwright/test";
import { APP } from "./version.mjs";
import { spawn } from "node:child_process";
import { ready, state } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";

test.use({ serviceWorkers: "allow" });
const V290 = "tests/fixtures/legacy-v290";
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
const verw = (s, key) => s.metrics.find((m) => m.key === key).entries.filter((e) => !e.deleted && e.src === "verwaltung");

test("Update 2.9.0 → aktuell → Rückbau → aktuell: Werte aus der Verwaltung bleiben erhalten, ungeprüfte werden nicht verwendet", async ({ page }, info) => {
  test.setTimeout(90_000);
  const port = 4400 + info.parallelIndex;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Keine Anfrage an echte Server (Synchronisierung, Verwaltung)
  await page.context().route((u) => !u.href.startsWith(`http://127.0.0.1:${port}/`), (r) => r.abort());
  await serve(port, V290);
  await page.goto(`http://127.0.0.1:${port}/`);
  await ready(page);
  expect(await version(page)).toBe("2.9.0");
  // 2.9.0: Werte wie damals aus der Verwaltung (ohne Kennzeichen, enthielten die Testkonten) + eigene Eingaben
  await page.evaluate(async (s) => kvPut("state", s), v2State());
  await page.reload();
  await ready(page);
  await page.evaluate(() => {
    const add = (k, d, v, src) => addVal(S.metrics.find((m) => m.key === k).id, { date: d, value: v, status: "confirmed", src });
    add("reg_total", "2026-11-26", 4, "verwaltung");
    add("active_users", "2026-11-26", 4, "verwaltung");
    add("ig_fol", "2026-11-25", 321, "manual");
    S.tasks.push({ id: "t-upd", title: "Aufgabe aus 2.9.0", prio: "hoch", area: "App", due: "", done: false, updatedAt: Date.now() });
    return save();
  });
  await waitController(page);
  const v290 = await state(page);

  // → aktuelle Version: nichts verloren; alte Verwaltungswerte gespeichert, aber nicht verwendet; eigene Werte unverändert
  await switchTo(page, port, null, APP);
  let s = await state(page);
  expect(s.tasks).toEqual(v290.tasks);
  expect(s.metrics).toEqual(v290.metrics); // Daten unverändert (keine Umschreibung)
  let r = await page.evaluate(() => ({ reg: cur(S.metrics.find((m) => m.key === "reg_total")), ig: cur(S.metrics.find((m) => m.key === "ig_fol")).value }));
  expect(r.reg).toBeNull();
  expect(r.ig).toBe(321);
  // verifizierter Wert (Testkonten ausgeschlossen) für denselben Tag ersetzt den alten Wert, kein Doppel
  await page.evaluate(() => {
    addVal(S.metrics.find((m) => m.key === "reg_total").id, { date: "2026-11-26", value: 0, status: "confirmed", src: "verwaltung", real: true });
    return save();
  });
  s = await state(page);
  expect(verw(s, "reg_total").map((e) => [e.value, e.real])).toEqual([[0, true]]);
  const cur1 = s;

  // Rückbau auf 2.9.0: alle Daten (inkl. Kennzeichen) bleiben, die alte Version läuft fehlerfrei
  await switchTo(page, port, V290, "2.9.0");
  s = await state(page);
  expect(s.metrics).toEqual(cur1.metrics);
  expect(s.tasks).toEqual(cur1.tasks);
  await page.evaluate(() => {
    S.tasks.push({ id: "t-rb", title: "Im Rückbau angelegt", prio: "mittel", area: "App", due: "", done: false, updatedAt: Date.now() });
    return save();
  });

  // wieder aktuell: Kennzeichen erhalten, verifizierter Wert wird verwendet, im Rückbau Angelegtes vorhanden
  await switchTo(page, port, null, APP);
  s = await state(page);
  expect(verw(s, "reg_total").map((e) => [e.value, e.real])).toEqual([[0, true]]);
  expect(verw(s, "active_users").map((e) => [e.value, e.real ?? null])).toEqual([[4, null]]); // alt, ungeprüft, gespeichert
  expect(s.tasks.map((t) => t.id)).toEqual(expect.arrayContaining(["t-upd", "t-rb"]));
  r = await page.evaluate(() => ({ reg: cur(S.metrics.find((m) => m.key === "reg_total")).value, act: cur(S.metrics.find((m) => m.key === "active_users")) }));
  expect(r).toEqual({ reg: 0, act: null });
  expect(errors).toEqual([]);
});
