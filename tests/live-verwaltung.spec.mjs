// LIVE-Prüfung der produktiven Edge Function „management-kpis“ – AUSSCHLIESSLICH Anfragen ohne Schreibvorgang in der
// Datenbank: keine Kopplung (jeder Fehlversuch würde protokolliert), keine gültigen Zugänge, keine Kennzahlen.
// Läuft nur mit LIVE=1 (GitHub Actions: Ablauf „Live-Prüfung Verwaltung“, manuell oder bei Änderung dieser Datei).
// Wenige Aufrufe je Lauf (Supabase Free: 500.000 Aufrufe im Monat inklusive) – keine Kosten.
import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";

const URL_KPI = process.env.LIVE_KPI_URL || "https://frzeeylzbhpyimqoggzj.supabase.co/functions/v1/management-kpis";
const ORIGIN = "https://vivalink-management.github.io";
const BUILD = process.env.LIVE_KPI_BUILD || "1f7175d2c58f6458601568434bd2d75f17ba8dba47a2abb62cd42ef7795a49ee";
test.skip(!process.env.LIVE, "nur mit LIVE=1");

const get = (path, headers = {}, method = "GET") => fetch(URL_KPI + path, { method, headers: { origin: ORIGIN, ...headers } });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const fakeJwt = (role) => b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ role, iss: "supabase", exp: 4102444800 }) + "." + randomBytes(32).toString("base64url");
// keine internen Angaben in Antworten (Datenbank, Schema, Fehlertexte, Programmstellen)
const clean = (t) => expect(t).not.toMatch(/management_ai|postgres|pg_|sqlstate|select |relation|stack|at .*\.(ts|mjs|js):\d+|supabase_db|password/i);

test("Live: Version, CORS und Ablehnung ohne gültigen Gerätezugang (nur lesend)", async () => {
  // Fassung der bereitgestellten Datei (nur ein Hinweis, kein kryptografischer Nachweis – siehe ANLEITUNG.md)
  let r = await get("/version");
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ format: "vivalink-kpis-version", build: BUILD });
  expect(r.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  expect(r.headers.get("cache-control")).toBe("no-store");

  // Kennzahlen nur mit gültigem, nicht widerrufenem Gerätezugang – JWT-Prüfung von Supabase ist absichtlich aus
  const cases = [
    ["ohne Zugang", {}],
    ["leerer Bearer", { authorization: "Bearer " }],
    ["zufälliger Zugang (64 Hex)", { authorization: "Bearer " + randomBytes(32).toString("hex") }],
    ["Großbuchstaben-Hex", { authorization: "Bearer " + randomBytes(32).toString("hex").toUpperCase() }],
    ["gefälschtes JWT mit hoher Rolle", { authorization: "Bearer " + fakeJwt("service" + "_role") }],
    ["gefälschtes JWT als apikey", { apikey: fakeJwt("anon"), authorization: "Bearer " + fakeJwt("authenticated") }],
    ["Einschleusungsversuch", { authorization: "Bearer ' or 1=1 --" }],
    ["zu langer Zugang", { authorization: "Bearer " + "a".repeat(5000) }],
  ];
  for (const [name, h] of cases) {
    r = await get("/kpis", h);
    expect(r.status, name).toBe(401);
    const t = await r.text();
    expect(t, name).toBe('{"error":"unauthorized"}');
    clean(t);
  }
  r = await get("/kpis?token=" + randomBytes(32).toString("hex"));
  expect(r.status, "Zugang in der Adresse wird ignoriert").toBe(401);

  // fremde Webseiten: abgewiesen, ohne CORS-Freigabe
  r = await get("/kpis", { origin: "https://example.com", authorization: "Bearer " + randomBytes(32).toString("hex") });
  expect(r.status).toBe(403);
  expect(r.headers.get("access-control-allow-origin")).toBeNull();
  r = await get("/version", { origin: "https://vivalink-management.github.io.example.com" });
  expect(r.status).toBe(403);
  // Vorabanfrage des Browsers
  r = await get("/kpis", { "access-control-request-method": "GET", "access-control-request-headers": "authorization" }, "OPTIONS");
  expect(r.status).toBe(204);
  expect(r.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  expect(r.headers.get("access-control-allow-headers")).toContain("authorization");
  // unbekannte Pfade und Methoden
  for (const [m, p] of [["GET", "/daten"], ["GET", "/pair"], ["DELETE", "/kpis"], ["PUT", "/pair"]]) {
    r = await get(p, {}, m);
    expect(r.status, m + " " + p).toBe(404);
    clean(await r.text());
  }
});
