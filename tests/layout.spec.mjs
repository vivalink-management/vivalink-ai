// Automatische Sichtprüfung der Oberfläche (ersetzt die manuelle Durchsicht auf iPhone und iPad weitgehend):
// jede Ansicht und jedes Fenster mit realistischen künstlichen Daten auf
// - waagerechtes Überlaufen der Seite,
// - Elemente, die rechts/links aus dem Bildschirm ragen,
// - abgeschnittene Texte (ohne bewusste Auslassungspunkte) und Knopftexte, die nicht passen,
// - zu kleine Tippflächen,
// - feste Aktionsleiste außerhalb des Bildschirms und Inhalte, die unter der Navigationsleiste verschwinden.
// Läuft in allen Projekten (Desktop, iPhone, iPad; in GitHub Actions zusätzlich WebKit) und zusätzlich auf einem kleinen iPhone (375 px).
// Grenze: Echte Geräte (Schriftgrößen-Einstellung, Safari-Leisten, Tastatur) können abweichen.
import { test, expect } from "@playwright/test";
import { seed, nav, guard } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";

const NOW = new Date("2026-03-02T09:00:00");
function rich() {
  const s = v2State();
  s.studio = { brand: { region: "Testregion mit einem recht langen Namen", signup: "Registrierung über vivalink.me", colorsConfirmed: true, website: "vivalink.me" }, settings: {}, posts: [], learned: {} };
  s.meetup = { date: "2026-03-10", place: "Ein Ort mit ziemlich langem Namen am Marktplatz", goal: "20", note: "", updatedAt: 1 };
  s.tasks.push({ id: "t-long", title: "Eine sehr lange Aufgabenbeschreibung, die auf dem iPhone sicher umbrechen muss, ohne abgeschnitten zu werden", prio: "hoch", area: "Marketing", due: "2026-02-20", done: false, updatedAt: 1 });
  s.tasks.push({ id: "t-dep", title: "Abhängige Aufgabe", prio: "mittel", area: "App", due: "", after: "t-long", done: false, updatedAt: 1 });
  return s;
}
async function fill(page) {
  await page.evaluate(async () => {
    const slots = planSlots(sm()).slice(0, 8);
    importPlan(
      JSON.stringify({
        posts: slots.map((s, i) => ({
          ...s,
          title: "Beitrag mit einem langen internen Titel Nummer " + i,
          hook: "Einstieg " + "abcdefgh"[i],
          slides: s.type === "karussell" ? [{ template: "cover", title: "Titel" }, { template: "info", title: "Info", text: "Eins\nZwei" }, { template: "abschluss", title: "Ende" }] : [{ template: "frage", title: "Frage?" }],
          caption: i === 2 ? "Nur 9 € – vivalink.me" : "Text mit Handlungsaufforderung auf vivalink.me",
          hashtags: ["#Vivalink"],
        })),
      }),
    );
    for (const m of S.metrics.slice(0, 3)) {
      addVal(m.id, { date: addDays(today(), -8), value: 10, status: "confirmed" });
      addVal(m.id, { date: today(), value: 14, status: "confirmed" });
    }
    await save();
  });
}
/* Prüft das sichtbare Layout und liefert eine Liste von Problemen */
async function issues(page, scope) {
  return page.evaluate((scope) => {
    const out = [];
    const W = document.documentElement.clientWidth;
    const d = (el) => (el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.dataset.a ? `[${el.dataset.a}]` : "") + " „" + (el.innerText || el.value || "").trim().slice(0, 30) + "“").replace(/\s+/g, " ");
    if (document.documentElement.scrollWidth > W + 1) out.push("Seite breiter als der Bildschirm (" + document.documentElement.scrollWidth + " > " + W + ")");
    const root = document.querySelector(scope);
    if (!root) return ["Bereich fehlt: " + scope];
    const scrollX = ".prev, .chips, .edtabs";
    for (const el of root.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || el.closest("[hidden]")) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (el.closest(scrollX) && !el.matches(scrollX)) continue; // waagerecht scrollbare Leisten (gewollt)
      if (r.right > W + 1 || r.left < -1) out.push("ragt aus dem Bildschirm: " + d(el));
      const clips = ["hidden", "clip"].includes(cs.overflowX);
      if (clips && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== "ellipsis" && !el.matches("canvas, .thumb, .bar, textarea, input")) out.push("Inhalt abgeschnitten: " + d(el));
      if (el.matches("button, select, input:not([type=checkbox]):not([type=hidden]):not([type=file])")) {
        if (el.matches("button") && el.scrollWidth > el.clientWidth + 2) out.push("Knopftext passt nicht: " + d(el));
        if (r.height < 30) out.push("Tippfläche zu klein (" + Math.round(r.height) + " px): " + d(el));
      }
    }
    // feste Aktionsleiste im Bildschirm
    const bar = root.querySelector(".abar");
    if (bar) {
      const br = bar.getBoundingClientRect();
      if (br.bottom > innerHeight + 1 || br.top < 0) out.push("Aktionsleiste nicht vollständig sichtbar");
    }
    return [...new Set(out)];
  }, scope);
}
/* Letztes Element der Seite darf nicht unter der Navigationsleiste verschwinden */
async function bottomClear(page) {
  return page.evaluate(async () => {
    scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 50));
    const last = [...document.querySelectorAll("#app > *")].filter((e) => e.getBoundingClientRect().height).pop();
    const navTop = document.querySelector("nav").getBoundingClientRect().top;
    return !last || last.getBoundingClientRect().bottom <= navTop + 1;
  });
}

