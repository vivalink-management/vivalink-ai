#!/usr/bin/env node
// Bildschirmfotos aller wichtigen Ansichten für die Sichtprüfung durch Claude (nur künstliche Daten).
// Aufruf: node scripts/screenshots.mjs <Zielordner> [chromium|webkit]
// iPhone (hell und dunkel), kleines iPhone, iPad hoch und quer. Startet einen eigenen Testserver (Port 4466).
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium, webkit, devices } from "@playwright/test";

const out = process.argv[2] || "screenshots";
const engine = process.argv[3] === "webkit" ? webkit : chromium;
mkdirSync(out, { recursive: true });
const port = 4466,
  base = `http://127.0.0.1:${port}/`;
const srv = spawn(process.execPath, ["tests/server.mjs"], { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 900));
const DEV = {
  iphone: { ...devices["iPhone 15"], colorScheme: "light" },
  "iphone-dunkel": { ...devices["iPhone 15"], colorScheme: "dark" },
  "iphone-klein": { ...devices["iPhone SE"], colorScheme: "light" },
  "ipad-hoch": { ...devices["iPad (gen 7)"], colorScheme: "light" },
  "ipad-quer": { ...devices["iPad (gen 7) landscape"], colorScheme: "light" },
};
const b = await engine.launch();
const errors = [];
try {
  for (const [name, dev] of Object.entries(DEV)) {
    const { defaultBrowserType, ...d } = dev;
    const ctx = await b.newContext({ ...d, deviceScaleFactor: 1, serviceWorkers: "block" });
    await ctx.addInitScript((u) => (window.VL_SYNC_URL = u), base.slice(0, -1));
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(name + ": " + e.message));
    await p.goto(base);
    await p.waitForFunction(() => typeof S !== "undefined" && S && S.studio);
    await p.evaluate(async () => {
      Object.assign(S.studio.brand, { region: "Testregion", signup: "Registrierung über vivalink.me" });
      S.meetup = { date: addDays(today(), 8), place: "Testort am Markt", goal: "20", note: "", updatedAt: 1 };
      S.tasks.push({ id: "s-t1", title: "Künstliche Testaufgabe mit etwas längerem Titel", prio: "hoch", area: "Marketing", due: addDays(today(), -1), done: false, updatedAt: 1 });
      const slots = planSlots(today().slice(0, 7)).concat(planSlots(nextMonth(today().slice(0, 7)))).slice(0, 6);
      importPlan(JSON.stringify({ posts: slots.map((s, i) => ({ ...s, title: "Beispielbeitrag " + i, hook: "Einstieg " + "abcdef"[i], slides: s.type === "karussell" ? [{ template: "cover", title: "Fünf Wege, ein Gespräch zu beginnen" }, { template: "tipp", title: "Offene Fragen", text: "Was hat dich hergeführt?" }, { template: "abschluss", title: "Lust auf neue Kontakte?" }] : [{ template: "frage", title: "Wo kommst du am liebsten ins Gespräch?" }], caption: "Beispieltext.\n\nMehr auf vivalink.me", hashtags: ["#Vivalink"] })) }));
      await runCycle("screenshots");
      await save();
      render();
    });
    const shot = async (n) => {
      await p.waitForTimeout(400);
      await p.screenshot({ path: `${out}/${name}-${n}.png` });
    };
    for (const tab of ["home", "tasks", "studio", "more"]) {
      await p.click(`nav button[data-id="${tab}"]`);
      await shot(tab);
    }
    await p.click('nav button[data-id="studio"]');
    await p.locator('[data-a="stOpen"]').first().click();
    await shot("beitrag");
    for (const t of ["text", "gestaltung", "termin"]) {
      await p.click(`#sheet [data-a="stTab"][data-id="${t}"]`);
      await shot("beitrag-" + t);
    }
    await p.click("#sheet .abar button[data-a='stClose']");
    await p.click('nav button[data-id="more"]');
    await p.click('button[data-a="auto"]');
    await shot("autonomie");
    await p.click('#sheet button[data-a="close"]');
    await p.click('button[data-a="sync"]');
    await shot("sync");
    await ctx.close();
  }
} finally {
  await b.close();
  srv.kill();
}
console.log(errors.length ? "Fehler: " + errors.join(" | ") : "Bildschirmfotos in " + out + " (keine JavaScript-Fehler)");
