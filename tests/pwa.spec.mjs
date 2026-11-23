// Home-Bildschirm-Installation (PWA) und Offline-Betrieb.
import { test, expect } from "@playwright/test";
import { open, ready, state } from "./helpers.mjs";
import { spawn } from "node:child_process";
import { v1State } from "./fixtures.mjs";
import { readFileSync } from "node:fs";

test.describe("Installation", () => {
  test("Manifest, Icons und Apple-Angaben für den Home-Bildschirm sind vorhanden", async ({ page, request }) => {
    await open(page);
    const head = await page.evaluate(() => ({
      manifest: document.querySelector('link[rel="manifest"]')?.getAttribute("href"),
      touch: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href"),
      capable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content,
      title: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.content,
      viewport: document.querySelector('meta[name="viewport"]')?.content,
    }));
    expect(head).toEqual({ manifest: "manifest.webmanifest", touch: "icon-180.png", capable: "yes", title: "Vivalink", viewport: "width=device-width, initial-scale=1, viewport-fit=cover" });
    const m = await (await request.get("/manifest.webmanifest")).json();
    expect(m).toMatchObject({ name: "Vivalink Management AI", short_name: "Vivalink", start_url: ".", scope: ".", display: "standalone" });
    for (const i of m.icons) {
      const r = await request.get("/" + i.src);
      expect(r.status()).toBe(200);
      expect(r.headers()["content-type"]).toBe("image/png");
    }
  });

  test("Alle Dateien, die der Service Worker offline speichert, existieren", async ({ request }) => {
    const sw = readFileSync("sw.js", "utf8");
    const files = [...sw.matchAll(/^\s+"([^"]+)",$/gm)].map((x) => x[1]);
    expect(files.length).toBeGreaterThanOrEqual(14);
    for (const f of files) expect((await request.get("/" + (f === "./" ? "" : f))).status(), f).toBe(200);
  });
});

test.describe("Offline", () => {
  test.use({ serviceWorkers: "allow" });
  // Echter Ausfall statt Browser-Simulation: eigener Testserver, der während des Tests beendet wird.
  // (Die Offline-Simulation von Playwright ist in WebKit für Seitenaufrufe nicht zuverlässig.)
  let srv;
  test("Service Worker wird aktiv, App startet ohne Server vollständig aus dem Offline-Speicher", async ({ page, context }, info) => {
    const port = 4180 + info.parallelIndex;
    const base = `http://127.0.0.1:${port}/`;
    srv = spawn(process.execPath, ["tests/server.mjs"], { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
    await expect.poll(async () => (await fetch(base).catch(() => null))?.status ?? 0, { timeout: 10_000 }).toBe(200);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await ready(page);
    await page.evaluate(async (s) => kvPut("state", s), v1State());
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await ready(page);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes("vivalink-2.1.0"))).toBe(true);
    // Server beenden und prüfen, dass er wirklich nicht mehr erreichbar ist
    srv.kill();
    await expect.poll(async () => (await fetch(base).then(() => "online", () => "offline")), { timeout: 10_000 }).toBe("offline");
    await page.reload();
    await ready(page);
    await expect(page.locator("h1")).toHaveText("Vivalink Management AI");
    expect((await state(page)).tasks).toHaveLength(2);
    expect((await state(page)).v).toBe(3);
    expect(errors).toEqual([]);
  });
  test.afterEach(() => srv && srv.kill());
});
