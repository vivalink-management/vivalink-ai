// KI-Gegenstelle (vorbereitet, nicht bereitgestellt) und App-Anbindung – mit einer Attrappe statt Workers AI.
// Prüft Zugang nur für gekoppelte Geräte, Tagesbudget unter dem kostenlosen Kontingent, Grenzen, Datenfreigaben,
// Ausweichen auf den lokalen Assistenten. Nichts wird an einen echten KI-Dienst gesendet.
import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { handleKi, BUDGET, KI_MODEL, KI_MODELS, STT_MODEL, estimateChat } from "../server/ki-core.mjs";
import { seed, state } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";

const VID = "0123456789abcdef0123456789abcdef",
  TOK = "ab".repeat(32);
const sha = (s) => createHash("sha256").update(s).digest("hex");
function memStore() {
  const m = new Map();
  return { m, get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), put: async (k, o) => void m.set(k, JSON.stringify(o)), del: async (k) => void m.delete(k) };
}
function fakeAi(script) {
  const calls = [];
  return {
    calls,
    async run(model, input) {
      calls.push({ model, input: JSON.parse(JSON.stringify(input)) });
      const s = script.shift();
      if (s instanceof Error) throw s;
      return typeof s === "function" ? s(input) : s;
    },
  };
}
const req = (body, auth = "Bearer " + TOK, path = "/v1/ki/chat") => ({ method: "POST", path, auth, body: JSON.stringify(body) });
const msgs = [{ role: "user", content: "Wie läuft Vivalink?" }];

test("Gegenstelle: nur gekoppelte Geräte, Budget unter dem kostenlosen Kontingent, Grenzen, keine Inhalte gespeichert", async ({}, info) => {
  test.skip(info.project.name !== "chromium-desktop", "Serverlogik einmal prüfen");
  const store = memStore();
  await store.put("v:" + VID, { th: sha(TOK), version: 3 });
  let ai = fakeAi([{ response: "Hallo", usage: { prompt_tokens: 1000, completion_tokens: 100 } }]);
  // ohne/mit falschem Zugang, gesperrter Tresor, falscher Pfad
  for (const [r, st] of [
    [req({ vault: VID, messages: msgs }, ""), 401],
    [req({ vault: VID, messages: msgs }, "Bearer " + "cd".repeat(32)), 401],
    [req({ vault: "x", messages: msgs }), 401],
    [{ ...req({ vault: VID, messages: msgs }), path: "/v1/vault/" + VID }, 404],
    [{ ...req({ vault: VID, messages: msgs }), method: "GET" }, 404],
  ])
    expect((await handleKi(r, { ai, store })).status).toBe(st);
  expect(ai.calls.length).toBe(0);
  // gültig
  let r = await handleKi(req({ vault: VID, messages: msgs, tools: [] }), { ai, store });
  expect(r.status).toBe(200);
  const j = JSON.parse(r.body);
  expect(j.text).toBe("Hallo");
  expect(j.usage.neurons).toBe(Math.ceil(1000 * 0.026668 + 100 * 0.204805));
  expect(ai.calls[0]).toMatchObject({ model: KI_MODEL, input: { max_tokens: 800, temperature: 0.3 } });
  // gespeichert werden nur Zähler – keine Inhalte
  expect([...store.m.keys()].filter((k) => !k.startsWith("v:")).every((k) => /^ki:(tag|std):/.test(k))).toBe(true);
  expect([...store.m.values()].join("")).not.toContain("Vivalink");
  // Tagesbudget: Anfrage, die das Budget überschreiten würde, wird VOR dem Aufruf abgelehnt
  const day = new Date().toISOString().slice(0, 10);
  await store.put("ki:tag:" + day, { neurons: BUDGET - 50 });
  ai = fakeAi([{ response: "sollte nicht kommen" }]);
  r = await handleKi(req({ vault: VID, messages: msgs }), { ai, store });
  expect([r.status, JSON.parse(r.body).error]).toEqual([429, "budget"]);
  expect(ai.calls.length).toBe(0);
  expect(BUDGET).toBeLessThan(10000);
  await store.put("ki:tag:" + day, { neurons: 0 });
  // Grenzen: zu viele/zu lange Nachrichten, falsche Rollen, unpassende Werkzeuge, zu großer Körper
  for (const b of [{ messages: Array(41).fill(msgs[0]) }, { messages: [{ role: "user", content: "x".repeat(8001) }] }, { messages: [{ role: "admin", content: "x" }] }, { messages: msgs, tools: [{ type: "function", function: { name: "Böse Funktion!" } }].concat(Array(25).fill({})) }])
    expect((await handleKi(req({ vault: VID, ...b }), { ai, store })).status, JSON.stringify(b).slice(0, 60)).toBe(400);
  expect((await handleKi({ ...req({ vault: VID, messages: msgs }), body: "x".repeat(3_000_001) }, { ai, store })).status).toBe(413);
  // Fehler des KI-Dienstes → 503 ohne Einzelheiten
  ai = fakeAi([new Error("interner Fehler mit Geheimnis xyz")]);
  r = await handleKi(req({ vault: VID, messages: msgs }), { ai, store });
  expect([r.status, r.body]).toEqual([503, '{"error":"unavailable"}']);
  // Werkzeugaufrufe als Zeichenkette werden sicher gelesen
  ai = fakeAi([{ response: "", tool_calls: [{ name: "kennzahlen", arguments: "{}" }, { name: "x", arguments: "kaputt{" }] }]);
  r = await handleKi(req({ vault: VID, messages: msgs }), { ai, store });
  expect(JSON.parse(r.body).tool_calls).toEqual([{ name: "kennzahlen", arguments: {} }, { name: "x", arguments: {} }]);
  // Gerätelimit je Stunde
  const hk = [...store.m.keys()].find((k) => k.startsWith("ki:std:"));
  await store.put(hk, { n: 120 });
  expect((await handleKi(req({ vault: VID, messages: msgs }), { ai: fakeAi([{ response: "x" }]), store })).status).toBe(429);
  // Spracherkennung
  await store.put(hk, { n: 0 });
  ai = fakeAi([{ text: "Wie läuft Vivalink" }]);
  r = await handleKi(req({ vault: VID, audio: Buffer.from("x".repeat(3000)).toString("base64"), type: "audio/mp4" }, undefined, "/v1/ki/stt"), { ai, store });
  expect([r.status, JSON.parse(r.body).text]).toEqual([200, "Wie läuft Vivalink"]);
  expect(ai.calls[0]).toMatchObject({ model: STT_MODEL, input: { language: "de" } });
  expect((await handleKi(req({ vault: VID, audio: "<script>" }, undefined, "/v1/ki/stt"), { ai, store })).status).toBe(400);
});

