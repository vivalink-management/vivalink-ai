// Zwei Geräte mit jeweils EIGENEM Datenspeicher (beide haben „Synchronisierung einrichten“ gewählt) werden
// zusammengeführt: nichts geht verloren, gleichzeitige Änderungen bleiben als Konflikt mit beiden Fassungen erhalten,
// nichts wird unbemerkt überschrieben oder gelöscht; bei Fehlern bleibt alles wie vorher. Nur künstliche Daten.
import { test, expect } from "@playwright/test";
import { ready, state, kv, expectToast } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";

const BASE = "http://127.0.0.1:4173";
async function device(browser, name, mutate) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript((u) => (window.VL_SYNC_URL = u), BASE);
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(name + ": " + e.message));
  await p.goto("/");
  await ready(p);
  if (mutate)
    await p.evaluate(
      async ([s, name, m]) => {
        S = s;
        S.dev = "dev-" + name;
        migrate();
        new Function("S", "touch", "uid", m)(S, touch, uid);
        await save();
      },
      [v2State(), name, mutate],
    );
  return p;
}
// iPhone und iPad: gemeinsamer Ausgangsstand (gleiche IDs), danach unterschiedlich weitergearbeitet
const IPHONE = `
  S.tasks.push({ id: "t-iphone", title: "Nur auf dem iPhone", prio: "mittel", area: "App", due: "", done: false, updatedAt: Date.now() });
  S.metrics.find((m) => m.key === "reg_week").entries.push({ id: "e-iphone", date: "2026-01-15", value: 11, status: "confirmed", src: "manual", note: "", updatedAt: Date.now() });
  const t = S.tasks[0]; t.title = "Fassung iPhone"; t.updatedAt = Date.now() + 5;`;
const IPAD = `
  S.tasks.push({ id: "t-ipad", title: "Nur auf dem iPad", prio: "hoch", area: "Meetup", due: "", done: false, updatedAt: Date.now() });
  S.memory.push({ id: "m-ipad", cat: "Ziele", title: "Wissen nur auf dem iPad", text: "künstlich", status: "confirmed", date: "2026-01-10", active: true, private: false, createdAt: Date.now(), updatedAt: Date.now() });
  const t = S.tasks[0]; t.title = "Fassung iPad"; t.updatedAt = Date.now() + 7;`;
const ids = (s) => ({ tasks: s.tasks.map((x) => x.id).sort(), memory: s.memory.map((x) => x.id).sort(), values: s.metrics.flatMap((m) => m.entries.map((e) => e.id)).sort() });
const union = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, [...new Set([...a[k], ...b[k]])].sort()]));

test("Zwei getrennte Datenspeicher → zusammengeführt in der Oberfläche: nichts verloren, Konflikt mit beiden Fassungen, alte Schlüssel gesperrt", async ({ browser }) => {
  const A = await device(browser, "iPhone", IPHONE);
  const B = await device(browser, "iPad", IPAD);
  const RA = (await A.evaluate(() => syncCreate())).recovery;
  const RB = (await B.evaluate(() => syncCreate())).recovery;
  const [sa, sb] = [await state(A), await state(B)];
  const want = union(ids(sa), ids(sb));
  const oldVidB = (await kv(B, "sync-config")).vid;
  expect((await kv(A, "sync-config")).vid).not.toBe(oldVidB); // Ausgangslage wie bei den echten Geräten
  // iPad: Hinweis „Nur dieses Gerät ist verbunden“ mit Zusammenführen
  await B.click('nav button[data-id="more"]');
  await B.click('button[data-a="sync"]');
  await expect(B.locator("#syMergeCard")).toBeVisible();
  // iPhone: „Weiteres Gerät koppeln“ (Oberfläche), iPad gibt den Code ein
  await A.click('nav button[data-id="more"]');
  await A.click('button[data-a="sync"]');
  await A.click('button[data-a="syAdd"]');
  const code = (await A.locator("#syCodeOut").textContent()).trim();
  await B.fill("#syMergeIn", code);
  await B.click('button[data-a="syMerge"]');
  const sasB = (await B.locator("#sySas").textContent()).trim();
  await A.locator("#sySas").waitFor({ timeout: 15000 });
  expect((await A.locator("#sySas").textContent()).trim()).toBe(sasB);
  await A.click('button[data-a="syPairOk"]');
  await expect(B.locator("#syMerged")).toBeVisible({ timeout: 15000 });
  await expectToast(B, "Zusammengeführt");
  const RN = await B.inputValue("#syRecKey");
  // iPad hat alles von beiden Geräten
  let st = await state(B);
  expect(ids(st)).toEqual(want);
  const conflict = st.conflicts.find((c) => !c.resolved && c.coll === "tasks");
  expect(conflict).toBeTruthy();
  expect(JSON.stringify(conflict)).toContain("Fassung iPhone");
  expect(JSON.stringify(conflict)).toContain("Fassung iPad");
  // Sicherungspunkte vorhanden, Vorgang protokolliert
  expect(await B.evaluate(() => ACTIONS.some((a) => a.name === "sync.merge" && a.ok))).toBe(true);
  expect(await B.evaluate(async () => !!(await kvGet("snap-" + today())))).toBe(true);
  // iPhone holt den vereinten Stand
  expect((await A.evaluate(() => syncOnce())).ok).toBe(true);
  expect(ids(await state(A))).toEqual(want);
  expect((await state(A)).conflicts.some((c) => !c.resolved && c.coll === "tasks")).toBe(true);
  // Beide Geräte stehen in der Geräteliste; der Hinweis verschwindet
  await A.click('#sheet button[data-a="close"]');
  await A.click('button[data-a="sync"]');
  await expect(A.locator("#sheet")).toContainText("(dieses)");
  await expect(A.locator("#syMergeCard")).toHaveCount(0);
  expect(Object.keys((await kv(A, "sync-config")).devices)).toHaveLength(2);
  // Alter iPad-Speicher gesperrt (Inhalt auf dem Server gelöscht), beide alten Schlüssel ungültig, der neue funktioniert
  const dump = await (await A.request.get(BASE + "/__vault-dump")).json();
  expect(dump.filter((v) => v.revoked).length).toBeGreaterThanOrEqual(1);
  const C = await device(browser, "Neues Gerät");
  for (const R of [RA, RB]) expect((await C.evaluate((r) => syncRecover(r), R)).ok).toBe(false);
  expect((await C.evaluate((r) => syncRecover(r), RN)).ok).toBe(true);
  expect(ids(await state(C))).toEqual(want);
  // Weitere Änderung fließt wieder in beide Richtungen
  await A.evaluate(async () => {
    const x = { id: "t-danach", title: "Nach dem Zusammenführen", prio: "mittel", area: "App", due: "", done: false };
    touch(x);
    S.tasks.push(x);
    await save();
    return syncOnce();
  });
  await B.evaluate(() => syncOnce());
  expect((await state(B)).tasks.some((t) => t.id === "t-danach")).toBe(true);
  expect([...A.errors, ...B.errors, ...C.errors]).toEqual([]);
});

