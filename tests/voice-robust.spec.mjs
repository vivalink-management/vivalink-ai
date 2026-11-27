// Sprachmodus: Fehlerfälle wie auf iPad/iPhone (nach dem Hänger in 2.11.0). Spracherkennung, Mikrofon, Aufnahme,
// Audioverarbeitung und Sprachausgabe sind steuerbare Attrappen; die KI-Gegenstelle läuft mit derselben Logik wie der
// Worker (server/ki-core.mjs) und einer Attrappe statt Workers AI. Nur künstliche Daten, kein echter Dienst, keine Kosten.
// Geprüft: nie endlose Wiederholungen, jede Phase mit Zeitgrenze, „Beenden“ jederzeit, App bleibt bedienbar, Daten bleiben.
import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { seed, state, ready } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";
import { handleKi } from "../server/ki-core.mjs";

const VID = "0123456789abcdef0123456789abcdef",
  TOK = "ab".repeat(32);
const sha = (s) => createHash("sha256").update(s).digest("hex");

// srMode: "ok" (hört, wartet auf Test), "sofortEnde" (endet direkt nach dem Start ohne Ergebnis, wie iOS in der
// installierten App), "fehler:<code>" (meldet Fehler und endet), "stumm" (meldet nie etwas), "aus" (nicht vorhanden)
const FAKES = (o) => {
  window.__sr = [];
  window.__said = [];
  window.__mr = [];
  window.__mic = { calls: 0, stops: 0 };
  window.__level = 0;
  window.__ctxClosed = 0;
  if (o.standalone) {
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148", configurable: true });
  }
  if (o.sr !== "aus") {
    class FakeSR {
      constructor() {
        window.__sr.push(this);
      }
      start() {
        this.started = true;
        const m = o.sr || "ok";
        if (m === "sofortEnde") setTimeout(() => this.onend && this.onend(), 10);
        if (m.startsWith("fehler:"))
          setTimeout(() => {
            this.onerror && this.onerror({ error: m.slice(7) });
            this.onend && this.onend();
          }, 10);
      }
      abort() {
        this.aborted = true;
      }
      stop() {
        this.aborted = true;
      }
      say(text) {
        this.onresult && this.onresult({ results: [Object.assign([{ transcript: text }], { isFinal: true })] });
      }
    }
    window.webkitSpeechRecognition = window.SpeechRecognition = FakeSR;
  } else {
    delete window.webkitSpeechRecognition;
    delete window.SpeechRecognition;
  }
  Object.defineProperty(window, "speechSynthesis", {
    value: {
      getVoices: () => [{ name: "Anna (Erweitert)", lang: "de-DE" }],
      speak(u) {
        if (u.text.trim()) window.__said.push(u.text);
        if (!(o.ttsHang && u.text.trim())) setTimeout(() => u.onend && u.onend(), 5); // iOS-Fehler: Ende wird nie gemeldet
      },
      cancel() {},
    },
    configurable: true,
  });
  window.SpeechSynthesisUtterance = function (t) {
    this.text = t;
  };
  // Mikrofon, Aufnahme, Audioverarbeitung
  const track = { stop: () => window.__mic.stops++ };
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      getUserMedia: () => {
        window.__mic.calls++;
        if (o.mic === "haengt") return new Promise(() => {});
        if (o.mic === "verweigert") return Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
        return Promise.resolve({ getTracks: () => [track] });
      },
    },
    configurable: true,
  });
  window.MediaRecorder = class {
    constructor() {
      this.mimeType = "audio/mp4";
      window.__mr.push(this);
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable && this.ondataavailable({ data: new Blob([new Uint8Array(4000)], { type: "audio/mp4" }) });
      setTimeout(() => this.onstop && this.onstop(), 5);
    }
  };
  window.AudioContext = window.webkitAudioContext = class {
    constructor() {
      this.state = o.ctx || "running";
    }
    resume() {
      return Promise.resolve();
    }
    close() {
      window.__ctxClosed++;
      return Promise.resolve();
    }
    createAnalyser() {
      return { fftSize: 256, getByteTimeDomainData: (b) => b.fill(128 + window.__level) };
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    }
  };
};

