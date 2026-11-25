// Robustheit: beschädigte Gerätedaten, doppelte Aktionen, doppelt eingefügte KI-Antworten,
// unterbrochenes Update (Offline-Speicher der neuen Version unvollständig). Nur künstliche Daten.
import { test, expect } from "@playwright/test";
import { APP, CACHE } from "./version.mjs";
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { guard, open, ready, seed, nav, state, kv, expectToast } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";

const NOW = new Date("2026-03-02T09:00:00");
function brandOk(s) {
  s.studio = { brand: { region: "Testregion", signup: "Registrierung über vivalink.me", colorsConfirmed: true, website: "vivalink.me" }, settings: {}, posts: [], learned: {} };
  return s;
}

test.describe("Beschädigte Daten", () => {
  test("Sicherungspunkt des Tages wird beim Start aufgefrischt, wenn er älter als 3 Stunden ist", async ({ page }) => {
    await seed(page, { state: v2State() });
    await page.evaluate(async () => {
      const s = await kvGet("snap-" + today());
      s.at = Date.now() - 4 * 3600e3;
      s.data.tasks = [];
      await kvPut("snap-" + today(), s);
    });
    await page.reload();
    await ready(page);
    await expect.poll(async () => (await kv(page, "snap-" + (await page.evaluate(() => today())))).data.tasks.length).toBe(v2State().tasks.length);
  });

  test("Unbrauchbarer Speicherstand → letzter intakter Sicherungspunkt, Original bleibt aufbewahrt", async ({ page }) => {
    const g = await guard(page);
    await seed(page, { state: v2State() });
    await page.evaluate(() => autoSnapshot(true)); // Sicherungspunkt mit den aktuellen Daten
    const before = await state(page);
    expect(await page.evaluate(() => kvGet("snaps"))).toHaveLength(1);
    await page.evaluate(() => kvPut("state", "x".repeat(50)));
    await page.reload();
    await ready(page);
    await expectToast(page, "wiederhergestellt");
    const after = await state(page);
    expect(after.tasks.map((t) => t.id)).toEqual(before.tasks.map((t) => t.id));
    expect(after.memory.map((t) => t.id)).toEqual(before.memory.map((t) => t.id));
    expect((await kv(page, "corrupt-last")).raw).toBe("x".repeat(50));
    expect(await page.evaluate(() => LOG.some((e) => e.code === "storage.corrupt"))).toBe(true);
    expect(g.errors).toEqual([]);
  });

  test("Einzelne kaputte Einträge werden entfernt, der Rest bleibt; ohne Sicherungspunkt startet die App leer statt abzustürzen", async ({ page }) => {
    const g = await guard(page);
    const s = v2State();
    s.tasks.push(null, "kaputt", { title: "ohne id" });
    s.memory.push(42);
    await seed(page, { state: s });
    await expectToast(page, "beschädigte Einträge entfernt");
    const st = await state(page);
    expect(st.tasks.every((t) => t && typeof t.id === "string")).toBe(true);
    expect(st.tasks).toHaveLength(v2State().tasks.length);
    expect((await kv(page, "corrupt-last")).raw.tasks).toHaveLength(v2State().tasks.length + 3);
    // Völlig unbrauchbar und kein Sicherungspunkt vorhanden
    await page.evaluate(async () => {
      for (const d of (await kvGet("snaps")) || []) await kvPut("snap-" + d, null);
      await kvPut("snaps", []);
      await kvPut("state", { memory: "kein Array", tasks: 5 });
    });
    await page.reload();
    await ready(page);
    await expectToast(page, "aufbewahrt");
    expect((await state(page)).tasks).toEqual([]);
    expect((await kv(page, "corrupt-last")).raw.memory).toBe("kein Array");
    await nav(page, "studio");
    await expect(page.locator("h1")).toHaveText("Instagram-Studio");
    expect(g.errors).toEqual([]);
  });
});

