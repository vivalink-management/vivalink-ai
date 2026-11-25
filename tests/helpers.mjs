// Gemeinsame Test-Hilfen. Alle Testdaten sind künstlich.
import { expect } from "@playwright/test";

/* Sammelt JavaScript-Fehler und blockiert (und protokolliert) jede Anfrage an fremde Server. */
export async function guard(page) {
  const errors = [],
    external = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });
  await page.route(
    (u) => !u.href.startsWith("http://127.0.0.1:4173/"),
    (r) => {
      external.push(r.request().url());
      return r.abort();
    },
  );
  return { errors, external };
}
export async function ready(page) {
  await expect(page.locator('nav button[data-id="home"]')).toBeVisible();
  await page.waitForFunction(() => typeof S !== "undefined" && S && Array.isArray(S.tasks));
}
export async function open(page) {
  await page.goto("/");
  await ready(page);
}
export const nav = (page, id) => page.click(`nav button[data-id="${id}"]`);
/* Legt Daten direkt im Gerätespeicher ab und lädt die App neu (simuliert vorhandene Nutzerdaten). */
export async function seed(page, kv) {
  await open(page);
  await page.evaluate(async (kv) => {
    for (const k in kv) await kvPut(k, kv[k]);
  }, kv);
  await page.reload();
  await ready(page);
}
export const state = (page) => page.evaluate(() => JSON.parse(JSON.stringify(S)));
export const kv = (page, k) => page.evaluate((k) => kvGet(k), k);
/* Ersetzt die Zwischenablage (funktioniert in allen Browsern gleich). fail=true simuliert eine Sperre. */
export async function stubClipboard(page, fail = false) {
  await page.addInitScript((fail) => {
    const c = {
      writeText: async (t) => {
        if (fail) throw Object.assign(new Error("blocked"), { name: "NotAllowedError" });
        window.__clip = t;
      },
    };
    Object.defineProperty(navigator, "clipboard", { value: c, configurable: true });
  }, fail);
}
export const clip = (page) => page.evaluate(() => window.__clip);
/* Wartet, bis die Meldung den erwarteten Text zeigt (Aktionen laufen asynchron). */
export async function expectToast(page, text) {
  await expect(page.locator("#toast")).toContainText(text);
}
export async function toastText(page) {
  const t = page.locator("#toast");
  await expect(t).toBeVisible();
  return t.textContent();
}
export async function waitClip(page) {
  await expect.poll(() => clip(page)).toBeTruthy();
  return clip(page);
}
