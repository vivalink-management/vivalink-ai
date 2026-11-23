// Sicherheit: manipulierte Daten können keinen Code ausführen, keine fremden Server, Content-Security-Policy greift.
import { test, expect } from "@playwright/test";
import { guard, open, seed, nav, state, kv, expectToast } from "./helpers.mjs";
import { v1State, v2State } from "./fixtures.mjs";

let g;
test.beforeEach(async ({ page }) => (g = await guard(page)));

function evilBackup() {
  const s = v1State();
  s.memory.push({ id: "evil1", cat: '<img src=x onerror="window.__pwned=1">', title: '<img src=x onerror="window.__pwned=1">Böser Titel', text: "<script>window.__pwned=1</script>", status: '"><img src=x onerror=window.__pwned=1>', date: '"><b>', reason: "", result: "", private: false, active: true, createdAt: 1, updatedAt: 1 });
  s.memory.push({ id: 'bad" onclick="window.__pwned=1', title: "Ungültige ID", status: "confirmed", active: true });
  s.tasks.push({ id: "evilT", title: "<svg onload=window.__pwned=1>", prio: '"><img src=x onerror=window.__pwned=1>', area: "<b>x</b>", due: "<i>", done: false, updatedAt: 1 });
  s.tasks.push({ title: "Ohne ID" });
  return s;
}

test("Manipuliertes Backup: Inhalte werden nur als Text gezeigt, ungültige Datensätze übersprungen", async ({ page }) => {
  await open(page);
  await nav(page, "more");
  await page.fill("#imp", JSON.stringify(evilBackup()));
  await page.click('button[data-a="imp"]');
  await expect(page.locator("#sheet")).toContainText("2 ungültig");
  await page.click('button[data-a="impGo"]');
  await expectToast(page, "2 ungültig übersprungen");
  for (const t of ["home", "tasks", "memory", "ai", "more"]) await nav(page, t);
  await nav(page, "memory");
  await expect(page.locator("#list")).toContainText('<img src=x onerror="window.__pwned=1">Böser Titel');
  await nav(page, "ai");
  await page.click('[data-a="tpl"][data-id="strat"]');
  expect(await page.inputValue("#pv")).not.toContain("<script>window.__pwned=1</script>"); // Inhalt mit ungültiger Kategorie nicht im Auftrag
  await nav(page, "more");
  await page.click('button[data-a="diag"]');
  await expect(page.locator("#sheet")).toContainText("Diagnose");
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  const s = await state(page);
  expect(s.memory.find((m) => m.id === "evil1").status).toBe("unknown");
  expect(s.memory.find((m) => m.id === "evil1").date).toBe("");
  expect(s.tasks.find((t) => t.id === "evilT").prio).toBe("mittel");
  expect(s.memory.some((m) => m.title === "Ungültige ID")).toBe(false);
  expect(g.errors).toEqual([]);
});

test("KI-Antwort mit HTML wird nicht ausgeführt", async ({ page }) => {
  await open(page);
  await nav(page, "ai");
  await page.click('[data-a="tpl"][data-id="sum"]');
  await page.fill("#ans", '<img src=x onerror="window.__pwned=1"> Antwort');
  await page.click('button[data-a="saveAns"][data-id="estimate"]');
  await expect(page.locator("#list")).toContainText("<img src=x");
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(g.errors).toEqual([]);
});

test("Rundgang durch alle Ansichten: keine Verstöße gegen die Sicherheitsrichtlinie, keine fremden Server", async ({ page }) => {
  await seed(page, { state: v2State() });
  for (const t of ["home", "tasks", "memory", "ai", "more"]) await nav(page, t);
  await nav(page, "ai");
  await page.click('[data-a="tpl"][data-id="ig"]');
  await nav(page, "more");
  await page.click('button[data-a="aiTest"]');
  await page.click('#sheet button[data-a="close"]');
  await page.click('button[data-a="diag"]');
  await page.click('#sheet button[data-a="close"]');
  await nav(page, "home");
  await page.click('[data-a="met"][data-id="m_reg_week"]');
  await page.click('#sheet button[data-a="close"]');
  await page.click('[data-a="meet"]');
  await page.click('#sheet button[data-a="close"]');
  await page.waitForTimeout(200);
  const log = (await kv(page, "log")) || [];
  expect(log.filter((e) => e.code === "csp")).toEqual([]);
  expect(g.errors).toEqual([]);
  expect(g.external).toEqual([]);
});

test("Content-Security-Policy verhindert eingeschleuste Skripte und wird protokolliert", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const d = document.createElement("div");
    d.innerHTML = '<img src="x" onerror="window.__pwned=1">';
    document.body.appendChild(d);
    const s = document.createElement("script");
    s.textContent = "window.__pwned2=1";
    document.body.appendChild(s);
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => [window.__pwned, window.__pwned2])).toEqual([undefined, undefined]);
  await expect.poll(async () => ((await kv(page, "log")) || []).some((e) => e.code === "csp")).toBe(true);
});

test("Backup und Diagnose enthalten keine Daten anderer Geräte-Speicher und keine Schlüssel", async ({ page }) => {
  await seed(page, { state: v1State() });
  const b = await page.evaluate(async () => JSON.stringify(await makeBackup()));
  expect(b).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);
  expect(b).not.toMatch(/password|token/i);
});