test.describe("Doppelte Aktionen", () => {
  test.beforeEach(async ({ page }) => page.clock.setFixedTime(NOW));
  test("Doppeltipp auf Freigeben, Veröffentlichen und doppelt eingefügte KI-Antwort erzeugen nichts doppelt", async ({ page }) => {
    await seed(page, { state: brandOk(v2State()) });
    const answer = JSON.stringify({ format: "vivalink-studio-plan", version: 1, posts: [{ date: "2026-03-04", pillar: "tipps", type: "einzelbild", title: "Doppelt", hook: "Einmaliger Einstieg", slides: [{ template: "frage", title: "x" }], caption: "Text vivalink.me" }, { date: "2026-03-06", pillar: "community", type: "einzelbild", title: "Zweiter", hook: "Anderer Einstieg", slides: [{ template: "frage", title: "y" }], caption: "Mehr vivalink.me" }] });
    await nav(page, "studio");
    for (let i = 0; i < 2; i++) {
      await page.click('button[data-a="stPrompt"]');
      await page.fill("#stAns", answer);
      await page.click('button[data-a="stImport"]');
      await expectToast(page, i ? "0 Beiträge als Entwurf übernommen · 2 bereits vorhanden" : "2 Beiträge als Entwurf übernommen");
    }
    expect((await state(page)).studio.posts).toHaveLength(2);
    // Wochenfreigabe doppelt getippt
    await page.locator('button[data-a="stApproveWeek"]').first().dblclick();
    await expectToast(page, "freigegeben");
    expect(await page.evaluate(() => ACTIONS.filter((a) => a.name === "post.approve").length)).toBe(1);
    // Veröffentlichen doppelt getippt → nur einmal
    await page.locator('[data-a="stOpen"]', { hasText: "Doppelt" }).click();
    await page.click('#sheet [data-a="stTab"][data-id="termin"]');
    await page.locator('#sheet button[data-a="stSet"][data-id="veroeffentlicht"]').dblclick();
    await expect.poll(async () => (await state(page)).studio.posts.find((p) => p.title === "Doppelt").status).toBe("veroeffentlicht");
    const ok = await page.evaluate(() => ACTIONS.filter((a) => a.name === "post.publish" && a.ok).length);
    expect(ok).toBe(1);
    expect(await page.evaluate(() => markPublishedManually(S.studio.posts.find((p) => p.title === "Doppelt")).ok)).toBe(false);
  });

  test("Fehlerhafte KI-Antworten: abgeschnitten, ohne Beiträge, falsche Typen – nichts wird übernommen oder zerstört", async ({ page }) => {
    await seed(page, { state: brandOk(v2State()) });
    const r = await page.evaluate(() => {
      const before = S.studio.posts.length;
      const out = ['{"posts":[{"date":"2026-03-04","title":"abgeschn', "Leider kann ich das nicht.", '{"posts":"keine Liste"}', "[1,2,3]", '{"posts":[{"date":12,"pillar":["x"],"type":{},"slides":"x","caption":["a"],"hashtags":7}]}'].map((t) => {
        const x = importPlan(t);
        return x.ok ? "ok:" + x.added.length : "fehler";
      });
      const p = S.studio.posts[S.studio.posts.length - 1];
      return { out, n: S.studio.posts.length - before, p: p && { date: p.date, pillar: p.pillar, type: p.type, cap: typeof p.caption, tags: p.hashtags } };
    });
    expect(r.out.slice(0, 4)).toEqual(["fehler", "fehler", "fehler", "fehler"]);
    expect(r.n).toBeLessThanOrEqual(1);
    if (r.n) expect(r.p).toEqual({ date: "", pillar: "community", type: "einzelbild", cap: "string", tags: [] });
  });
});

test.describe("Unterbrochenes Update", () => {
  test.use({ serviceWorkers: "allow" });
  let srv = null,
    tmp = null;
  async function serve(port, root) {
    await stop();
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
  test.afterEach(async () => {
    await stop();
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });
  test("Neuer Offline-Speicher unvollständig → bisherige Version bleibt offline lauffähig, Daten bleiben, späteres Update gelingt", async ({ page }, info) => {
    const port = 4390 + info.parallelIndex,
      base = `http://127.0.0.1:${port}/`;
    const version = () => page.evaluate(() => (typeof APP_VERSION === "undefined" ? "1" : APP_VERSION));
    // Ausgangslage: installierte 2.1 mit Daten
    await serve(port, "tests/fixtures/legacy-v21");
    await page.goto(base);
    await ready(page);
    await page.evaluate(async (s) => kvPut("state", s), v2State());
    await page.reload();
    await ready(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload(), await ready(page);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 10_000 }).toBe(true);
    const oldCaches = await page.evaluate(async () => (await caches.keys()).sort());
    const before = await state(page);
    // Update bricht ab: eine Datei der neuen Version ist nicht erreichbar (z. B. Verbindung weg)
    tmp = mkdtempSync(join(tmpdir(), "vl-upd-"));
    for (const f of ["index.html", "sw.js", "manifest.webmanifest", "icon-180.png", "icon-512.png", "js", "brand"]) cpSync(f, join(tmp, f), { recursive: true });
    rmSync(join(tmp, "brand", "nunito-latin-800-normal.woff2"));
    await serve(port, tmp);
    await page.reload();
    await ready(page);
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {}));
    await page.waitForTimeout(1500);
    // Die neue Version wurde nicht aktiviert: Offline-Speicher der alten Version unverändert vorhanden
    // (laufende Installationsversuche räumen ihren halb gefüllten Speicher selbst wieder ab)
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).sort()), { timeout: 10_000 }).toEqual(oldCaches);
    expect(await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => !!(r && r.active && !r.waiting)))).toBe(true);
    // Ohne Netz startet die bisherige Version aus dem Offline-Speicher, Daten vollständig
    await stop();
    await page.reload();
    await ready(page);
    const off = await state(page);
    expect(off.tasks.map((t) => t.id)).toEqual(before.tasks.map((t) => t.id));
    expect(off.memory.map((t) => t.id)).toEqual(before.memory.map((t) => t.id));
    // Netz wieder da, vollständige neue Version → Update gelingt
    await serve(port, null);
    await page.reload();
    await ready(page);
    await expect.poll(() => version(), { timeout: 10_000 }).toBe(APP);
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).sort()), { timeout: 15_000 }).toEqual([CACHE]);
    const fin = await state(page);
    expect(fin.tasks.map((t) => t.id)).toEqual(before.tasks.map((t) => t.id));
  });
});
