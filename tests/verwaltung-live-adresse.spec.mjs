// Version 2.9: Die App ist mit der echten Adresse der Edge Function „management-kpis“ ausgeliefert.
// Diese Tests senden NICHTS an die produktive Verwaltung: Anfragen an die echte Adresse werden im Browser abgefangen und
// von einer Nachbildung mit derselben Logik wie die Edge Function beantwortet (server/kpi-core.mjs, künstliche Daten).
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ready, state, expectToast } from "./helpers.mjs";
import { handleKpi, memoryRepo } from "../server/kpi-core.mjs";

const HOST = "https://frzeeylzbhpyimqoggzj.supabase.co";
const URL_KPI = HOST + "/functions/v1/management-kpis";
const isHost = (u) => u.origin === HOST;

test("Ausgelieferte Konfiguration: Adresse per HTTPS, in der Sicherheitsrichtlinie (CSP) erlaubt; Testversion ohne Verwaltung", async ({ page }) => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  const connect = csp.split(";").map((x) => x.trim()).find((x) => x.startsWith("connect-src")).split(/\s+/).slice(1);
  expect(connect).toEqual(["'self'", "https://vivalink-sync.hidden-art-0326.workers.dev", HOST]); // genau diese Ziele, kein Platzhalter
  expect(csp).toContain("default-src 'self'");
  await page.goto("/");
  await ready(page);
  expect(await page.evaluate(() => window.VL_KPI_URL)).toBe(URL_KPI);
  // Ziele außerhalb der Richtlinie blockiert der Browser (Beispiel: andere Supabase-Adresse)
  // (Nachweis über das Verstoß-Ereignis der Richtlinie, nicht nur über einen Netzwerkfehler)
  await page.route("https://example.supabase.co/**", (r) => r.fulfill({ status: 200, body: "{}" }));
  const v = await page.evaluate(
    () =>
      new Promise((res) => {
        document.addEventListener("securitypolicyviolation", (e) => res({ uri: e.blockedURI, dir: e.violatedDirective || e.effectiveDirective }), { once: true });
        fetch("https://example.supabase.co/functions/v1/x").catch(() => {});
        setTimeout(() => res(null), 3000);
      }),
  );
  expect(v && v.uri).toContain("example.supabase.co");
  expect(v.dir).toContain("connect-src");
  // Testversion („VL Test“, nur Demodaten): ihr Build ersetzt config.js vollständig – ohne Verwaltungsadresse
  const build = readFileSync(new URL("../scripts/build-test.mjs", import.meta.url), "utf8");
  const testCfg = build.match(/writeFileSync\(`\$\{out\}\/js\/config\.js`, `([^`]*)`/)[1];
  expect(testCfg).toContain('VL_CHANNEL = "test"');
  expect(testCfg).not.toContain("VL_KPI_URL");
  expect(testCfg).not.toContain("supabase");
});

test("Echte App mit eingetragener Verwaltung: ohne Kopplung wird nichts gesendet, Status „Kennzahlen manuell“", async ({ browser }) => {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const p = await ctx.newPage();
  const sent = [];
  await p.route((u) => isHost(u), (r) => (sent.push(r.request().url()), r.abort()));
  await p.goto("/");
  await ready(p);
  for (const t of ["home", "tasks", "studio", "more"]) await p.click(`nav button[data-id="${t}"]`);
  const proto = await p.evaluate(async () => JSON.stringify(await runCycle("test")));
  await p.click('button[data-a="kpi"]');
  await expect(p.locator("#kpCode")).toBeVisible(); // Kopplungsformular statt „vorbereitet“
  await expect(p.locator("#sheet")).toContainText("4-kopplungscode.sql");
  await p.waitForTimeout(1500);
  expect(sent).toEqual([]);
  expect(proto).toContain("Kennzahlen manuell");
  expect(proto).not.toContain("Verwaltung angebunden");
  await ctx.close();
});

test("Kopplung und Abruf über die eingetragene Adresse (nachgebildete Edge Function): Zugang nur als Header, nie in der Adresse", async ({ browser }) => {
  const repo = memoryRepo([
    { key: "reg_total", date: new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date()), value: 42 },
    { key: "active_users", date: new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date()), value: 7 },
  ]);
  await repo.addCode("12345678", Date.now() + 600e3);
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const p = await ctx.newPage();
  const seen = [];
  await p.route((u) => isHost(u), async (route) => {
    const r = route.request();
    const u = new URL(r.url());
    seen.push({ method: r.method(), path: u.pathname, search: u.search, auth: (await r.headerValue("authorization")) || "", origin: (await r.headerValue("origin")) || "" });
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, OPTIONS" };
    if (r.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const out = await handleKpi({ method: r.method(), path: u.pathname, auth: (await r.headerValue("authorization")) || "", body: r.postData() }, repo);
    return route.fulfill({ status: out.status, headers: { ...out.headers, ...cors }, body: out.body });
  });
  await p.goto("/");
  await ready(p);
  await p.click('nav button[data-id="more"]');
  await p.click('button[data-a="kpi"]');
  // falscher Code → abgewiesen, nichts gespeichert
  await p.fill("#kpCode", "00000000");
  await p.click('button[data-a="kpPair"]');
  await expectToast(p, "Code ungültig oder abgelaufen");
  expect(await p.evaluate(() => kvGet("kpi-config"))).toBeNull();
  // richtiger Code → gekoppelt, Werte übernommen
  await p.fill("#kpCode", "12345678");
  await p.click('button[data-a="kpPair"]');
  await expectToast(p, "Gekoppelt");
  await expect(p.locator("#sheet")).toContainText("gekoppelt");
  const s = await state(p);
  expect(s.metrics.find((m) => m.key === "reg_total").entries.filter((e) => !e.deleted)[0]).toMatchObject({ value: 42, src: "verwaltung" });
  // Code nur einmal verwendbar
  expect(await p.evaluate(() => kpiPair("12345678"))).toMatchObject({ ok: false, error: "Code ungültig oder abgelaufen" });
  // Anfragen: genau die Pfade der Edge Function; Zugang nur im Authorization-Header des Abrufs, nie in der Adresse
  const cfg = await p.evaluate(() => kvGet("kpi-config"));
  expect(cfg.token).toMatch(/^[0-9a-f]{64}$/);
  const main = seen.filter((x) => x.method !== "OPTIONS");
  expect(main.map((x) => x.method + " " + x.path)).toEqual(expect.arrayContaining(["POST /functions/v1/management-kpis/pair", "GET /functions/v1/management-kpis/kpis"]));
  for (const x of main) {
    expect(x.search, "keine Parameter in der Adresse").toBe("");
    if (x.path.endsWith("/pair")) expect(x.auth, "Kopplung ohne Zugang").toBe("");
    if (x.path.endsWith("/kpis")) expect(x.auth).toBe("Bearer " + cfg.token);
  }
  expect(JSON.stringify(seen)).not.toContain("12345678".repeat(2));
  // Zugang steht weder im Backup noch in localStorage
  expect(await p.evaluate(async () => JSON.stringify(await makeBackup()))).not.toContain(cfg.token);
  expect(await p.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(cfg.token);
  // Widerruf in der Verwaltung → App erkennt ihn und ruft danach nicht mehr ab
  repo.revokeAll();
  const n0 = seen.length;
  await p.click('button[data-a="kpNow"]');
  await expect(p.locator("#kpRevoked")).toBeVisible();
  const n1 = seen.length;
  expect(n1).toBeGreaterThan(n0);
  expect(await p.evaluate(() => kpiAuto())).toContain("widerrufen");
  expect(seen.length).toBe(n1);
  await ctx.close();
});