/* KI-Gegenstelle im Browser abgefangen: Spracherkennung und Chat nach Drehbuch des Tests */
async function setup(page, o = {}) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const store = { m: new Map(), get: async (k) => (store.m.has(k) ? JSON.parse(store.m.get(k)) : null), put: async (k, v) => void store.m.set(k, JSON.stringify(v)), del: async (k) => void store.m.delete(k) };
  await store.put("v:" + VID, { th: sha(TOK), version: 1 });
  const calls = { stt: 0, chat: 0 };
  const ki = { stt: o.stt || (() => ({ text: "Welche Aufgaben sind offen?" })), chat: o.chat || (() => ({ response: "Offen ist eine künstliche Testaufgabe." })) };
  await page.addInitScript(() => (window.VL_KI_URL = "http://127.0.0.1:4173/ki-test"));
  await page.route("**/ki-test/**", async (route) => {
    const r = route.request();
    const path = new URL(r.url()).pathname.replace("/ki-test", "");
    const kind = path.endsWith("/stt") ? "stt" : "chat";
    calls[kind]++;
    const plan = await ki[kind](calls[kind]);
    if (plan === "haengt") return; // Antwort kommt nie (Verbindungsproblem)
    if (plan && plan.status) return route.fulfill({ status: plan.status, body: JSON.stringify({ error: "unavailable" }) });
    const ai = { run: async () => plan };
    const out = await handleKi({ method: r.method(), path, auth: await r.headerValue("authorization"), body: r.postData() }, { ai, store });
    await route.fulfill({ status: out.status, headers: out.headers, body: out.body });
  });
  await page.addInitScript(FAKES, o);
  await page.clock.setFixedTime(new Date("2026-03-10T09:00:00"));
  await seed(page, { state: v2State(), "sync-config": { vid: VID, token: TOK, mk: "x", kv: 1, version: 1, devices: {} }, "ki-config": { on: o.ki !== false, freigaben: { aufgaben: true } } });
  // verkürzte Zeitgrenzen (gleiche Logik, schnellere Tests)
  await page.evaluate((t) => Object.assign(VO_T, { idle: 4000, think: 3000, stt: 1500, mic: 1000, recMax: 1500, ttsBase: 300, ttsPerChar: 0, silence: 400, ...t }), o.T || {});
  await page.evaluate((t) => Object.assign(KI_T, t), o.KI || {});
  await page.click('nav button[data-id="ai"]');
  return { calls, errors };
}
const on = (page) => page.evaluate(() => VO.on);
/* Bedienbarkeit: Hauptthread reagiert (kein Einfrieren), Navigation funktioniert */
async function responsive(page) {
  const lag = await page.evaluate(
    () =>
      new Promise((ok) => {
        let max = 0,
          last = performance.now(),
          n = 0;
        const iv = setInterval(() => {
          const t = performance.now();
          max = Math.max(max, t - last - 50);
          last = t;
          if (++n >= 10) clearInterval(iv), ok(max);
        }, 50);
      }),
  );
  expect(lag, "Hauptthread blockiert").toBeLessThan(250);
  await page.click('nav button[data-id="tasks"]');
  await expect(page.locator('nav button[data-id="tasks"]')).toHaveClass(/on|active|sel/);
  await page.click('nav button[data-id="ai"]');
}

test("Geräte-Erkennung endet sofort wieder (iOS, installierte App): höchstens drei Versuche, dann Ende mit Hinweis; „Beenden“ bleibt dasselbe Element", async ({ page }) => {
  const { errors } = await setup(page, { sr: "sofortEnde", ki: false });
  await page.click('button[data-a="voiceStart"]');
  await expect(page.locator('#voicebar [data-a="voiceStop"]')).toBeVisible();
  await page.evaluate(() => (document.querySelector('#voicebar [data-a="voiceStop"]').dataset.probe = "1"));
  await expect.poll(() => on(page), { timeout: 8000 }).toBe(false);
  expect(await page.evaluate(() => window.__sr.length)).toBe(3); // vorher: rund vier Neustarts pro Sekunde, ohne Ende
  await expect(page.locator("#toast")).toContainText("Spracherkennung reagiert nicht");
  await expect(page.locator("#toast")).toContainText("Diktat der Tastatur");
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__sr.length)).toBe(3); // danach nichts mehr
  await responsive(page);
  expect(errors).toEqual([]);
  // gleiche Prüfung: Anzeige ersetzt den Knopf nicht (Fingertipp ginge sonst verloren)
  await page.click('button[data-a="voiceStart"]');
  await expect(page.locator('#voicebar [data-a="voiceStop"]')).toBeVisible();
  await page.evaluate(() => (document.querySelector('#voicebar [data-a="voiceStop"]').dataset.probe = "2"));
  await page.waitForTimeout(400);
  if (await on(page)) await expect(page.locator('#voicebar [data-probe="2"]')).toHaveCount(1);
});

