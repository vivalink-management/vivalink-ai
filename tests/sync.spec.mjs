// Synchronisierung iPhone ↔ iPad (Ende-zu-Ende verschlüsselt) gegen den Test-Tresor (gleiche Logik wie der spätere Worker).
import { test, expect } from "@playwright/test";
import { ready, state, kv, expectToast } from "./helpers.mjs";
import { v1State } from "./fixtures.mjs";

const BASE = "http://127.0.0.1:4173";
async function device(browser, name, withUrl = true) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  if (withUrl) await ctx.addInitScript((u) => (window.VL_SYNC_URL = u), BASE);
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(name + ": " + e.message));
  await p.goto("/");
  await ready(p);
  return p;
}
const syncNow = (p) => p.evaluate(() => syncOnce());
const vaultDump = async (p) => (await p.request.get(BASE + "/__vault-dump")).json();

test("Kopplung per Code: zweites Gerät erhält alle Daten; Server sieht nur verschlüsselte Inhalte", async ({ browser }) => {
  const a = await device(browser, "iPhone");
  await a.evaluate(async (s) => {
    S = s;
    migrate();
    S.tasks[0].title = "Geheime Testaufgabe Zebra";
    return save();
  }, v1State());
  await a.click('nav button[data-id="more"]');
  await a.click('button[data-a="sync"]');
  await a.click('button[data-a="syNew"]');
  await expectToast(a, "Synchronisiert");
  const code = await a.inputValue("#syCode");
  expect(code).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/);
  // Server: nur Prüfwert, Version, verschlüsselter Block – keine Klartexte
  const dump = await vaultDump(a);
  const mine = dump.filter((v) => v.blob && v.version >= 1);
  expect(mine.length).toBeGreaterThan(0);
  const raw = JSON.stringify(dump);
  for (const secret of ["Zebra", "Testziel", "kontakt@example.invalid", code.replace(/-/g, "")]) expect(raw).not.toContain(secret);
  expect(Object.keys(mine[0]).sort()).toEqual(["blob", "th", "updatedAt", "version"]);
  // Zweites Gerät koppeln
  const b = await device(browser, "iPad");
  await b.click('nav button[data-id="more"]');
  await b.click('button[data-a="sync"]');
  await b.fill("#syIn", code.toLowerCase());
  await b.click('button[data-a="syJoin"]');
  await expectToast(b, "Synchronisiert");
  const sb = await state(b);
  expect(sb.tasks.map((t) => t.title)).toContain("Geheime Testaufgabe Zebra");
  expect(sb.memory).toHaveLength(4);
  expect(sb.dev).not.toBe((await state(a)).dev); // Gerätekennung bleibt je Gerät
  // Code steht nicht im Backup und nicht in den Daten
  const bk = await b.evaluate(async () => JSON.stringify(await makeBackup()));
  expect(bk).not.toContain(code.replace(/-/g, ""));
  expect(a.errors.concat(b.errors)).toEqual([]);
});

test("Änderungen in beide Richtungen, Konflikt bei gleichzeitiger Änderung, kein endloses Hin und Her", async ({ browser }) => {
  const a = await device(browser, "iPhone");
  await a.evaluate(async (s) => {
    S = s;
    migrate();
    return save();
  }, v1State());
  const code = await a.evaluate(async () => {
    const c = newPairCode();
    await syncSetup(c);
    await syncOnce();
    return c;
  });
  const b = await device(browser, "iPad");
  await b.evaluate((c) => syncSetup(c).then(() => syncOnce()), code);
  // iPad legt etwas an → iPhone erhält es
  await b.evaluate(async () => {
    const x = { id: "tb1", title: "Auf dem iPad angelegt", prio: "mittel", area: "App", due: "", done: false };
    touch(x);
    S.tasks.push(x);
    await save();
    return syncOnce();
  });
  const ra = await syncNow(a);
  expect(ra).toMatchObject({ ok: true, pulled: 1 });
  expect((await state(a)).tasks.map((t) => t.title)).toContain("Auf dem iPad angelegt");
  // Vor der Übernahme wurde ein Rückgängig-Punkt angelegt
  expect((await kv(a, "pre-import")).label).toBe("Synchronisierung");
  // Beide ändern dieselbe Aufgabe offline → Konflikt wird erkannt, nichts geht verloren
  await a.evaluate(() => {
    const t = S.tasks.find((x) => x.id === "t1");
    t.title = "Version iPhone";
    touch(t);
    return save();
  });
  await b.evaluate(() => {
    const t = S.tasks.find((x) => x.id === "t1");
    t.title = "Version iPad";
    touch(t);
    return save();
  });
  await syncNow(a);
  const rb = await syncNow(b);
  expect(rb.conflicts).toBe(1);
  const c = (await state(b)).conflicts.find((x) => x.coll === "tasks");
  expect([c.kept.title, c.other.title].sort()).toEqual(["Version iPad", "Version iPhone"]);
  // Nach Angleichung: wiederholtes Synchronisieren schreibt keine neuen Versionen mehr
  await syncNow(a);
  await syncNow(b);
  const v1 = (await syncNow(a)).version;


  for (let i = 0; i < 3; i++) {
    await syncNow(b);
    await syncNow(a);
  }
  expect((await syncNow(a)).version).toBe(v1);
  expect(a.errors.concat(b.errors)).toEqual([]);
});

