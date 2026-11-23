// Home-Bildschirm-Installation (PWA) und Offline-Betrieb.
import { test, expect } from "@playwright/test";
import { guard, open, ready, seed, state } from "./helpers.mjs";
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
  test("Service Worker wird aktiv, App startet offline mit allen Daten", async ({ page, context, browserName }) => {
    const g = await guard(page);
    await seed(page, { state: v1State() });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await ready(page);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes("vivalink-2.1.0"))).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await ready(page);
    expect((await state(page)).tasks).toHaveLength(2);
    await expect(page.locator("h1")).toHaveText("Vivalink Management AI");
    await context.setOffline(false);
    expect(g.errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e))).toEqual([]);
  });
});
