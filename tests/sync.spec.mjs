// Synchronisierung iPhone ↔ iPad (Ende-zu-Ende verschlüsselt) gegen den Test-Tresor (gleiche Logik wie der spätere Worker).
// Sicherheitskonzept: zufälliger 256-Bit-Schlüssel, Kopplung per ECDH + Prüfzahl, Wiederherstellungsschlüssel,
// Schlüsselwechsel bei Geräteverlust, Einmal-Kopplungsplätze mit Ablauf, Begrenzung von Fehlversuchen.
import { test, expect } from "@playwright/test";
import { ready, state, kv, expectToast } from "./helpers.mjs";
import { v1State } from "./fixtures.mjs";
import { handleVault, PAIR_TTL, RL_MAX } from "../server/vault-core.mjs";

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
async function withData(p) {
  await p.evaluate(async (s) => {
    S = s;
    migrate();
    S.tasks[0].title = "Geheime Testaufgabe Zebra";
    return save();
  }, v1State());
}
/* Koppelt B an A über die Programmschnittstelle (gleicher Ablauf wie in der Oberfläche) */
async function pairDevices(a, b) {
  const code = await a.evaluate(async () => (await pairStart()).code);
  const jb = await b.evaluate((c) => pairJoin(c), code);
  const ca = await a.evaluate(() => pairCheckA());
  expect(ca.sas).toBe(jb.sas);
  expect((await a.evaluate(() => pairApprove())).ok).toBe(true);
  return b.evaluate(() => pairCheckB());
}

test("Einrichten und Koppeln in der Oberfläche: Prüfzahl auf beiden Geräten, Server sieht nichts Lesbares", async ({ browser }) => {
  const a = await device(browser, "iPhone");
  await withData(a);
  await a.click('nav button[data-id="more"]');
  await a.click('button[data-a="sync"]');
  await a.click('button[data-a="syNew"]');
  await expectToast(a, "Synchronisierung eingerichtet");
  const rec = await a.inputValue("#syRecKey");
  expect(rec).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){7}$/); // 160 Bit Zufall
  const cfg = await kv(a, "sync-config");
  expect(atob(cfg.mk).length).toBe(32); // 256-Bit-Zufallsschlüssel
  expect(cfg.vid).toMatch(/^[0-9a-f]{32}$/);
  // Server: nur Prüfwert, Version, verschlüsselter Block – keine Klartexte, keine Schlüssel
  const raw = JSON.stringify(await vaultDump(a));
  for (const secret of ["Zebra", "Testziel", "kontakt@example.invalid", cfg.mk, cfg.token, rec.replace(/-/g, "")]) expect(raw).not.toContain(secret);
  // Zweites Gerät
  await a.click('button[data-a="syAdd"]');
  const code = (await a.locator("#syCodeOut").textContent()).trim();
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const b = await device(browser, "iPad");
  await b.click('nav button[data-id="more"]');
  await b.click('button[data-a="sync"]');
  await b.fill("#syIn", code.toLowerCase());
  await b.click('button[data-a="syJoin"]');
  const sasB = (await b.locator("#sySas").textContent()).trim();
  expect(sasB).toMatch(/^\d{3} \d{3}$/);
  await expect(a.locator("#sySas")).toHaveText(sasB, { timeout: 8000 });
  await a.click('button[data-a="syPairOk"]');
  await expectToast(a, "Gerät gekoppelt");
  await expectToast(b, "Synchronisiert");
  const sb = await state(b);
  expect(sb.tasks.map((t) => t.title)).toContain("Geheime Testaufgabe Zebra");
  expect(sb.dev).not.toBe((await state(a)).dev);
  expect((await kv(b, "sync-config")).mk).toBe(cfg.mk);
  // Schlüssel stehen nicht im Backup
  const bk = await b.evaluate(async () => JSON.stringify(await makeBackup()));
  expect(bk).not.toContain(cfg.mk);
  expect(bk).not.toContain(cfg.token);
  // Aktionsprotokoll: Einrichtung und Kopplung durch den Gründer
  expect(await a.evaluate(() => ACTIONS.filter((x) => x.name === "sync.pair" && x.ok).length)).toBe(2);
  expect(a.errors.concat(b.errors)).toEqual([]);
});

