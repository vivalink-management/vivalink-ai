// LIVE-Prüfung des Workers „vivalink-ki“ NACH der Bereitstellung – ohne KI-Aufruf und ohne Kontingentverbrauch:
// Status, Ablehnung ohne gültigen Gerätezugang, fremde Webseiten. Läuft nur mit LIVE=1 (Ablauf „Live-Prüfung KI“, manuell).
import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";

const URL_KI = process.env.LIVE_KI_URL || "https://vivalink-ki.hidden-art-0326.workers.dev";
const ORIGIN = "https://vivalink-management.github.io";
test.skip(!process.env.LIVE, "nur mit LIVE=1");

test("Live: KI-Gegenstelle erreichbar, ohne gültigen Zugang keine KI-Nutzung", async () => {
  let r = await fetch(URL_KI + "/v1/ki/status", { headers: { origin: ORIGIN } });
  expect(r.status).toBe(200);
  const s = await r.json();
  expect(s).toMatchObject({ ok: true, service: "vivalink-ki" });
  expect(s.budget).toBeLessThan(10000);
  expect(r.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  const body = (vault) => JSON.stringify({ vault, messages: [{ role: "user", content: "Test" }] });
  for (const [name, auth, vault] of [
    ["ohne Zugang", "", randomBytes(16).toString("hex")],
    ["zufälliger Zugang", "Bearer " + randomBytes(32).toString("hex"), randomBytes(16).toString("hex")],
    ["ungültige Tresor-Kennung", "Bearer " + randomBytes(32).toString("hex"), "x"],
  ]) {
    r = await fetch(URL_KI + "/v1/ki/chat", { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: body(vault) });
    expect(r.status, name).toBe(401);
    expect(await r.text(), name).toBe('{"error":"unauthorized"}');
  }
  r = await fetch(URL_KI + "/v1/ki/status", { headers: { origin: "https://example.com" } });
  expect(r.status).toBe(403);
  r = await fetch(URL_KI + "/v1/ki/chat", { method: "GET", headers: { origin: ORIGIN } });
  expect(r.status).toBe(404);
});
