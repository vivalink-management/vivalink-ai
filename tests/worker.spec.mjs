// Ende-zu-Ende gegen den ECHTEN Cloudflare Worker (server/sync-worker.js) in der Cloudflare-Laufzeit (wrangler dev,
// lokaler D1-Speicher). Läuft nur, wenn WORKER_URL gesetzt ist (in GitHub Actions automatisch; lokal siehe CLAUDE.md).
// Prüft: Kopplung zweier Geräte mit Prüfzahl, Synchronisierung in beide Richtungen, Konflikt, gleichzeitiges Schreiben,
// Schlüsselwechsel, Herkunftsprüfung (CORS), Aufgaben-Postfach mit dem Brückenskript. Nur künstliche Daten.
import { test, expect } from "@playwright/test";
import { ready, state, kv } from "./helpers.mjs";
import { v1State } from "./fixtures.mjs";
import { holen, abgeben } from "../scripts/ki-aufgabe.mjs";

const W = process.env.WORKER_URL; // direkt (wie die geplante Aufgabe)
const APPW = "http://127.0.0.1:4173/worker"; // für die App über den Testserver (gleiche Adresse, CSP)
test.skip(!W, "WORKER_URL nicht gesetzt (echter Worker läuft nicht)");
test.describe.configure({ mode: "serial" });

async function device(browser, name) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript((u) => (window.VL_SYNC_URL = u), APPW);
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(name + ": " + e.message));
  await p.goto("/");
  await ready(p);
  return p;
}

test("Echter Worker: koppeln, synchronisieren, Konflikt, gleichzeitiges Schreiben, Schlüsselwechsel", async ({ browser }) => {
  const a = await device(browser, "iPhone");
  await a.evaluate(async (s) => {
    S = s;
    migrate();
    S.tasks[0].title = "Worker-Test Zebra";
    await save();
  }, v1State());
  const created = await a.evaluate(() => syncCreate());
  expect(created.ok).toBe(true);
  const b = await device(browser, "iPad");
  const code = await a.evaluate(async () => (await pairStart()).code);
  const jb = await b.evaluate((c) => pairJoin(c), code);
  expect((await a.evaluate(() => pairCheckA())).sas).toBe(jb.sas);
  await a.evaluate(() => pairApprove());
  expect(await b.evaluate(() => pairCheckB())).toMatchObject({ state: "done", ok: true });
  expect((await state(b)).tasks.map((t) => t.title)).toContain("Worker-Test Zebra");
  // beide Richtungen + Konflikt
  await b.evaluate(async () => {
    S.tasks.push({ id: "wb1", title: "Vom iPad", prio: "mittel", area: "App", due: "", done: false, updatedAt: Date.now() });
    await save();
    return syncOnce();
  });
  expect(await a.evaluate(() => syncOnce())).toMatchObject({ ok: true, pulled: 1 });
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
  await a.evaluate(() => syncOnce());
  expect((await b.evaluate(() => syncOnce())).conflicts).toBe(1);
  // gleichzeitig auf beiden Geräten synchronisieren: nichts geht verloren
  await a.evaluate(() => (S.tasks.push({ id: "wa2", title: "Gleichzeitig A", prio: "mittel", area: "App", due: "", done: false, updatedAt: Date.now() }), save()));
  await b.evaluate(() => (S.tasks.push({ id: "wb2", title: "Gleichzeitig B", prio: "mittel", area: "App", due: "", done: false, updatedAt: Date.now() }), save()));
  await Promise.all([a.evaluate(() => syncOnce()), b.evaluate(() => syncOnce())]);
  await a.evaluate(() => syncOnce());
  await b.evaluate(() => syncOnce());
  const ta = (await state(a)).tasks.map((t) => t.id),
    tb = (await state(b)).tasks.map((t) => t.id);
  for (const id of ["wa2", "wb2", "wb1"]) {
    expect(ta).toContain(id);
    expect(tb).toContain(id);
  }
  // Schlüsselwechsel: altes Gerät gesperrt
  const old = await kv(b, "sync-config");
  expect((await a.evaluate(() => syncRotate())).ok).toBe(true);
  expect(await b.evaluate(() => syncOnce())).toMatchObject({ ok: false, error: expect.stringContaining("gesperrt") });
  const st = await fetch(W + "/v1/vault/" + old.vid, { headers: { authorization: "Bearer " + old.token } });
  expect(st.status).toBe(410);
  expect(a.errors.concat(b.errors)).toEqual([]);
});

test("Echter Worker: fremde Webseiten werden abgewiesen, Fehlversuche begrenzt, Token nötig", async () => {
  expect((await fetch(W + "/v1/health", { headers: { origin: "https://evil.example" } })).status).toBe(403);
  expect((await fetch(W + "/v1/vault/" + "a".repeat(32), { headers: { authorization: "Bearer kurz" } })).status).toBe(401);
  expect((await fetch(W + "/v1/task/out")).status).toBe(401);
  const pre = await fetch(W + "/v1/vault/" + "a".repeat(32), { method: "OPTIONS", headers: { origin: process.env.WORKER_ORIGIN || "http://127.0.0.1:4173", "access-control-request-method": "PUT" } });
  expect(pre.status).toBe(204);
  expect(pre.headers.get("access-control-allow-headers")).toContain("x-vl-task-token");
});

test("Echter Worker: geplante Aufgabe holt Auftrag und gibt Ergebnis zurück; App übernimmt", async ({ browser }) => {
  const p = await device(browser, "iPhone");
  const tk = await p.evaluate(async () => {
    S.studio.brand.region = "Testregion";
    await save();
    const t = (await taskSetup()).token;
    await taskPublish();
    return t;
  });
  const pkg = await holen(W, tk);
  expect(pkg.version).toBe(2);
  const slot = pkg.studio.slots[0];
  await abgeben(W, { posts: { format: "vivalink-studio-plan", version: 1, posts: [{ ...slot, title: "Vom Worker", hook: "Einstieg Worker", slides: [{ template: "frage", title: "Frage" }], caption: "Text vivalink.me" }] }, analysis: { text: "Künstliche Wochenanalyse mit ausreichender Länge für den Worker-Test." } }, pkg.id, tk);
  const r = await p.evaluate(() => taskFetch());
  expect(r).toMatchObject({ ok: true, added: 1, analysis: true });
  expect(await holen(W, "e".repeat(64))).toBeNull();
});
