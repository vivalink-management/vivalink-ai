// Änderung WÄHREND einer laufenden Synchronisierung (z. B. der automatischen Abholung nach dem Koppeln):
// Sie darf nicht bis zum nächsten Anlass nur auf diesem Gerät bleiben. Ursache eines in GitHub Actions (WebKit) zufällig
// aufgetretenen Fehlers im Zusammenführungs-Test. Hier gezielt nachgestellt: die laufende Synchronisierung wird
// künstlich verlangsamt. Nur künstliche Daten, lokaler Test-Server.
import { test, expect } from "@playwright/test";
import { ready, state } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";

const BASE = "http://127.0.0.1:4173";
async function device(browser, name, withState = true) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript((u) => (window.VL_SYNC_URL = u), BASE);
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(name + ": " + e.message));
  await p.goto("/");
  await ready(p);
  if (withState)
    await p.evaluate(
      async ([s, name]) => {
        S = s;
        S.dev = "dev-" + name;
        migrate();
        await save();
      },
      [v2State(), name],
    );
  return p;
}
// Hochladen (PUT) des nächsten Synchronisierungs-Durchgangs um ms verzögern
const slowNextPut = (p, ms) =>
  p.evaluate((ms) => {
    const f0 = window.fetch;
    let once = true;
    window.fetch = async (u, o) => {
      if (once && o && o.method === "PUT" && String(u).includes("/v1/vault/")) {
        once = false;
        await new Promise((r) => setTimeout(r, ms));
      }
      return f0(u, o);
    };
  }, ms);

test("Änderung während einer laufenden Synchronisierung: ausdrückliches Synchronisieren wartet und lädt sie hoch; automatisch wird nachgereicht", async ({ browser }) => {
  const A = await device(browser, "iPhone");
  const R = (await A.evaluate(() => syncCreate())).recovery;
  const B = await device(browser, "iPad", false);
  expect((await B.evaluate((r) => syncRecover(r), R)).ok).toBe(true);

  // 1) Hintergrund-Durchgang läuft (verlangsamt), währenddessen Aufgabe anlegen und ausdrücklich synchronisieren
  await slowNextPut(A, 1500);
  const r = await A.evaluate(async () => {
    const bg = syncOnce(); // z. B. automatische Abholung 15 s nach dem Koppeln
    await new Promise((r) => setTimeout(r, 200));
    const x = { id: "t-waehrend", title: "Während der Synchronisierung angelegt", prio: "mittel", area: "App", due: "", done: false };
    touch(x);
    S.tasks.push(x);
    await save();
    const mine = await syncOnce(); // vorher: sofort „Läuft bereits“ – Änderung blieb lokal
    await bg;
    return mine;
  });
  expect(r.ok, JSON.stringify(r)).toBe(true);
  expect((await B.evaluate(() => syncOnce())).ok).toBe(true);
  expect((await state(B)).tasks.some((t) => t.id === "t-waehrend")).toBe(true);

  // 2) nur automatisch: Änderung während des Durchgangs wird danach von selbst hochgeladen
  await slowNextPut(A, 1500);
  await A.evaluate(async () => {
    syncOnce();
    await new Promise((r) => setTimeout(r, 200));
    const x = { id: "t-auto", title: "Automatisch nachgereicht", prio: "mittel", area: "App", due: "", done: false };
    touch(x);
    S.tasks.push(x);
    await save(); // plant automatisch – während des laufenden Durchgangs
  });
  await expect
    .poll(async () => (await B.evaluate(() => syncOnce())).ok && (await state(B)).tasks.some((t) => t.id === "t-auto"), { timeout: 15000, intervals: [1000] })
    .toBe(true);
  expect([...A.errors, ...B.errors]).toEqual([]);
});