test("Kopplung ist sicher: Code allein reicht nicht, Fremder fliegt auf, Platz ist einmalig", async ({ browser }) => {
  const a = await device(browser, "iPhone");
  await withData(a);
  await a.evaluate(() => syncCreate());
  const code = await a.evaluate(async () => (await pairStart()).code);
  // Angreifer kennt den Code und kommt zuerst: das echte Gerät wird abgewiesen …
  const evil = await device(browser, "Fremd");
  const je = await evil.evaluate((c) => pairJoin(c), code);
  expect(je.ok).toBe(true);
  const b = await device(browser, "iPad");
  expect(await b.evaluate((c) => pairJoin(c), code)).toMatchObject({ ok: false, error: expect.stringContaining("bereits verwendet") });
  // … und Gerät A sieht die Prüfzahl des Fremden – stimmt nicht mit dem iPad überein → abbrechen
  const ca = await a.evaluate(() => pairCheckA());
  expect(ca.sas).toBe(je.sas);
  await a.evaluate(() => pairCancel());
  expect(await evil.evaluate(() => pairCheckB())).toMatchObject({ state: "expired" });
  expect(await kv(evil, "sync-config")).toBeNull();
  // Ohne Gerät A kann niemand den Schlüsselblock ablegen
  const code2 = await a.evaluate(async () => (await pairStart()).code);
  await b.evaluate((c) => pairJoin(c), code2);
  const slot = await b.evaluate((c) => pairSlot(c), code2);
  const forged = await b.evaluate((s) => httpTransport(VL_SYNC_URL).pair.bundle(s, "f".repeat(64), "x"), slot);
  expect(forged.status).toBe(403);
  // Bestätigt → einmalig abgeholt, danach weg
  await a.evaluate(() => pairCheckA());
  await a.evaluate(() => pairApprove());
  expect(await b.evaluate(() => pairCheckB())).toMatchObject({ state: "done", ok: true });
  expect((await b.evaluate((s) => httpTransport(VL_SYNC_URL).pair.get(s), slot)).status).toBe(404);
  // Falscher Code
  expect(await b.evaluate(() => pairJoin("AAAA-BBBB"))).toMatchObject({ ok: false, error: expect.stringContaining("unbekannt") });
});

test("Kopplungsplatz läuft nach 10 Minuten ab; Fehlversuche je Absender werden begrenzt", async () => {
  const m = new Map();
  const store = { get: async (k) => m.get(k) || null, put: async (k, o) => void m.set(k, o), del: async (k) => void m.delete(k) };
  const slot = "a".repeat(32),
    t0 = 1_000_000;
  const pub = "B".repeat(88);
  expect((await handleVault({ method: "PUT", path: "/v1/pair/" + slot, body: JSON.stringify({ pubA: pub, ownHash: "0".repeat(64) }), now: t0 }, store)).status).toBe(201);
  expect((await handleVault({ method: "GET", path: "/v1/pair/" + slot, now: t0 + 60_000 }, store)).status).toBe(200);
  expect((await handleVault({ method: "GET", path: "/v1/pair/" + slot, now: t0 + PAIR_TTL * 1000 + 1 }, store)).status).toBe(404);
  // Durchprobieren von Codes: nach RL_MAX Fehlversuchen gesperrt (auch für richtige Anfragen dieses Absenders)
  for (let i = 0; i < RL_MAX; i++) await handleVault({ method: "GET", path: "/v1/pair/" + i.toString(16).padStart(32, "0"), client: "angreifer", now: t0 }, store);
  expect((await handleVault({ method: "GET", path: "/v1/pair/" + slot, client: "angreifer", now: t0 }, store)).status).toBe(429);
  expect((await handleVault({ method: "GET", path: "/v1/pair/" + slot, client: "anderer", now: t0 }, store)).status).toBe(404);
  // Nach Ablauf des Zeitfensters wieder möglich
  expect((await handleVault({ method: "GET", path: "/v1/pair/" + slot, client: "angreifer", now: t0 + 11 * 60_000 }, store)).status).toBe(404);
  // Falsche Tresor-Token zählen ebenfalls
  await handleVault({ method: "PUT", path: "/v1/vault/" + slot, auth: "Bearer " + "1".repeat(64), body: JSON.stringify({ blob: "x", expected: 0 }), now: t0 }, store);
  for (let i = 0; i < RL_MAX; i++) await handleVault({ method: "GET", path: "/v1/vault/" + slot, auth: "Bearer " + "2".repeat(64), client: "rate", now: t0 }, store);
  expect((await handleVault({ method: "GET", path: "/v1/vault/" + slot, auth: "Bearer " + "1".repeat(64), client: "rate", now: t0 }, store)).status).toBe(429);
});