test("App mit KI-Modell (Attrappe): Werkzeuge liefern nur freigegebene Daten, vertrauliches nie, Aufträge bleiben unter der Freigabelogik, Ausweichen auf lokal", async ({ page }) => {
  const store = memStore();
  await store.put("v:" + VID, { th: sha(TOK), version: 1 });
  const sent = [];
  let ai;
  await page.addInitScript(() => (window.VL_KI_URL = "http://127.0.0.1:4173/ki-test"));
  await page.route("**/ki-test/**", async (route) => {
    const r = route.request();
    sent.push(r.postData());
    const out = await handleKi({ method: r.method(), path: new URL(r.url()).pathname.replace("/ki-test", ""), auth: await r.headerValue("authorization"), body: r.postData() }, { ai, store });
    await route.fulfill({ status: out.status, headers: out.headers, body: out.body });
  });
  await page.clock.setFixedTime(new Date("2026-03-10T09:00:00"));
  await seed(page, { state: v2State(), "sync-config": { vid: VID, token: TOK, mk: "x", kv: 1, version: 1, devices: {} }, "ki-config": { on: true, freigaben: { kennzahlen: true } } });
  ai = fakeAi([
    { response: "", tool_calls: [{ name: "kennzahlen", arguments: {} }, { name: "gedaechtnis", arguments: { stichwort: "Testnotiz" } }, { name: "aufgabe_anlegen", arguments: { titel: "Einladungstext verbessern", frist: "2026-03-13" } }] },
    { response: "Die Registrierungen steigen leicht. Empfehlung: Einladungstext verbessern.", usage: { prompt_tokens: 800, completion_tokens: 60 } },
  ]);
  await page.click('nav button[data-id="ai"]');
  await expect(page.locator("#kiEngine")).toContainText("KI-Modell eingeschaltet");
  await page.click('button[data-a="chatNew"]');
  await page.fill("#chatIn", "Wie läuft Vivalink und was sollten wir tun?");
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => page.evaluate(() => S.chatMsgs.length)).toBe(2);
  await expect(page.locator(".msg.ai .bub").last()).toContainText("Die Registrierungen steigen leicht");
  await expect(page.locator(".msg.ai .bub").last()).toContainText("An die KI übermittelt: Kennzahlen und Befunde");
  // zweiter Aufruf enthält die Werkzeugergebnisse: Kennzahlen (freigegeben), Gedächtnis „nicht freigegeben“
  const second = JSON.parse(sent[1]);
  const tools = second.messages.filter((m) => m.role === "tool");
  expect(tools.find((t) => t.name === "kennzahlen").content).toContain("[Fakt] Neue Registrierungen pro Woche: 9");
  expect(tools.find((t) => t.name === "gedaechtnis").content).toBe("nicht freigegeben: Gedächtnis (ohne private Einträge)");
  expect(sent.join("")).not.toContain("kontakt@example.invalid"); // vertraulicher Eintrag nie übertragen
  expect(sent.join("")).not.toContain("Testnotiz\\u0000");
  // Auftrag aus der KI: Aufgabe mit Rückgängig angelegt (Stufe 1) – über dieselbe Freigabelogik
  const s = await state(page);
  expect(s.tasks.find((t) => t.title === "Einladungstext verbessern")).toMatchObject({ due: "2026-03-13", src: "chat" });
  expect(s.chatMsgs.at(-1).engine).toBe("ki");
  // Riskantes erreicht die KI gar nicht
  const n = sent.length;
  await page.fill("#chatIn", "Veröffentliche den Beitrag jetzt");
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => page.evaluate(() => S.chatMsgs.length)).toBe(4);
  expect(sent.length).toBe(n);
  // KI-Dienst gestört → Antwort vom lokalen Assistenten mit Hinweis
  ai = fakeAi([new Error("down")]);
  await page.fill("#chatIn", "Welche Aufgaben sind offen?");
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => page.evaluate(() => S.chatMsgs.length)).toBe(6);
  await expect(page.locator(".msg.ai .bub").last()).toContainText("KI nicht verfügbar");
  await expect(page.locator(".msg.ai .bub").last()).toContainText("Offene Aufgaben");
  // Tageskontingent erreicht → verständlicher Hinweis, lokale Antwort
  await store.put("ki:tag:" + new Date().toISOString().slice(0, 10), { neurons: BUDGET });
  ai = fakeAi([{ response: "x" }]);
  await page.fill("#chatIn", "Welche Aufgaben sind offen?");
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => page.evaluate(() => S.chatMsgs.length)).toBe(8);
  await expect(page.locator(".msg.ai .bub").last()).toContainText("Tageskontingent der kostenlosen KI erreicht");
  expect(ai.calls.length).toBe(0);
});

