// Datensicherung: Export, Prüfung, Import alter und neuer Formate, Vorschau, Rückgängig.
import { test, expect } from "@playwright/test";
import { APP, SCHEMA, CACHE } from "./version.mjs";
import { guard, open, seed, ready, nav, state, kv, stubClipboard, waitClip, expectToast } from "./helpers.mjs";
import { v1State, v2State } from "./fixtures.mjs";

let g;
test.beforeEach(async ({ page }) => (g = await guard(page)));
test.afterEach(async () => expect(g.errors).toEqual([]));

async function pasteAnd(page, text, action) {
  await nav(page, "more");
  await page.fill("#imp", text);
  await page.click(`button[data-a="${action}"]`);
}
async function confirmImport(page) {
  await page.click('button[data-a="impGo"]');
  await expect(page.locator("#sheet")).toBeHidden();
}

test("Backup kopieren: vollständiges Format mit Prüfsumme und KI-Tests, Datum erst nach Erfolg", async ({ page }) => {
  await stubClipboard(page);
  await seed(page, { state: v2State(), aitest: [{ id: "ai1", device: "Testgerät", model: "Testmodell", r: [] }] });
  await page.evaluate(() => {
    S.lastBackup = "";
    return save();
  });
  await nav(page, "more");
  await page.click('button[data-a="exp"]');
  await expectToast(page, "Backup kopiert");
  const b = JSON.parse(await waitClip(page));
  expect(b.format).toBe("vivalink-backup");
  expect(b.schema).toBe(SCHEMA);
  expect(b.app).toBe(APP);
  expect(b.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(b.data.memory).toHaveLength(4);
  expect(b.data.metrics.length).toBe(11);
  expect(b.aitest).toHaveLength(1);
  expect((await state(page)).lastBackup).toBe(new Date().toLocaleDateString("sv-SE"));
});

test("Zwischenablage gesperrt: Backup gilt NICHT als erledigt, bis es geprüft wurde", async ({ page }) => {
  await stubClipboard(page, true);
  await seed(page, { state: v1State() });
  await nav(page, "more");
  await page.click('button[data-a="exp"]');
  await expectToast(page, "Backup prüfen");
  expect((await state(page)).lastBackup).toBe("2026-01-08");
  const text = await page.inputValue("#imp");
  expect(JSON.parse(text).format).toBe("vivalink-backup");
  await page.click('button[data-a="chkImp"]');
  await expect(page.locator("#impRes")).toContainText("Prüfsumme korrekt");
  await expect(page.locator("#impRes")).toContainText("Alle Einträge dieses Backups sind auf diesem Gerät vorhanden");
  await expect.poll(async () => (await state(page)).lastBackup).toBe(new Date().toLocaleDateString("sv-SE"));
  await expect.poll(async () => ((await kv(page, "log")) || []).some((e) => e.code === "backup.clipboard")).toBe(true);
});

test("Selbsttest wie bisher: eigenes Backup zusammenführen ergibt „0 Einträge übernommen“", async ({ page }) => {
  await stubClipboard(page);
  await seed(page, { state: v2State() });
  await nav(page, "more");
  await page.click('button[data-a="exp"]');
  const before = await state(page);
  await pasteAnd(page, await waitClip(page), "imp");
  await expect(page.locator("#sheet")).toContainText("0 neu, 0 aktualisiert, 0 Konflikt(e)");
  await confirmImport(page);
  await expectToast(page, "0 Einträge übernommen");
  const after = await state(page);
  expect(after.memory).toEqual(before.memory);
  expect(after.tasks).toEqual(before.tasks);
  expect(after.conflicts).toEqual([]);
});

test("Alte Backups aus Version 1 und Version 2 lassen sich prüfen und zusammenführen", async ({ page }) => {
  await open(page);
  for (const [fix, label] of [[v1State(), "Datenversion 1"], [v2State(), "Datenversion 2"]]) {
    await pasteAnd(page, JSON.stringify(fix), "chkImp");
    await expect(page.locator("#impRes")).toContainText(label);
    await expect(page.locator("#impRes")).toContainText("Älteres Backup-Format");
  }
  await pasteAnd(page, JSON.stringify(v1State()), "imp");
  await expect(page.locator("#sheet")).toContainText("6 neu");
  await confirmImport(page);
  await expectToast(page, "6 Einträge übernommen");
  await pasteAnd(page, JSON.stringify(v2State()), "imp");
  await confirmImport(page);
  const s = await state(page);
  expect(s.memory).toHaveLength(4);
  expect(s.metrics.find((m) => m.id === "m_reg_week").entries).toHaveLength(2);
  expect(s.metrics.find((m) => m.id === "m_reg_week").goal).toBe("15");
  expect(s.meetup.place).toBe("Testort");
  expect(s.conflicts).toEqual([]);
});

test("Szenario iPhone + iPad + Artefakt: drei getrennte Stände werden ohne Verlust vereint", async ({ page }) => {
  const iphone = v1State(),
    ipad = { v: 1, dev: "devTestPad", memory: [{ id: "p1", cat: "App", title: "iPad-Testnotiz", text: "", status: "confirmed", date: "2026-01-09", reason: "", result: "", private: false, active: true, createdAt: 5, updatedAt: 5 }], tasks: [{ id: "pt1", title: "iPad-Testaufgabe", prio: "mittel", area: "App", due: "", done: false, updatedAt: 6 }], accent: "", lastBackup: "" },
    art = v2State();
  art.memory = [{ id: "a1", cat: "Marketing", title: "Artefakt-Testnotiz", text: "", status: "estimate", date: "2026-01-09", reason: "", result: "", private: false, active: true, createdAt: 7, updatedAt: 7 }];
  art.tasks = [];
  await seed(page, { state: iphone });
  for (const b of [ipad, art]) {
    await pasteAnd(page, JSON.stringify(b), "imp");
    await confirmImport(page);
  }
  const s = await state(page);
  expect(s.memory.map((m) => m.id).sort()).toEqual(["a1", "m1", "m2", "m3", "m4", "p1"]);
  expect(s.tasks.map((t) => t.id).sort()).toEqual(["pt1", "t1", "t2"]);
  expect(s.metrics.find((m) => m.id === "m_reg_week").entries).toHaveLength(2);
  expect(s.dev).toBe("devTestA");
  expect(s.conflicts).toEqual([]);
});

test("Rückgängig: letzter Import wird vollständig zurückgenommen", async ({ page }) => {
  await seed(page, { state: v1State() });
  const before = await state(page);
  await pasteAnd(page, JSON.stringify(v2State()), "imp");
  await confirmImport(page);
  await expect(page.locator('button[data-a="undoImp"]')).toBeVisible();
  await page.click('button[data-a="undoImp"]');
  await expectToast(page, "Nochmal tippen");
  await page.click('button[data-a="undoImp"]');
  await expect.poll(async () => (await state(page)).metrics.find((m) => m.id === "m_reg_week").entries.length).toBe(0);
  expect((await state(page)).memory).toEqual(before.memory);
  await expect.poll(() => kv(page, "pre-import")).toBeNull();
});

test("Beschädigte oder veränderte Backups werden abgelehnt, nichts wird verändert", async ({ page }) => {
  await stubClipboard(page);
  await seed(page, { state: v1State() });
  await nav(page, "more");
  await page.click('button[data-a="exp"]');
  const text = await waitClip(page);
  const before = await state(page);
  await pasteAnd(page, text.slice(0, -40), "imp");
  await expectToast(page, "Kein gültiges Backup");
  const t = JSON.parse(text);
  t.data.tasks[0].title = "Manipuliert";
  await pasteAnd(page, JSON.stringify(t), "imp");
  await expectToast(page, "verändert oder beschädigt");
  await expect(page.locator("#impRes")).toContainText("Prüfsumme falsch");
  await pasteAnd(page, '{"foo":1}', "chkImp");
  await expect(page.locator("#impRes")).toContainText("Kein gültiges Backup");
  expect(await state(page)).toEqual(before);
});

test("Kennzahlen-Import (values-Format) mit Vorschau, ungültige Werte werden übersprungen", async ({ page }) => {
  await open(page);
  const v = { values: [{ key: "reg_week", date: "2026-01-12", value: 5, source: "test" }, { key: "gibtsnicht", date: "2026-01-12", value: 1 }, { key: "reg_week", date: "kaputt", value: 1 }, { key: "signups", date: "2026-01-12", value: "abc" }] };
  await pasteAnd(page, JSON.stringify(v), "imp");
  await expect(page.locator("#sheet")).toContainText("1 übernommen, 3 ungültig");
  await confirmImport(page);
  await expectToast(page, "1 Einträge übernommen · 3 ungültig übersprungen");
  const e = (await state(page)).metrics.find((m) => m.key === "reg_week").entries;
  expect(e).toHaveLength(1);
  expect(e[0]).toMatchObject({ value: 5, status: "confirmed", src: "test" });
});

test("Als Datei sichern: lädt eine gültige Backup-Datei herunter", async ({ page }) => {
  await seed(page, { state: v1State() });
  await nav(page, "more");
  await page.evaluate(() => {
    navigator.canShare = undefined;
  });
  const dl = page.waitForEvent("download");
  await page.click('button[data-a="expFile"]');
  const d = await dl;
  expect(d.suggestedFilename()).toMatch(/^vivalink-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const { readFile } = await import("node:fs/promises");
  const j = JSON.parse(await readFile(await d.path(), "utf8"));
  expect(j.format).toBe("vivalink-backup");
  expect(j.data.tasks).toHaveLength(2);
});
