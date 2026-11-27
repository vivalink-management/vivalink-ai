// Sprachmodus: derselbe Assistent und derselbe Chat wie beim Schreiben. Spracherkennung und Sprachausgabe des Geräts
// werden durch steuerbare Attrappen ersetzt (echte Mikrofone/Stimmen gibt es im Test nicht). Prüft Gesprächsschleife,
// Ende-Erkennung über die Sprechpause, Unterbrechen, Beenden, Anzeige, Fehler und Sicherheitsregeln.
import { test, expect } from "@playwright/test";
import { seed, state } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";

const FAKES = ({ sr }) => {
  window.__sr = [];
  window.__said = [];
  window.__cancel = 0;
  window.__holdTts = false;
  if (sr) {
    class FakeSR {
      constructor() {
        this.started = false;
        this.aborted = false;
        window.__sr.push(this);
      }
      start() {
        this.started = true;
      }
      abort() {
        this.aborted = true;
      }
      stop() {
        this.aborted = true;
      }
      // Test: Sprache „hören“ (Zwischenergebnis, dann endgültig)
      say(text, final = true) {
        this.onresult && this.onresult({ results: [Object.assign([{ transcript: text }], { isFinal: final })] });
      }
      fail(err) {
        this.onerror && this.onerror({ error: err });
      }
    }
    window.webkitSpeechRecognition = FakeSR;
    window.SpeechRecognition = FakeSR; // neuere Browser kennen auch den Namen ohne Präfix
  } else {
    delete window.webkitSpeechRecognition;
    delete window.SpeechRecognition;
  }
  const pending = [];
  const fakeTts = {
    getVoices: () => [{ name: "Anna (Erweitert)", lang: "de-DE" }, { name: "Markus", lang: "de-DE" }, { name: "Samantha", lang: "en-US" }],
    speak(u) {
      if (u.text.trim()) window.__said.push({ text: u.text, voice: u.voice && u.voice.name, rate: u.rate });
      if (window.__holdTts && u.text.trim()) pending.push(u);
      else setTimeout(() => u.onend && u.onend(), 5);
    },
    cancel() {
      window.__cancel++;
      while (pending.length) {
        const u = pending.shift();
        u.onend && u.onend();
      }
    },
  };
  Object.defineProperty(window, "speechSynthesis", { value: fakeTts, configurable: true }); // Eigenschaft ist im Browser schreibgeschützt
  window.SpeechSynthesisUtterance = function (t) {
    this.text = t;
  };
};
async function setup(page, opt = { sr: true }) {
  page.on("pageerror", (e) => console.log("SEITENFEHLER", e.message));
  await page.addInitScript(FAKES, opt);
  await page.clock.setFixedTime(new Date("2026-03-10T09:00:00"));
  await seed(page, { state: v2State() });
  await page.click('nav button[data-id="ai"]');
}
const srCount = (page) => page.evaluate(() => window.__sr.length);
const lastSr = (page) => page.evaluate(() => window.__sr.length - 1);
async function speakAndWait(page, text) {
  const i = await lastSr(page);
  const n = await page.evaluate(() => S.chatMsgs.length);
  await page.evaluate(([i, t]) => window.__sr[i].say(t), [i, text]);
  await expect.poll(() => page.evaluate(() => S.chatMsgs.length), { timeout: 8000 }).toBe(n + 2); // nach der Sprechpause beantwortet
}

test("Gesprächsschleife ohne Tastendruck: zuhören → Pause → Antwort im Chat → vorlesen → wieder zuhören; Wechsel zum Schreiben im selben Chat", async ({ page }) => {
  await setup(page);
  expect(await srCount(page)).toBe(0); // kein Mikrofon vor dem Start
  await expect(page.locator("#voicebar")).toHaveCount(0);
  await page.click('button[data-a="voiceStart"]');
  await expect(page.locator("#voicebar")).toContainText("Sprachmodus aktiv");
  await expect(page.locator("#voicebar")).toContainText("Mikrofon an – ich höre zu");
  expect(await page.evaluate(() => window.__sr[0].started && window.__sr[0].lang)).toBe("de-DE");
  // Zwischenergebnis wird angezeigt, aber noch nicht gesendet
  await page.evaluate(() => window.__sr[0].say("Wie entwickelt sich", false));
  await expect(page.locator("#voicebar .vb-i")).toContainText("Wie entwickelt sich");
  expect(await page.evaluate(() => S.chatMsgs.length)).toBe(0);
  await speakAndWait(page, "Wie entwickelt sich Vivalink aktuell?");
  let s = await state(page);
  const chat = s.chats.find((c) => !c.deleted);
  expect(s.chatMsgs.map((m) => [m.role, m.via])).toEqual([["user", "voice"], ["assistant", "voice"]]);
  // vorgelesen (bevorzugt eine erweiterte deutsche Stimme), danach hört die App wieder zu – ohne Tastendruck
  await expect.poll(() => page.evaluate(() => window.__said.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__said[0].voice)).toBe("Anna (Erweitert)");
  expect((await page.evaluate(() => window.__said.map((x) => x.text).join(" "))).length).toBeGreaterThan(20);
  await expect.poll(() => srCount(page)).toBe(2);
  await expect(page.locator("#voicebar")).toContainText("ich höre zu");
  // Rückfrage per Sprache: gleicher Chat, Kontext bleibt
  await speakAndWait(page, "Und welche Probleme gibt es?");
  // Wechsel zum Schreiben im selben Chat
  await page.click('button[data-a="voiceStop"]');
  await expect(page.locator("#voicebar")).toHaveCount(0);
  await page.fill("#chatIn", "Welche Maßnahmen würdest du jetzt empfehlen?");
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => page.evaluate(() => S.chatMsgs.length)).toBe(6);
  s = await state(page);
  expect(new Set(s.chatMsgs.map((m) => m.chat))).toEqual(new Set([chat.id]));
  expect(s.chatMsgs.map((m) => m.via)).toEqual(["voice", "voice", "voice", "voice", "text", "text"]);
  await expect(page.locator(".mmeta", { hasText: "gesprochen" })).toHaveCount(4);
});