for (const err of ["aborted", "audio-capture", "network"]) {
  test(`Geräte-Erkennung meldet wiederholt „${err}“: begrenzt, keine Endlosschleife`, async ({ page }, info) => {
    test.skip(info.project.name.includes("iphone") && err !== "aborted", "einmal je Fehlerart genügt");
    await setup(page, { sr: "fehler:" + err, ki: false });
    await page.click('button[data-a="voiceStart"]');
    await expect.poll(() => on(page), { timeout: 8000 }).toBe(false);
    expect(await page.evaluate(() => window.__sr.length)).toBeLessThanOrEqual(3);
    await expect(page.locator("#toast")).toContainText("(" + err + ")");
  });
}

test("Geräte-Erkennung gestört, KI freigegeben: einmaliger Wechsel zur Server-Erkennung, Gespräch läuft weiter", async ({ page }) => {
  const { calls, errors } = await setup(page, { sr: "sofortEnde" });
  await page.click('button[data-a="voiceStart"]');
  await expect(page.locator("#voicebar")).toContainText("Server-Erkennung", { timeout: 8000 });
  expect(await page.evaluate(() => window.__sr.length)).toBe(3);
  // sprechen (Pegel hoch), dann Pause → Aufnahme wird erkannt und beantwortet
  await page.waitForTimeout(500);
  await page.evaluate(() => (window.__level = 40));
  await page.waitForTimeout(300);
  await page.evaluate(() => (window.__level = 0));
  await expect.poll(() => page.evaluate(() => S.chatMsgs.length), { timeout: 8000 }).toBe(2);
  expect(calls.stt).toBe(1);
  const s = await state(page);
  expect(s.chatMsgs.map((m) => [m.role, m.via])).toEqual([["user", "voice"], ["assistant", "voice"]]);
  expect(s.chatMsgs[0].text).toBe("Welche Aufgaben sind offen?");
  await expect.poll(() => page.evaluate(() => window.__said.length)).toBeGreaterThan(0);
  await expect(page.locator("#voicebar")).toContainText("ich höre zu"); // danach wieder zuhören
  expect(await page.evaluate(() => window.__sr.length)).toBe(3); // Geräte-Erkennung nicht erneut gestartet
  await page.click('#voicebar button[data-a="voiceStop"]');
  expect(await page.evaluate(() => window.__mic.stops)).toBeGreaterThan(0); // Mikrofon freigegeben
  expect(errors).toEqual([]);
});

test("Installierte App auf dem iPad mit freigegebener KI: Server-Erkennung wird bevorzugt", async ({ page }) => {
  await setup(page, { sr: "ok", standalone: true });
  await page.click('button[data-a="voiceStart"]');
  await expect(page.locator("#voicebar")).toContainText("Server-Erkennung");
  expect(await page.evaluate(() => window.__sr.length)).toBe(0);
  const log = await page.evaluate(() => ACTIONS.filter((a) => a.name === "voice.start").map((a) => a.detail));
  expect(log).toEqual(["server"]);
});

