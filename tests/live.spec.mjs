// LIVE-Prüfung gegen die echte Testversion („VL Test“, GitHub Pages) und den echten Cloudflare-Server.
// Nur künstliche Demodaten. Läuft nur mit LIVE=1 (GitHub Actions: Ablauf „Live-Prüfung“, manuell gestartet).
// Zwei Geräte über die Oberfläche: einrichten, Wiederherstellungsschlüssel, koppeln mit Prüfzahl, beide Richtungen,
// Konflikt, Wiederherstellung auf neuem Gerät, Aufgaben-Postfach, Schlüsselwechsel (sperrt das alte Gerät).
import { test, expect, devices } from "@playwright/test";
import { holen, abgeben } from "../scripts/ki-aufgabe.mjs";

const BASE = process.env.LIVE_BASE || "https://vivalink-management.github.io/vivalink-ai-test/";
const SYNC = process.env.LIVE_SYNC || "https://vivalink-sync.hidden-art-0326.workers.dev";
test.skip(!process.env.LIVE, "nur mit LIVE=1");
test.setTimeout(180_000);

test("Live: Synchronisierung der Testversion über den echten Server", async ({ browser, browserName }) => {
  const out = { errors: [], ext: [] };
  async function device(dev) {
    const { defaultBrowserType, ...d } = devices[dev];
    const ctx = await browser.newContext({ ...d, serviceWorkers: "block" });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => out.errors.push(dev + ": " + e.message));
    p.on("request", (r) => {
      const u = r.url();
      if (!u.startsWith(BASE) && !u.startsWith(SYNC) && !/^(data|blob):/.test(u)) out.ext.push(u);
    });
    await p.goto(BASE);
    await p.waitForFunction(() => typeof S !== "undefined" && S && S.studio);
    return p;
  }
  const toast = async (p, t) => p.waitForFunction((t) => (document.querySelector("#toast") || {}).textContent?.includes(t), t, { timeout: 30000 });
  const A = await device("iPhone 15");
  // künstliche Demodaten laden (zweimal tippen)
  await A.click('nav button[data-id="more"]'); await A.click('button[data-a="demoLoad"]'); await A.click('button[data-a="demoLoad"]'); await A.waitForTimeout(500);
  out.demoTasks = await A.evaluate(() => S.tasks.length);
  await A.click('nav button[data-id="more"]'); await A.click('button[data-a="sync"]'); await A.click('button[data-a="syNew"]');
  await toast(A, "Synchronisierung eingerichtet");
  const rec = await A.inputValue("#syRecKey");
  out.recoveryKey = /^[A-Z2-9]{4}(-[A-Z2-9]{4}){7}$/.test(rec);
  await A.click('button[data-a="syRecDone"]');
  await A.click('button[data-a="syAdd"]');
  const code = (await A.locator("#syCodeOut").textContent()).trim();
  const B = await device("iPad (gen 7)");
  await B.click('nav button[data-id="more"]'); await B.click('button[data-a="sync"]');
  await B.fill("#syIn", code); await B.click('button[data-a="syJoin"]');
  const sasB = (await B.locator("#sySas").textContent()).trim();
  await A.locator("#sySas").waitFor({ timeout: 20000 });
  const sasA = (await A.locator("#sySas").textContent()).trim();
  out.sasMatch = sasA === sasB;
  await A.click('button[data-a="syPairOk"]');
  await toast(B, "Synchronisiert");
  out.bTasks = await B.evaluate(() => S.tasks.length);
  // Änderung auf dem iPad → iPhone
  await B.evaluate(async () => { const x = { id: "live-ipad", title: "Auf dem iPad (Testdaten)", prio: "mittel", area: "App", due: "", done: false }; touch(x); S.tasks.push(x); await save(); return syncOnce(); });
  out.aPull = await A.evaluate(() => syncOnce());
  out.aHas = await A.evaluate(() => S.tasks.some((t) => t.id === "live-ipad"));
  // Konflikt
  const tid = await A.evaluate(() => S.tasks.find((t) => !t.done).id);
  await A.evaluate((id) => { const t = S.tasks.find((x) => x.id === id); t.title = "Version iPhone"; touch(t); return save(); }, tid);
  await B.evaluate((id) => { const t = S.tasks.find((x) => x.id === id); t.title = "Version iPad"; touch(t); return save(); }, tid);
  await A.evaluate(() => syncOnce());
  out.conflicts = (await B.evaluate(() => syncOnce())).conflicts;
  // Wiederherstellung auf einem neuen Gerät
  const C = await device("iPhone 15");
  out.recover = await C.evaluate((r) => syncRecover(r), rec).then((r) => r.ok);
  out.cTasks = await C.evaluate(() => S.tasks.length);
  // Aufgaben-Postfach
  const tk = await A.evaluate(async () => { const t = (await taskSetup()).token; await taskPublish(); return t; });
  const pkg = await holen(SYNC, tk);
  out.pkg = !!(pkg && pkg.studio && pkg.analyse);
  await abgeben(SYNC, { analysis: { text: "Künstliche Wochenanalyse für den Live-Test der Testversion (keine echten Daten)." } }, pkg.id, tk);
  out.taskFetch = await A.evaluate(() => taskFetch()).then((r) => r.ok && r.analysis);
  // Schlüsselwechsel: iPad und neues Gerät gesperrt
  out.rotate = await A.evaluate(() => syncRotate()).then((r) => r.ok);
  out.bBlocked = await B.evaluate(() => syncOnce()).then((r) => !r.ok && /gesperrt/.test(r.error));
  // aufräumen: Kopplung des iPhones lösen (Daten bleiben nur im Browser dieses Tests)
  await A.evaluate(() => syncRotate());

  expect(out).toMatchObject({ errors: [], ext: [], recoveryKey: true, sasMatch: true, aHas: true, conflicts: 1, recover: true, pkg: true, taskFetch: true, rotate: true, bBlocked: true });
  expect(out.bTasks).toBe(out.demoTasks);
});