for (const small of [false, 375, 320]) {
  test.describe(small ? `Kleines iPhone (${small} px, auch „vergrößerte Anzeige“)` : "Gerätegröße des Projekts", () => {
    test.beforeEach(async ({ page }, info) => {
      test.skip(small && !info.project.name.includes("iphone"), "kleines iPhone nur im iPhone-Projekt");
      if (small) await page.setViewportSize({ width: small, height: small === 320 ? 568 : 667 });
      await page.clock.setFixedTime(NOW);
    });

    test("Hauptansichten: nichts läuft über, nichts ist abgeschnitten oder verdeckt", async ({ page }) => {
      const g = await guard(page);
      await seed(page, { state: rich() });
      await fill(page);
      const found = {};
      for (const tab of ["home", "tasks", "memory", "studio", "ai", "more"]) {
        await nav(page, tab);
        await page.waitForTimeout(150);
        const i = await issues(page, "#app");
        if (i.length) found[tab] = i;
        if (!(await bottomClear(page))) (found[tab] = found[tab] || []).push("letzter Inhalt unter der Navigationsleiste");
      }
      expect(found).toEqual({});
      expect(g.errors).toEqual([]);
    });

    test("Fenster: Beitrag bearbeiten (alle Bereiche), Markenprofil, Aufgabe, Autonomie, Synchronisierung, Diagnose", async ({ page, context }) => {
      await context.addInitScript(() => (window.VL_SYNC_URL = "http://127.0.0.1:4173"));
      const g = await guard(page);
      await seed(page, { state: rich() });
      await fill(page);
      const found = {};
      const check = async (name) => {
        await page.waitForTimeout(200);
        const i = await issues(page, "#sheet");
        if (i.length) found[name] = i;
      };
      await nav(page, "studio");
      await page.locator('[data-a="stOpen"]').nth(2).click();
      for (const t of ["vorschau", "text", "gestaltung", "termin"]) {
        const tabBtn = page.locator(`#sheet [data-a="stTab"][data-id="${t}"]`);
        if (await tabBtn.isVisible()) await tabBtn.click();
        await check("Beitrag/" + t);
      }
      await page.click("#sheet .abar button[data-a='stClose']");
      await page.click('button[data-a="stBrand"]');
      await check("Markenprofil");
      await page.click('#sheet button[data-a="close"]');
      await page.click('button[data-a="stPrompt"]');
      await check("Monatsplan");
      await page.click('#sheet button[data-a="close"]');
      await nav(page, "tasks");
      await page.click('[data-a="editTask"][data-id="t-dep"]');
      await check("Aufgabe");
      await page.click('#sheet button[data-a="close"]');
      await nav(page, "more");
      await page.click('button[data-a="auto"]');
      await check("Autonomie");
      await page.click('#sheet button[data-a="close"]');
      await page.click('button[data-a="sync"]');
      await check("Synchronisierung");
      await page.click('#sheet button[data-a="close"]');
      // gekoppelt, aber nur dieses Gerät im Datenspeicher → Hinweis „Zusammenführen“
      await page.evaluate(() => kvPut("sync-config", { vid: "a".repeat(32), token: "b".repeat(64), mk: "c", kv: 1, version: 1, last: Date.now(), devices: {}, recoveryAt: Date.now() }));
      await page.click('button[data-a="sync"]');
      await expect(page.locator("#syMergeCard")).toBeVisible();
      await check("Synchronisierung/Zusammenführen");
      await page.click('#sheet button[data-a="close"]');
      await page.evaluate(() => kvPut("sync-config", null));
      await page.click('button[data-a="kpi"]');
      await check("Verwaltung");
      await page.click('#sheet button[data-a="close"]');
      // Verwaltung: Zustände „Problem beim Abruf“ und „Zugang widerrufen“
      for (const [name, cfg] of [
        ["Verwaltung/Fehler", { token: "ab".repeat(32), since: 1, last: Date.now() - 3600e3, fails: 2, lastError: { at: Date.now(), msg: "Verwaltung nicht erreichbar (503) – ein recht langer Fehlertext zum Umbrechen" } }],
        ["Verwaltung/widerrufen", { token: "ab".repeat(32), since: 1, last: 1, fails: 1, revoked: Date.now(), lastError: { at: Date.now(), msg: "Zugang widerrufen – bitte neu koppeln" } }],
      ]) {
        await page.evaluate(async (c) => ((window.VL_KPI_URL = "http://127.0.0.1:4173/kpi/ok"), await kvPut("kpi-config", c)), cfg);
        await page.click('button[data-a="kpi"]');
        await check(name);
        await page.click('#sheet button[data-a="close"]');
      }
      await page.evaluate(async () => ((window.VL_KPI_URL = ""), await kvPut("kpi-config", null)));
      await page.click('button[data-a="diag"]');
      await page.waitForTimeout(400);
      await check("Diagnose");
      await page.click('#sheet button[data-a="close"]');
      await nav(page, "home");
      await page.click('button[data-a="report"]');
      await check("Wochenbericht");
      await page.click('#sheet button[data-a="close"]');
      await nav(page, "ai");
      await page.click('[data-a="tpl"][data-id="week"]');
      await page.fill("#ans", '```json\n{"format":"vivalink-actions","version":1,"tasks":[{"title":"Eine ziemlich lange Aufgabe aus der Antwort der KI mit vielen Wörtern","prio":"hoch","area":"Meetup","dueDays":5,"why":"Begründung mit etwas mehr Text, damit umgebrochen werden muss"}]}\n```');
      await page.click('button[data-a="ansTasks"]');
      await check("Aufgaben übernehmen");
      expect(found).toEqual({});
      expect(g.errors).toEqual([]);
    });
  });
}

test("Gegenprobe: die Prüfung erkennt echte Darstellungsfehler", async ({ page }) => {
  await seed(page, { state: rich() });
  await page.evaluate(() => {
    const a = document.querySelector("#app");
    a.insertAdjacentHTML("beforeend", '<div style="width:2000px">zu breit</div><div style="overflow:hidden;white-space:nowrap;width:80px">ein langer abgeschnittener Text ohne Punkte</div><button style="height:18px;padding:0;min-height:0">x</button>');
  });
  const i = (await issues(page, "#app")).join(" | ");
  expect(i).toContain("Seite breiter als der Bildschirm");
  expect(i).toContain("ragt aus dem Bildschirm");
  expect(i).toContain("Inhalt abgeschnitten");
  expect(i).toContain("Tippfläche zu klein");
});