test("Unterbrechen während der Antwort, Beenden gibt das Mikrofon frei, Hintergrund und Stille beenden automatisch", async ({ page }) => {
  await setup(page);
  await page.click('button[data-a="voiceStart"]');
  await expect.poll(() => srCount(page)).toBe(1);
  await page.evaluate(() => (window.__holdTts = true)); // Antwort „spricht“ bis zur Unterbrechung
  await page.evaluate(() => window.__sr[0].say("Analysiere die aktuellen Kennzahlen"));
  await expect(page.locator("#voicebar")).toContainText("Mikrofon aus – ich spreche");
  await page.click('#voicebar button[data-a="voiceInterrupt"]');
  await expect(page.locator("#voicebar")).toContainText("ich höre zu");
  expect(await page.evaluate(() => window.__cancel)).toBeGreaterThan(0);
  const n = await srCount(page);
  expect(await page.evaluate((i) => window.__sr[i].started && !window.__sr[i].aborted, n - 1)).toBe(true);
  // Beenden: Erkennung abgebrochen, Anzeige weg
  await page.click('#voicebar button[data-a="voiceStop"]');
  await expect(page.locator("#voicebar")).toHaveCount(0);
  expect(await page.evaluate((i) => window.__sr[i].aborted, n - 1)).toBe(true);
  // App in den Hintergrund → beendet
  await page.click('button[data-a="voiceStart"]');
  await expect(page.locator("#voicebar")).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("#voicebar")).toHaveCount(0);
  const log = await page.evaluate(() => ACTIONS.filter((a) => a.name.startsWith("voice.")).map((a) => a.name + ":" + (a.detail || "")));
  expect(log).toEqual(expect.arrayContaining(["voice.start:geraet", "voice.stop:beendet", "voice.stop:App im Hintergrund oder Bildschirm gesperrt"]));
});

test("Sicherheit per Sprache: nichts Riskantes, Gedächtnis nur nach Tippen; Mikrofon verweigert → Ende mit Hinweis", async ({ page }) => {
  await setup(page);
  await page.click('button[data-a="voiceStart"]');
  await expect.poll(() => srCount(page)).toBe(1);
  const before = (await state(page)).memory.length;
  await speakAndWait(page, "Merke dir, dass wir die Preise erhöhen");
  let s = await state(page);
  expect(s.memory.length).toBe(before);
  const a = s.chatMsgs.at(-1).actions[0];
  expect(a).toMatchObject({ type: "memory.add", status: "offen", note: "Bitte auf dem Bildschirm bestätigen (nicht per Sprache)." });
  await expect.poll(() => srCount(page)).toBe(2);
  await speakAndWait(page, "Veröffentliche den Instagram Beitrag jetzt");
  s = await state(page);
  expect(s.chatMsgs.at(-1).text).toContain("Ich habe nichts ausgeführt");
  // Mikrofon verweigert
  await expect.poll(() => srCount(page)).toBe(3);
  await page.evaluate(() => window.__sr[window.__sr.length - 1].fail("not-allowed"));
  await expect(page.locator("#voicebar")).toHaveCount(0);
  await expect(page.locator("#toast")).toContainText("Mikrofon nicht erlaubt");
});

test("Ohne Spracherkennung (z. B. installierte iOS-App): ehrlich als Diktiermodus gekennzeichnet, Antworten werden vorgelesen", async ({ page }) => {
  await setup(page, { sr: false });
  await page.click('button[data-a="voiceStart"]');
  await expect(page.locator("#voicebar")).toContainText("Diktiermodus");
  await expect(page.locator("#voicebar")).toContainText("kein Sprachmodus");
  await page.fill("#chatIn", "Welche Aufgaben sind offen?");
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => page.evaluate(() => window.__said.length)).toBeGreaterThan(0);
  const info = await page.evaluate(() => voiceInfo());
  expect(info).toContain("KEIN Sprachmodus");
  const log = await page.evaluate(() => ACTIONS.filter((a) => a.name === "voice.start").map((a) => a.detail));
  expect(log).toEqual(["diktat"]);
});