test("Gegenstelle: gleichzeitige Anfragen überschreiten das Budget nicht, Ausweichmodell bei außer Betrieb/kostenpflichtig, Fehlversuche begrenzt, Status ohne Daten", async ({}, info) => {
  test.skip(info.project.name !== "chromium-desktop", "Serverlogik einmal prüfen");
  const store = memStore();
  await store.put("v:" + VID, { th: sha(TOK), version: 1 });
  const day = new Date().toISOString().slice(0, 10);
  // 1) 30 gleichzeitige Anfragen kurz vor dem Budget: die Vorab-Buchung lässt nie mehr als das Budget zu
  await store.put("ki:tag:" + day, { neurons: BUDGET - 1500 });
  let n = 0;
  const slow = { run: async () => (n++, await new Promise((r) => setTimeout(r, 20)), { response: "ok" }) };
  const res = await Promise.all(Array.from({ length: 30 }, () => handleKi(req({ vault: VID, messages: msgs }), { ai: slow, store })));
  const ok = res.filter((r) => r.status === 200).length;
  expect(ok).toBe(n);
  expect(ok).toBeLessThan(30);
  expect((await store.get("ki:tag:" + day)).neurons).toBeLessThanOrEqual(BUDGET);
  await store.put("ki:tag:" + day, { neurons: 0 });
  // 2) erstes Modell außer Betrieb (410/5028) → zweites Modell; vorsichtige Schätzung für Modelle ohne bekannten Preis
  const calls = [];
  const ai = {
    run: async (m) => {
      calls.push(m);
      if (m === KI_MODELS[0]) throw new Error("AiError: model deprecated (5028) 410");
      return { response: "vom Ausweichmodell", usage: { prompt_tokens: 100, completion_tokens: 10 } };
    },
  };
  let r = await handleKi(req({ vault: VID, messages: msgs }), { ai, store });
  expect(JSON.parse(r.body)).toMatchObject({ text: "vom Ausweichmodell", model: KI_MODELS[1] });
  expect(calls).toEqual(KI_MODELS);
  expect(estimateChat(msgs, [], "@cf/unbekannt/modell")).toBeGreaterThan(estimateChat(msgs, [], KI_MODELS[0]));
  // anderer Fehler → kein Ausweichen, 503 ohne Einzelheiten
  const calls2 = [];
  r = await handleKi(req({ vault: VID, messages: msgs }), { ai: { run: async (m) => (calls2.push(m), Promise.reject(new Error("Netzwerk"))) }, store });
  expect([r.status, calls2.length]).toEqual([503, 1]);
  // alle Modelle nicht verfügbar → 503, Budget zurückgebucht
  const before = (await store.get("ki:tag:" + day)).neurons;
  r = await handleKi(req({ vault: VID, messages: msgs }), { ai: { run: async () => Promise.reject(new Error("403 (5035) requires Workers Paid")) }, store });
  expect(r.status).toBe(503);
  expect((await store.get("ki:tag:" + day)).neurons).toBe(before);
  // 3) Fehlversuche je Absender begrenzt (auch mit richtigem Zugang danach gesperrt, bis die Frist abläuft)
  for (let i = 0; i < 30; i++) await handleKi({ ...req({ vault: VID, messages: msgs }, "Bearer " + "cd".repeat(32)), client: "203.0.113.9" }, { ai, store });
  r = await handleKi({ ...req({ vault: VID, messages: msgs }), client: "203.0.113.9" }, { ai, store });
  expect(r.status).toBe(429);
  r = await handleKi({ ...req({ vault: VID, messages: msgs }), client: "198.51.100.7" }, { ai, store });
  expect(r.status).toBe(200); // anderer Absender nicht betroffen
  // 4) Status: ohne Zugang, ohne Daten, ohne KI-Aufruf
  const c0 = calls.length;
  r = await handleKi({ method: "GET", path: "/v1/ki/status" }, { ai, store });
  expect(JSON.parse(r.body)).toEqual({ ok: true, service: "vivalink-ki", budget: BUDGET });
  expect(calls.length).toBe(c0);
});