test("Änderungen in beide Richtungen, Konflikt bei gleichzeitiger Änderung, kein endloses Hin und Her", async ({ browser }) => {
  const a = await device(browser, "iPhone");
  await a.evaluate(async (s) => {
    S = s;
    migrate();
    await save();
    return syncCreate();
  }, v1State());
  const b = await device(browser, "iPad");
  expect(await pairDevices(a, b)).toMatchObject({ state: "done", ok: true });
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
  expect((await kv(a, "pre-import")).label).toBe("Synchronisierung");
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
  await syncNow(a);
  await syncNow(b);
  const v1 = (await syncNow(a)).version;
  for (let i = 0; i < 3; i++) {
    await syncNow(b);
    await syncNow(a);
  }
  expect((await syncNow(a)).version).toBe(v1);
  // Geräteliste
  expect(Object.values((await kv(a, "sync-config")).devices)).toHaveLength(2);
  expect(a.errors.concat(b.errors)).toEqual([]);
});

test("Gleichzeitiges Schreiben (Versionskonflikt am Server) wird automatisch zusammengeführt", async ({ browser }) => {
  const a = await device(browser, "iPhone");
  const r = await a.evaluate(async () => {
    await syncCreate();
    const K = await vaultAccess(await kvGet("sync-config"));
    const base = httpTransport(VL_SYNC_URL);
    let injected = false;
    const racing = {
      ...base,
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

test("Manipulierte oder unlesbare Serverdaten: nichts wird verändert; fremder Token abgewiesen", async ({ browser }) => {
  const a = await device(browser, "iPhone");
  await withData(a);
  const before = await a.evaluate(async () => {
    await syncCreate();
    const K = await vaultAccess(await kvGet("sync-config"));
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
  const st = await a.evaluate(async () => {
    const mine = await kvGet("sync-config");
    return (await fetch(VL_SYNC_URL + "/v1/vault/" + mine.vid, { headers: { authorization: "Bearer " + "0".repeat(64) } })).status;
  });
  expect(st).toBe(401);
});

test("Alle Geräte verloren: Wiederherstellungsschlüssel stellt den Zugang her; ersetzter Schlüssel gilt nicht mehr", async ({ browser }) => {
  const a = await device(browser, "iPhone");
  await withData(a);
  const R1 = (await a.evaluate(() => syncCreate())).recovery;
  const R2 = await a.evaluate(() => writeRecovery());
  const c = await device(browser, "Neues iPhone");
  expect(await c.evaluate((r) => syncRecover(r), R1)).toMatchObject({ ok: false, error: expect.stringContaining("ersetzt") });
  expect(await c.evaluate(() => syncRecover("AAAA-AAAA"))).toMatchObject({ ok: false });
  const r = await c.evaluate((x) => syncRecover(x), R2.toLowerCase());
  expect(r).toMatchObject({ ok: true });
  expect((await state(c)).tasks.map((t) => t.title)).toContain("Geheime Testaufgabe Zebra");
});

test("Gerät verloren: Schlüssel erneuern sperrt den alten Tresor; verlorenes Gerät erhält nichts mehr", async ({ browser }) => {
  const a = await device(browser, "iPhone");
  await withData(a);
  await a.evaluate(() => syncCreate());
  const lost = await device(browser, "Verlorenes iPad");
  await pairDevices(a, lost);
  const oldCfg = await kv(lost, "sync-config");
  const rot = await a.evaluate(() => act("sync.rotate", "gruender", () => syncRotate()));
  expect(rot.ok).toBe(true);
  const nc = await kv(a, "sync-config");
  expect(nc.vid).not.toBe(oldCfg.vid);
  expect(nc.mk).not.toBe(oldCfg.mk);
  expect(nc.kv).toBe(2);
  // Verlorenes Gerät: gesperrt, kann den alten Tresor nicht neu anlegen oder lesen
  const rl = await syncNow(lost);
  expect(rl).toMatchObject({ ok: false, error: expect.stringContaining("gesperrt") });
  expect((await kv(lost, "sync-config")).revoked).toBe(true);
  const put = await lost.evaluate(async (c) => (await fetch(VL_SYNC_URL + "/v1/vault/" + c.vid, { method: "PUT", headers: { authorization: "Bearer " + c.token, "content-type": "application/json" }, body: JSON.stringify({ blob: "x", expected: 0 }) })).status, oldCfg);
  expect(put).toBe(410);
  // Neue Änderungen von A sind für das verlorene Gerät unerreichbar; neuer Wiederherstellungsschlüssel funktioniert
  await a.evaluate(async () => {
    S.tasks.push({ id: "after1", title: "Nach dem Verlust", prio: "mittel", area: "App", due: "", done: false, updatedAt: Date.now() });
    await save();
    return syncOnce();
  });
  const n = await device(browser, "Ersatz-iPad");
  expect(await n.evaluate((r) => syncRecover(r), rot.recovery)).toMatchObject({ ok: true });
  expect((await state(n)).tasks.map((t) => t.title)).toContain("Nach dem Verlust");
  // Aktionsprotokoll
  expect(await a.evaluate(() => ACTIONS.some((x) => x.name === "sync.rotate" && x.ok))).toBe(true);
  // Nur der Gründer darf koppeln oder Schlüssel erneuern
  expect(await a.evaluate(() => mayRun("sync.rotate", "auto").ok)).toBe(false);
});

test("Alte Kopplung aus dem früheren Entwurf wird entfernt; ohne Freigabe sendet nichts", async ({ browser }) => {
  const a = await device(browser, "iPhone");
  await a.evaluate(() => kvPut("sync-config", { code: "ABCDABCDABCDABCDABCD", version: 3 }));
  expect(await a.evaluate(() => syncCfg())).toBeNull();
  expect(await kv(a, "sync-config")).toBeNull();
  const b = await device(browser, "iPad", false);
  await b.click('nav button[data-id="more"]');
  await b.click('button[data-a="sync"]');
  await expect(b.locator("#sheet")).toContainText("Noch nicht freigegeben");
  expect(await b.evaluate(() => syncOnce())).toMatchObject({ ok: false });
});

test("D1-Speicher (wie im Cloudflare Worker): atomares Schreiben, kein stilles Überschreiben, Ablauf und Aufräumen", async () => {
  const { d1Store } = await import("../server/d1-store.mjs");
  const { sqliteD1 } = await import("./sqlite-d1.mjs");
  let t = 1_000_000;
  const st = d1Store(sqliteD1(), () => t);
  const id = "b".repeat(32),
    auth = "Bearer " + "1".repeat(64);
  const put = (blob, expected) => handleVault({ method: "PUT", path: "/v1/vault/" + id, auth, body: JSON.stringify({ blob, expected }), now: t }, st);
  expect((await put("a", 0)).status).toBe(200);
  // Zwei Geräte schreiben gleichzeitig auf Basis von Version 1 → genau eines gewinnt, das andere erhält 409
  const [x, y] = await Promise.all([put("x", 1), put("y", 1)]);
  expect([x.status, y.status].sort()).toEqual([200, 409]);
  const g = JSON.parse((await handleVault({ method: "GET", path: "/v1/vault/" + id, auth, now: t }, st)).body);
  expect(g.version).toBe(2);
  expect(["x", "y"]).toContain(g.blob);
  // Doppeltes Anlegen (expected 0) ist ebenfalls ausgeschlossen
  expect((await put("z", 0)).status).toBe(409);
  // Ablauf: Einträge mit Ablaufzeit verschwinden, sweep räumt auf
  await st.put("p:test", { a: 1 }, 60);
  expect(await st.get("p:test")).toEqual({ a: 1 });
  t += 61_000;
  expect(await st.get("p:test")).toBeNull();
  await st.put("p:test2", { a: 2 }, 60);
  t += 61_000;
  expect(await st.sweep()).toBe(1);
  // Aufgaben-Postfach: Ort hängt am Token, Ablauf 21 Tage
  const tok = "c".repeat(64);
  const tp = (body, expected) => handleVault({ method: "PUT", path: "/v1/task/out", taskToken: tok, body: JSON.stringify({ body, expected }), now: t }, st);
  expect((await tp("eins", 0)).status).toBe(200);
  expect((await tp("zwei", 0)).status).toBe(409);
  expect(JSON.parse((await handleVault({ method: "GET", path: "/v1/task/out", taskToken: tok, now: t }, st)).body).body).toBe("eins");
  expect((await handleVault({ method: "GET", path: "/v1/task/out", taskToken: "d".repeat(64), now: t }, st)).status).toBe(404);
  expect((await handleVault({ method: "GET", path: "/v1/task/out", taskToken: "kurz", now: t }, st)).status).toBe(401);
  t += 22 * 24 * 3600e3;
  expect((await handleVault({ method: "GET", path: "/v1/task/out", taskToken: tok, now: t }, st)).status).toBe(404);
});
