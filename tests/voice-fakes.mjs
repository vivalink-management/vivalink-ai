// Gemeinsame Nachbildungen für Sprachmodus- und Chat-Tests (nur künstliche Daten, kein echter Dienst, keine Kosten).
// Spracherkennung, Mikrofon, Aufnahme, Audioverarbeitung, Sprachausgabe und Bildschirmsperre sind steuerbare Attrappen.
// Die Sprachausgabe bildet dokumentiertes iOS-Verhalten nach (WebKit-Fehlerberichte 218815, 238189 und Entwicklerberichte):
//  - Solange eine Mikrofonaufnahme läuft (getUserMedia-Spur aktiv) oder die Geräte-Spracherkennung gerade erst beendet
//    wurde (< 300 ms), ist die Ausgabe auf iPhone/iPad praktisch nicht hörbar („heard: false“).
//  - Unmittelbar nach cancel() (< 250 ms) gesprochene Sätze bleiben stumm.
// Ob das echte Gerät sich genau so verhält, lässt sich nur auf dem Gerät prüfen – die Nachbildung macht die Fehlerart prüfbar.
import { expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { seed } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";
import { handleKi } from "../server/ki-core.mjs";

export const VID = "0123456789abcdef0123456789abcdef",
  TOK = "ab".repeat(32);
const sha = (s) => createHash("sha256").update(s).digest("hex");

export const FAKES = (o) => {
  const now = () => performance.now();
  window.__sr = [];
  window.__said = [];
  window.__mr = [];
  window.__mic = { calls: 0, stops: 0, live: 0 };
  window.__level = 0;
  window.__wl = { req: 0, rel: 0, active: 0 };
  window.__srEnd = -1e9;
  window.__cancelAt = -1e9;
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
        this.live = true;
        const m = o.sr || "ok";
        if (m === "sofortEnde") setTimeout(() => this.end(), 10);
        if (m.startsWith("fehler:"))
          setTimeout(() => {
            this.onerror && this.onerror({ error: m.slice(7) });
            this.end();
          }, 10);
      }
      end() {
        if (this.live) (this.live = false), (window.__srEnd = now());
        this.onend && this.onend();
      }
      abort() {
        this.aborted = true;
        if (this.live) (this.live = false), (window.__srEnd = now());
      }
      stop() {
        this.abort();
      }
      say(text, final = true) {
        this.onresult && this.onresult({ results: [Object.assign([{ transcript: text }], { isFinal: final })] });
      }
    }
    window.webkitSpeechRecognition = window.SpeechRecognition = FakeSR;
  } else {
    delete window.webkitSpeechRecognition;
    delete window.SpeechRecognition;
  }
  const pending = [];
  // iOS-Modell (o.tts = "ios" bzw. "ios-streng"), abgeleitet aus WebKit-Berichten und dem Protokoll des Gründers:
  //  - Sprachausgabe braucht eine Bedienung (Tippen) zum Freischalten; ein leerer Satz („ “) schaltet NICHT frei und
  //    bleibt hängen (speaking = true, keine Ereignisse, kein Ton).
  //  - Solange etwas hängt oder nicht freigeschaltet ist, landen neue Sätze stumm in der Warteschlange (speaking/pending
  //    = true, kein onstart/onend) – bis cancel() die Warteschlange leert.
  //  - „ios-streng“: JEDER Satz braucht eine Bedienung in der letzten Sekunde.
  window.__act = -1e9;
  for (const ev of ["pointerdown", "pointerup", "click", "touchend", "keydown"]) addEventListener(ev, () => (window.__act = now()), true);
  let unlocked = false,
    stuck = [];
  const iosMode = () => (window.__ttsMode || o.tts || "").startsWith("ios");
  const tts = {
    pending: false,
    speaking: false,
    paused: false,
    getVoices: () => [{ name: "Anna (Erweitert)", lang: "de-DE" }],
    speak(u) {
      const t = now();
      if (iosMode()) {
        const active = t - window.__act < 1000;
        const strict = (window.__ttsMode || o.tts) === "ios-streng";
        if (!u.text.trim()) {
          stuck.push(u); // leerer Satz: hängt
          tts.speaking = true;
          return;
        }
        if (stuck.length || !(active || (unlocked && !strict))) {
          stuck.push(u); // stumm in der Warteschlange
          tts.speaking = tts.pending = true;
          window.__said.push({ text: u.text, heard: false, blocked: true });
          return;
        }
        if (active) unlocked = true;
      } else if (!u.text.trim()) return;
      const srLive = window.__sr.some((r) => r.live);
      const heard = !(window.__mic.live > 0 || srLive || t - window.__srEnd < 300 || t - window.__cancelAt < 250);
      window.__said.push({ text: u.text, heard });
      const mode = window.__ttsMode || o.tts || "ok";
      if (mode === "stumm" || !heard) {
        // iOS: kein Ton – und oft auch keine Ereignisse
        if (mode === "stumm") return;
      }
      tts.speaking = true;
      setTimeout(() => u.onstart && u.onstart(), 5);
      if (mode === "keinEnde") return;
      if (window.__holdTts) return pending.push(u);
      setTimeout(() => ((tts.speaking = false), u.onend && u.onend()), 20 + Math.min(400, u.text.length * 2));
    },
    cancel() {
      window.__cancelAt = now();
      tts.speaking = false;
      tts.pending = false;
      stuck = [];
      while (pending.length) {
        const u = pending.shift();
        u.onend && u.onend();
      }
    },
    resume() {
      tts.paused = false;
    },
    pause() {},
  };
  Object.defineProperty(window, "speechSynthesis", { value: tts, configurable: true });
  window.SpeechSynthesisUtterance = function (t) {
    this.text = t;
  };
  // Bildschirmsperre verhindern (Screen Wake Lock)
  if (o.wakeLock !== false)
    Object.defineProperty(navigator, "wakeLock", {
      value: {
        request: async () => {
          window.__wl.req++;
          window.__wl.active++;
          const s = {
            released: false,
            onrelease: null,
            async release() {
              if (s.released) return;
              s.released = true;
              window.__wl.rel++;
              window.__wl.active--;
            },
          };
          return s;
        },
      },
      configurable: true,
    });
  // Mikrofon, Aufnahme, Audioverarbeitung
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      getUserMedia: () => {
        window.__mic.calls++;
        if (o.mic === "haengt") return new Promise(() => {});
        if (o.mic === "verweigert") return Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
        window.__mic.live++;
        let live = true;
        const track = {
          stop: () => {
            if (live) (live = false), window.__mic.live--, window.__mic.stops++;
          },
          get readyState() {
            return live ? "live" : "ended";
          },
        };
        return Promise.resolve({ getTracks: () => [track], getAudioTracks: () => [track] });
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

/* App mit KI-Gegenstelle (Logik des Workers, Attrappe statt Workers AI). o.stt(n, body) / o.chat(n, body, input):
   Rückgabe = Antwort des Modells, "haengt" (keine Antwort) oder {status} (Fehler). */
export async function setupVoice(page, o = {}) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const store = { m: new Map(), get: async (k) => (store.m.has(k) ? JSON.parse(store.m.get(k)) : null), put: async (k, v) => void store.m.set(k, JSON.stringify(v)), del: async (k) => void store.m.delete(k) };
  await store.put("v:" + VID, { th: sha(TOK), version: 1 });
  const calls = { stt: 0, chat: 0, bodies: [], inputs: [] };
  const ki = { stt: o.stt || (() => ({ text: "Welche Aufgaben sind offen?" })), chat: o.chat || (() => ({ response: "Offen ist eine künstliche Testaufgabe. Sie ist überfällig." })) };
  await page.addInitScript(() => (window.VL_KI_URL = "http://127.0.0.1:4173/ki-test"));
  await page.route("**/ki-test/**", async (route) => {
    const r = route.request();
    const path = new URL(r.url()).pathname.replace("/ki-test", "");
    const kind = path.endsWith("/stt") ? "stt" : "chat";
    calls[kind]++;
    const body = JSON.parse(r.postData() || "{}");
    if (kind === "chat") calls.bodies.push(body);
    let plan = null;
    const ai = {
      run: async (_m, input) => {
        if (kind === "chat") calls.inputs.push(input);
        return plan;
      },
    };
    plan = await ki[kind](calls[kind], body);
    if (plan === "haengt") return;
    if (plan && plan.status) return route.fulfill({ status: plan.status, body: JSON.stringify({ error: "unavailable" }) });
    if (typeof plan === "function") {
      const f = plan;
      ai.run = async (_m, input) => (calls.inputs.push(input), f(input));
    }
    const out = await handleKi({ method: r.method(), path, auth: await r.headerValue("authorization"), body: r.postData() }, { ai, store });
    await route.fulfill({ status: out.status, headers: out.headers, body: out.body });
  });
  await page.addInitScript(FAKES, o);
  await page.clock.setFixedTime(new Date("2026-03-10T09:00:00"));
  await seed(page, { state: o.state || v2State(), "sync-config": { vid: VID, token: TOK, mk: "x", kv: 1, version: 1, devices: {} }, "ki-config": { on: o.ki !== false, freigaben: o.freigaben || { aufgaben: true, kennzahlen: true } } });
  // verkürzte Zeitgrenzen (gleiche Logik, schnellere Tests); nur bekannte Felder
  await page.evaluate((t) => {
    if (typeof VO_T === "undefined") return;
    const base = { idle: 4000, think: 3000, stt: 1500, mic: 1000, recMax: 1500, ttsBase: 300, ttsPerChar: 0, silence: 400, ttsStart: 400, idleWarn: 1500 };
    for (const [k, v] of Object.entries({ ...base, ...t })) if (k in VO_T) VO_T[k] = v;
  }, o.T || {});
  await page.evaluate((t) => typeof KI_T !== "undefined" && Object.assign(KI_T, t), o.KI || {});
  await page.click('nav button[data-id="ai"]');
  return { calls, errors, store };
}
/* Sprechen in der Server-Erkennung: Grundrauschen messen lassen, Pegel hoch, dann Pause */
export async function talk(page) {
  await expect(page.locator("#voicebar")).toContainText("ich höre zu", { timeout: 6000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => (window.__level = 40));
  await page.waitForTimeout(300);
  await page.evaluate(() => (window.__level = 0));
}
export const voiceOn = (page) => page.evaluate(() => VO.on);
export const msgCount = (page) => page.evaluate(() => S.chatMsgs.length);
export const heardCount = (page) => page.evaluate(() => window.__said.filter((x) => x.heard).length);
