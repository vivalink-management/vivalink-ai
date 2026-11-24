// Anbindung der Verwaltung: nur zusammengefasste Kennzahlen, Kopplung per Einmalcode, strikte Ablehnung von Personendaten.
import { test, expect } from "@playwright/test";
import { ready, state, kv } from "./helpers.mjs";

async function dev(browser, variant) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript((u) => (window.VL_KPI_URL = u), "http://127.0.0.1:4173/kpi/" + variant);
  const p = await ctx.newPage();
  await p.goto("/");
  await ready(p);
  return p;
}
const vals = (s, key) => s.metrics.find((m) => m.key === key).entries.filter((e) => !e.deleted);

test("Kopplung, Abruf und Speicherung als Historie (Quelle „verwaltung“), keine Doppelungen", async ({ browser }) => {
  const p = await dev(browser, "ok");
  expect(await p.evaluate(() => kpiPair("000000"))).toMatchObject({ ok: false, error: "Code ungültig oder abgelaufen" });
  expect(await p.evaluate(() => kpiPair("123456"))).toEqual({ ok: true });
  const r = await p.evaluate(() => kpiSync());
  expect(r).toMatchObject({ ok: true, n: 3, ignored: 1 });
  const s = await state(p);
  expect(vals(s, "reg_total")[0]).toMatchObject({ value: 321, date: "2026-03-09", src: "verwaltung", status: "confirmed" });
  expect(vals(s, "active_users")[0].value).toBe(88);
  expect(vals(s, "invite_rate")[0].value).toBe(41.5);
  await p.evaluate(() => kpiSync());
  expect(vals(await state(p), "reg_total")).toHaveLength(1);
  // Zugang steht nicht in Backup oder synchronisierten Daten
  const bk = await p.evaluate(async () => JSON.stringify(await makeBackup()));
  expect(bk).not.toContain("t".repeat(40));
});

for (const [variant, msg] of [["pii", "Unerwartete Felder in einem Wert"], ["extra", "Unerwartete Felder (users)"]])
  test(`Antwort mit möglichen Personendaten (${variant}) wird vollständig abgelehnt`, async ({ browser }) => {
    const p = await dev(browser, variant);
    await p.evaluate(() => kpiPair("123456"));
    const r = await p.evaluate(() => kpiSync());
    expect(r.ok).toBe(false);
    expect(r.error).toContain(msg);
    const s = await state(p);
    expect(s.metrics.every((m) => m.entries.length === 0)).toBe(true);
    expect(await p.evaluate(() => LOG.some((e) => e.code === "kpi.reject"))).toBe(true);
  });

test("Prüfregeln der Schnittstelle (ohne Netz)", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const r = await page.evaluate(() => [
    validateKpis({ format: "vivalink-kpis", version: 1, values: [{ key: "reg_total", date: "2026-01-01", value: 1 }] }).ok,
    validateKpis({ format: "vivalink-kpis", version: 1, values: [{ key: "reg_total", date: "gestern", value: 1 }] }).ok,
    validateKpis({ format: "vivalink-kpis", version: 1, values: [{ key: "reg_total", date: "2026-01-01", value: "1" }] }).ok,
    validateKpis({ format: "vivalink-kpis", version: 1, values: [{ key: "reg_total", date: "2026-01-01", value: 1, source: "max@example.invalid" }] }).ok,
    validateKpis({ format: "anders", version: 1, values: [] }).ok,
    validateKpis({ format: "vivalink-kpis", version: 1, values: [], meta: { userList: [] } }).ok,
  ]);
  expect(r).toEqual([true, false, false, false, false, false]);
  expect(await page.evaluate(() => kpiSync())).toMatchObject({ ok: false, error: "Nicht eingerichtet" });
});