test("Server-Erkennung hängt (Zeitüberschreitung): ein Wiederholversuch, dann Ende; „Beenden“ und Navigation funktionieren währenddessen", async ({ page }) => {
  const { calls, errors } = await setup(page, { sr: "aus", stt: () => "haengt" });
  await page.click('button[data-a="voiceStart"]');
  await expect(page.locator("#voicebar")).toContainText("Server-Erkennung");
  for (let i = 0; i < 2; i++) {
    await expect(page.locator("#voicebar")).toContainText("ich höre zu", { timeout: 5000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => (window.__level = 40));
    await page.waitForTimeout(300);
    await page.evaluate(() => (window.__level = 0));
    await expect(page.locator("#voicebar")).toContainText("denke nach", { timeout: 5000 });
    if (i === 0) await responsive(page); // während des Wartens bedienbar
  }
  await expect.poll(() => on(page), { timeout: 6000 }).toBe(false);
  expect(calls.stt).toBe(2);
  await expect(page.locator("#toast")).toContainText("Spracherkennung über den Server gestört");
  expect(await page.evaluate(() => window.__mic.stops)).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  expect(calls.stt).toBe(2); // keine weiteren Versuche
  await responsive(page);
  expect(errors).toEqual([]);
});

test("Server-Erkennung meldet Fehler bzw. versteht nichts: begrenzt wiederholt; „Beenden“ während des Wartens wirkt sofort", async ({ page }) => {
  const { calls } = await setup(page, { sr: "aus", stt: (n) => (n <= 3 ? { text: "" } : "haengt") });
  await page.click('button[data-a="voiceStart"]');
  const talk = async () => {
    await expect(page.locator("#voicebar")).toContainText("ich höre zu", { timeout: 5000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => (window.__level = 40));
    await page.waitForTimeout(300);
    await page.evaluate(() => (window.__level = 0));
  };
  for (let i = 0; i < 3; i++) {
    await talk();
    await expect.poll(() => calls.stt, { timeout: 5000 }).toBe(i + 1);
  }
  await expect.poll(() => on(page), { timeout: 5000 }).toBe(false);
  await expect(page.locator("#toast")).toContainText("nichts verstanden");
  expect(calls.stt).toBe(3);
  // neu starten; diesmal hängt die Erkennung → während „denke nach“ sofort beenden
  await page.click('button[data-a="voiceStart"]');
  await talk();
  await expect(page.locator("#voicebar")).toContainText("denke nach", { timeout: 5000 });
  await page.click('#voicebar button[data-a="voiceStop"]');
  await expect(page.locator("#voicebar")).toHaveCount(0);
  expect(await on(page)).toBe(false);
  await page.waitForTimeout(2500); // später eintreffende Ergebnisse/Zeitgrenzen bewirken nichts mehr
  await expect(page.locator("#voicebar")).toHaveCount(0);
  expect(await page.evaluate(() => S.chatMsgs.length)).toBe(0);
});

test("Ohne Pegelmessung (iOS: Audio nicht freigegeben): „Fertig gesprochen“ beendet die Aufnahme; Höchstdauer greift ebenfalls", async ({ page }) => {
  const { calls } = await setup(page, { sr: "aus", ctx: "suspended", T: { recMax: 2500 } });
  await page.click('button[data-a="voiceStart"]');
  await expect(page.locator('#voicebar button[data-a="voiceDone"]')).toBeVisible();
  await page.click('#voicebar button[data-a="voiceDone"]');
  await expect.poll(() => page.evaluate(() => S.chatMsgs.length), { timeout: 6000 }).toBe(2);
  expect(calls.stt).toBe(1);
  // ohne Tippen: nach der Höchstdauer wird die Aufnahme trotzdem erkannt (nie endlos aufnehmen)
  await expect(page.locator("#voicebar")).toContainText("ich höre zu", { timeout: 5000 });
  await expect.poll(() => calls.stt, { timeout: 6000 }).toBe(2);
  await page.click('#voicebar button[data-a="voiceStop"]');
});

test("Stilles Mikrofon: Aufnahmen werden nicht gesendet, nach der Stille-Zeitgrenze Ende – keine Kosten", async ({ page }) => {
  const { calls } = await setup(page, { sr: "aus", T: { recMax: 700, idle: 2500 } });
  await page.click('button[data-a="voiceStart"]');
  await expect.poll(() => on(page), { timeout: 8000 }).toBe(false);
  await expect(page.locator("#toast")).toContainText("keine Eingabe");
  expect(calls.stt).toBe(0);
  const n = await page.evaluate(() => window.__mr.length);
  expect(n).toBeGreaterThan(1);
  expect(n).toBeLessThan(8); // begrenzt durch die Stille-Zeitgrenze
});

test("Mikrofon antwortet nicht bzw. wird verweigert: Ende mit Hinweis, App bedienbar", async ({ page }) => {
  await setup(page, { sr: "aus", mic: "haengt" });
  await page.click('button[data-a="voiceStart"]');
  await expect.poll(() => on(page), { timeout: 5000 }).toBe(false);
  await expect(page.locator("#toast")).toContainText("Mikrofon antwortet nicht");
  await responsive(page);
});

test("Antwort der KI hängt: App bleibt bedienbar, Sprachmodus endet nach der Zeitgrenze, Antwort erscheint trotzdem im Chat; Daten bleiben erhalten", async ({ page }) => {
  const { calls, errors } = await setup(page, { sr: "ok", chat: () => "haengt", KI: { call: 2000, total: 2500 }, T: { think: 1500 } });
  const before = await state(page);
  await page.click('button[data-a="voiceStart"]');
  await expect.poll(() => page.evaluate(() => window.__sr.length)).toBe(1);
  await page.evaluate(() => window.__sr[0].say("Wie entwickelt sich Vivalink aktuell?"));
  await expect(page.locator("#voicebar")).toContainText("denke nach");
  await responsive(page);
  await expect.poll(() => on(page), { timeout: 5000 }).toBe(false);
  await expect(page.locator("#toast")).toContainText("Antwort dauert zu lange");
  // die KI-Zeitgrenze greift: lokale Antwort mit Hinweis, Senden wieder möglich
  await expect.poll(() => page.evaluate(() => S.chatMsgs.length), { timeout: 6000 }).toBe(2);
  await expect(page.locator(".msg.ai .bub").last()).toContainText("Zeitüberschreitung");
  await expect(page.locator('button[data-a="chatSend"]')).toBeEnabled();
  expect(calls.chat).toBe(1);
  // Neustart der App: Chat und Unternehmensdaten unverändert erhalten
  await page.reload();
  await ready(page);
  const s = await state(page);
  for (const k of ["tasks", "memory", "metrics", "meetup"]) expect(s[k], k).toEqual(before[k]);
  expect(s.chatMsgs.map((m) => m.via)).toEqual(["voice", "voice"]);
  expect(errors).toEqual([]);
});

test("Sprachausgabe meldet kein Ende (iOS-Fehler): Vorlesen bricht nach zwei Sätzen ab, App hört wieder zu; Beenden jederzeit", async ({ page }) => {
  await setup(page, { sr: "ok", ki: false, ttsHang: true });
  await page.click('button[data-a="voiceStart"]');
  await expect.poll(() => page.evaluate(() => window.__sr.length)).toBe(1);
  await page.evaluate(() => window.__sr[0].say("Welche Aufgaben sind offen?"));
  await expect(page.locator("#voicebar")).toContainText("ich spreche", { timeout: 5000 });
  await expect(page.locator("#toast")).toContainText("Vorlesen reagiert nicht", { timeout: 5000 });
  expect(await page.evaluate(() => window.__said.length)).toBe(2);
  await expect(page.locator("#voicebar")).toContainText("ich höre zu");
  await page.click('#voicebar button[data-a="voiceStop"]');
  await expect(page.locator("#voicebar")).toHaveCount(0);
});

test("Doppeltes Tippen auf „Sprechen“ startet nur eine Sitzung; Beenden während des Starts wirkt", async ({ page }) => {
  await setup(page, { sr: "ok", ki: false });
  await page.evaluate(() => (voiceStart(), voiceStart()));
  await expect.poll(() => page.evaluate(() => window.__sr.length)).toBe(1);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__sr.length)).toBe(1);
  await page.evaluate(() => voiceStop());
  await page.evaluate(() => (voiceStart(), voiceStop()));
  await page.waitForTimeout(500);
  expect(await on(page)).toBe(false);
  await expect(page.locator("#voicebar")).toHaveCount(0);
  expect(await page.evaluate(() => window.__sr.length)).toBe(1); // abgebrochener Start öffnet kein Mikrofon
});