test("Gleichzeitiges Schreiben (Versionskonflikt am Server) wird automatisch zusammengeführt", async ({ browser }) => {
  const a = await device(browser, "iPhone");
  const r = await a.evaluate(async () => {
    const code = newPairCode();
    await syncSetup(code);
    await syncOnce();
    const K = await vaultKeys(code);
    const base = httpTransport(VL_SYNC_URL);
    let injected = false;
    // Anderes Gerät schreibt genau zwischen Holen und Schreiben dieses Geräts
    const racing = {
      get: (k) => base.get(k),
      async put(k, blob, expected) {
        if (!injected) {
          injected = true;
          const other = JSON.parse(JSON.stringify(S));
          other.tasks.push({ id: "race1", title: "Vom anderen Gerät", prio: "mittel", area: "App", due: "", done: false, updatedAt: Date.now() });
          await base.put(k, await seal(K, { format: SYNC_FORMAT, schema: SCHEMA, data: other, aitest: [] }), expected);
        }
        return base.put(k, blob, expected);
      },
    };
    S.tasks.push({ id: "mine1", title: "Von diesem Gerät", prio: "mittel", area: "App", due: "", done: false, updatedAt: Date.now() });
    await save();
    const res = await syncOnce(racing);
    const remote = await unseal(K, (await base.get(K)).blob);
    return { res, titles: remote.data.tasks.map((t) => t.title), local: S.tasks.map((t) => t.title) };
  });
  expect(r.res.ok).toBe(true);
  expect(r.titles).toEqual(expect.arrayContaining(["Vom anderen Gerät", "Von diesem Gerät"]));
  expect(r.local).toEqual(expect.arrayContaining(["Vom anderen Gerät", "Von diesem Gerät"]));
});

test("Manipulierte oder unlesbare Serverdaten: nichts wird verändert, Fehler wird protokolliert", async ({ browser }) => {
  const a = await device(browser, "iPhone");
  await a.evaluate(async (s) => {
    S = s;
    migrate();
    return save();
  }, v1State());
  const before = await a.evaluate(async () => {
    const code = newPairCode();
    await syncSetup(code);
    await syncOnce();
    const K = await vaultKeys(code);
    const cur = await httpTransport(VL_SYNC_URL).get(K);
    const o = JSON.parse(cur.blob);
    o.ct = o.ct.slice(0, -8) + "AAAAAAA=";
    await httpTransport(VL_SYNC_URL).put(K, JSON.stringify(o), cur.version);
    return JSON.stringify(S);
  });
  const r = await syncNow(a);
  expect(r.ok).toBe(false);
  expect(r.error).toContain("nicht entschlüsseln");
  expect(await a.evaluate(() => JSON.stringify(S))).toBe(before);
  expect(await a.evaluate(() => LOG.some((e) => e.code === "sync.fail"))).toBe(true);
  // Fremder Zugangs-Token wird vom Server abgewiesen
  const st = await a.evaluate(async () => {
    const K = await vaultKeys(newPairCode());
    const mine = await vaultKeys((await kvGet("sync-config")).code);
    return (await fetch(VL_SYNC_URL + "/v1/vault/" + mine.id, { headers: { authorization: "Bearer " + K.token } })).status;
  });
  expect(st).toBe(401);
});

test("Ohne Freigabe: Synchronisierung ist nur vorbereitet und sendet nichts", async ({ browser }) => {
  const a = await device(browser, "iPhone", false);
  await a.click('nav button[data-id="more"]');
  await a.click('button[data-a="sync"]');
  await expect(a.locator("#sheet")).toContainText("Noch nicht freigegeben");
  expect(await a.evaluate(() => syncOnce())).toMatchObject({ ok: false });
});