test("Datensparsam: frühere Antworten des lokalen Assistenten (mit App-Daten) gehen nicht an das KI-Modell", async ({ page }) => {
  const store = memStore();
  await store.put("v:" + VID, { th: sha(TOK), version: 1 });
  const sent = [];
  let kiOn = false;
  await page.addInitScript(() => (window.VL_KI_URL = "http://127.0.0.1:4173/ki-test"));
  await page.route("**/ki-test/**", async (route) => {
    const r = route.request();
    sent.push(r.postData());
    const out = await handleKi({ method: r.method(), path: new URL(r.url()).pathname.replace("/ki-test", ""), auth: await r.headerValue("authorization"), body: r.postData() }, { ai: { run: async () => ({ response: "KI-Antwort" }) }, store });
    await route.fulfill({ status: out.status, headers: out.headers, body: out.body });
  });
  await page.clock.setFixedTime(new Date("2026-03-10T09:00:00"));
  await seed(page, { state: v2State(), "sync-config": { vid: VID, token: TOK, mk: "x", kv: 1, version: 1, devices: {} }, "ki-config": { on: false, freigaben: {} } });
  // zuerst lokal (KI aus): Antwort enthält App-Daten
  await page.click('nav button[data-id="ai"]');
  await page.click('button[data-a="chatNew"]');
  await page.fill("#chatIn", "Was weißt du über Testentscheidung?");
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => page.evaluate(() => S.chatMsgs.length)).toBe(2);
  await expect(page.locator(".msg.ai .bub").last()).toContainText("Testentscheidung Gamma");
  // dann KI einschalten (ohne Datenfreigaben) und nachfragen
  await page.evaluate(() => kvPut("ki-config", { on: true, freigaben: {} }));
  await page.fill("#chatIn", "Und was bedeutet das?");
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => page.evaluate(() => S.chatMsgs.length)).toBe(4);
  const body = JSON.parse(sent[0]);
  const all = JSON.stringify(body.messages);
  expect(all).toContain("Was weißt du über Testentscheidung?"); // die eigene Frage
  expect(all).toContain("Antwort des lokalen Assistenten mit App-Daten – nicht übermittelt");
  expect(all).not.toContain("Gamma");
  expect(all).not.toContain("Testinhalt");
});