test("Fehler beim Zusammenführen (Daten des anderen Geräts unlesbar): bisherige Synchronisierung bleibt, nichts geht verloren", async ({ browser }) => {
  const A = await device(browser, "iPhone", IPHONE);
  const B = await device(browser, "iPad", IPAD);
  await A.evaluate(() => syncCreate());
  await B.evaluate(() => syncCreate());
  // Tresor des iPhones auf dem Server beschädigen
  await A.evaluate(async () => {
    const K = await vaultAccess(await kvGet("sync-config"));
    const cur = await httpTransport(VL_SYNC_URL).get(K);
    const o = JSON.parse(cur.blob);
    o.ct = o.ct.slice(0, -8) + "AAAAAAA=";
    await httpTransport(VL_SYNC_URL).put(K, JSON.stringify(o), cur.version);
  });
  const cfgBefore = await kv(B, "sync-config");
  const before = ids(await state(B));
  const code = await A.evaluate(async () => (await pairStart()).code);
  await B.evaluate((c) => pairJoin(c), code);
  await A.evaluate(() => pairCheckA());
  await A.evaluate(() => pairApprove());
  const r = await B.evaluate(() => pairCheckB());
  expect(r).toMatchObject({ state: "error", error: expect.stringContaining("bisherige Synchronisierung bleibt aktiv") });
  expect((await kv(B, "sync-config")).vid).toBe(cfgBefore.vid);
  expect(ids(await state(B))).toEqual(before);
  expect((await B.evaluate(() => syncOnce())).ok).toBe(true); // eigener Speicher weiter nutzbar, nicht gesperrt
});

test("Beide Geräte nutzen schon denselben Speicher: Zusammenführen ändert nichts und sperrt nichts", async ({ browser }) => {
  const A = await device(browser, "iPhone", IPHONE);
  const B = await device(browser, "iPad", "");
  await A.evaluate(() => syncCreate());
  let code = await A.evaluate(async () => (await pairStart()).code);
  await B.evaluate((c) => pairJoin(c), code);
  await A.evaluate(() => pairCheckA());
  await A.evaluate(() => pairApprove());
  expect((await B.evaluate(() => pairCheckB())).state).toBe("done");
  code = await A.evaluate(async () => (await pairStart()).code);
  await B.evaluate((c) => pairJoin(c), code);
  await A.evaluate(() => pairCheckA());
  await A.evaluate(() => pairApprove());
  const r = await B.evaluate(() => pairCheckB());
  expect(r).toMatchObject({ state: "done", detail: expect.stringContaining("bereits denselben") });
  expect((await A.evaluate(() => syncOnce())).ok).toBe(true);
  expect((await B.evaluate(() => syncOnce())).ok).toBe(true);
});
