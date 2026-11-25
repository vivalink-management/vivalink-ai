// Diagnose und technisches Fehlerprotokoll (Grundlage für spätere selbstständige Fehlerbehebung).
import { test, expect } from "@playwright/test";
import { APP, SCHEMA, CACHE } from "./version.mjs";
import { guard, open, seed, nav, state, kv, stubClipboard, waitClip, expectToast } from "./helpers.mjs";
import { v1State, v2State } from "./fixtures.mjs";

test("Diagnoseseite zeigt Version, Speichertest, Integrität und keine Inhalte", async ({ page }) => {
  const g = await guard(page);
  await stubClipboard(page);
  await seed(page, { state: v2State() });
  await nav(page, "more");
  await page.click('button[data-a="diag"]');
  await expect(page.locator('[data-check="app"]')).toHaveText(APP);
  await expect(page.locator('[data-check="storage"]')).toHaveText("OK (Schreiben und Lesen)");
  await expect(page.locator('[data-check="mode"]')).toHaveText("Browser-Tab");
  await expect(page.locator('[data-issue="none"]')).toBeVisible();
  await page.click('button[data-a="cpDiag"]');
  const t = await waitClip(page);
  expect(t).toContain("Diagnosebericht (ohne Inhalte)");
  expect(t).toContain("App-Version: " + APP);
  for (const secret of ["Testziel", "Testaufgabe", "kontakt@example.invalid", "Testort", "Testentscheidung"]) expect(t).not.toContain(secret);
  expect(g.errors).toEqual([]);
});

test("Fehler werden protokolliert, persönliche Daten unkenntlich gemacht, als Befund gemeldet", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error("Testfehler für test@example.invalid und +1 555 010 0000 Wert 123456");
    });
    Promise.reject(new Error("Test-Ablehnung"));
  });
  await expect.poll(async () => ((await kv(page, "log")) || []).length).toBeGreaterThanOrEqual(2);
  const log = await kv(page, "log");
  const e = log.find((x) => x.code === "js.error");
  expect(e.msg).toContain("Testfehler");
  expect(e.msg).not.toContain("test@example.invalid");
  expect(e.msg).not.toContain("555 010");
  expect(e.msg).not.toContain("123456");
  expect(log.some((x) => x.code === "js.promise" && x.msg.includes("Test-Ablehnung"))).toBe(true);
  await nav(page, "tasks");
  await nav(page, "home");
  const all = page.locator('button[data-a="all"]');
  if (await all.count()) await all.click();
  await expect(page.locator("#app")).toContainText("technische(r) Fehler in den letzten 7 Tagen");
  await nav(page, "more");
  await page.click('button[data-a="diag"]');
  await expect(page.locator('[data-log="js.error"]')).toBeVisible();
  await page.click('button[data-a="clrLog"]');
  await expectToast(page, "Protokoll geleert");
  await expect.poll(async () => (await kv(page, "log")).length).toBe(0);
});

test("Gleiche Fehler werden zusammengefasst, Protokoll ist begrenzt", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    for (let i = 0; i < 5; i++) logEvent("error", "test.repeat", "gleich");
    for (let i = 0; i < 260; i++) logEvent("info", "test.many", "Nr " + i);
  });
  const n = await page.evaluate(() => [LOG.find((e) => e.code === "test.repeat")?.n, LOG.length]);
  expect(n[1]).toBeLessThanOrEqual(200);
  expect(await page.evaluate(() => LOG.filter((e) => e.code === "test.many").length)).toBe(200);
});

test("Speicherfehler wird erkannt, gemeldet und protokolliert", async ({ page }) => {
  // Störung bleibt auch über ein erneutes Laden der Seite bestehen (sonst in WebKit unzuverlässig)
  await page.addInitScript(() => {
    const orig = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...a) {
      if (sessionStorage.getItem("vl-broken")) throw new Error("Speicher simuliert defekt");
      return orig.apply(this, a);
    };
  });
  await open(page);
  await page.evaluate(() => sessionStorage.setItem("vl-broken", "1"));
  await nav(page, "tasks");
  await page.click('button[data-a="newTask"]');
  await page.fill("#t-t", "Wird nicht gespeichert");
  await page.click('button[data-a="saveTask"]');
  await expectToast(page, "Speichern auf diesem Gerät nicht möglich");
  expect(await page.evaluate(() => LOG.some((e) => e.code === "storage.save"))).toBe(true);
  await nav(page, "more");
  await page.click('button[data-a="diag"]');
  await expect(page.locator('[data-check="storage"]')).toHaveText("FEHLER");
});

test("Integritätsprüfung findet fehlende Verweise und doppelte IDs", async ({ page }) => {
  const s = v1State();
  s.memory.find((m) => m.id === "m2").supersedes = "fehlt";
  s.tasks.push({ ...s.tasks[0] });
  s.memory.push({ id: "mz", cat: "Ziele", title: "Ersetzt ohne Nachfolger", text: "", status: "confirmed", date: "2026-01-02", reason: "", result: "", private: false, active: false, createdAt: 1, updatedAt: 1 });
  await seed(page, { state: s });
  const issues = await page.evaluate(() => integrity().map((i) => i.code));
  expect(issues).toEqual(expect.arrayContaining(["dup-id", "orphan-prev", "inactive-no-next"]));
  await nav(page, "more");
  await page.click('button[data-a="diag"]');
  await expect(page.locator('[data-issue="dup-id"]')).toBeVisible();
});

test("Migration wird im Protokoll festgehalten", async ({ page }) => {
  await seed(page, { state: v1State() });
  await expect.poll(async () => ((await kv(page, "log")) || []).some((e) => e.code === "migration")).toBe(true);
  expect((await state(page)).v).toBe(SCHEMA);
});
