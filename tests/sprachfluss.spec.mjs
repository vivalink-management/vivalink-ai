// Sprachmodus ab 2.12: natürlicher Gesprächsfluss, verständliche Sicherheits-Enden, Vorlesen per Tippen, kurze Antworten,
// Unterbrechen, Bildschirm an, Protokoll ohne Inhalte. Nur künstliche Daten; Geräte-Funktionen sind Nachbildungen
// (voice-fakes.mjs). Was nur auf dem echten iPad prüfbar ist, steht in docs/KI-CHAT.md (Gerätetest).
import { test, expect } from "@playwright/test";
import { state } from "./helpers.mjs";
import { setupVoice, talk, voiceOn, msgCount, heardCount } from "./voice-fakes.mjs";

test("Stille: Vorwarnung mit Countdown, „Weiter zuhören“ setzt zurück; Ende als Sicherheitsgrund dauerhaft im Chat mit „Erneut starten“", async ({ page }) => {
  await setupVoice(page, { sr: "ok", ki: false, T: { idle: 3500, idleWarn: 2000 } });
  await page.click('button[data-a="voiceStart"]');
  await expect(page.locator("#voicebar")).toContainText("ich höre zu");
  await expect(page.locator("#voicebar")).toContainText("endet in", { timeout: 4000 });
  await page.click('#voicebar button[data-a="voiceKeep"]');
  await expect(page.locator("#voicebar")).not.toContainText("endet in");
  expect(await voiceOn(page)).toBe(true);
  await expect.poll(() => voiceOn(page), { timeout: 8000 }).toBe(false);
  const card = page.locator("#voEnd");
  await expect(card).toContainText("Sprachmodus beendet: keine Eingabe");
  await expect(card).toContainText("Zur Sicherheit");
  // bleibt sichtbar (nicht nur kurz eingeblendet), auch nach Neuzeichnen
  await page.click('nav button[data-id="tasks"]');
  await page.click('nav button[data-id="ai"]');
  await expect(page.locator("#voEnd")).toBeVisible();
  await page.click('#voEnd button[data-a="voiceStart"]');
  await expect(page.locator("#voicebar")).toContainText("ich höre zu");
  await expect(page.locator("#voEnd")).toHaveCount(0);
  await page.click('#voicebar button[data-a="voiceStop"]'); // Beenden durch Tippen: kein Hinweis nötig
  await expect(page.locator("#voEnd")).toHaveCount(0);
});

test("Sprachausgabe startet, meldet aber kein Ende (iOS): alle Sätze werden gesprochen, danach wieder zuhören – kein Störungshinweis", async ({ page }) => {
  await setupVoice(page, { sr: "ok", ki: false, tts: "keinEnde", T: { ttsBase: 200 } });
  await page.click('button[data-a="voiceStart"]');
  await expect.poll(() => page.evaluate(() => window.__sr.length)).toBe(1);
  await page.evaluate(() => window.__sr[0].say("Welche Aufgaben sind offen?"));
  await expect.poll(() => page.evaluate(() => window.__said.length), { timeout: 8000 }).toBeGreaterThan(2);
  await expect(page.locator("#voicebar")).toContainText("ich höre zu", { timeout: 8000 });
  await expect(page.locator("#voicebar")).not.toContainText("Vorlesen reagiert");
});

test("Vorlesen gestört: Antwort per 🔊 an der Nachricht vorlesen (Tippen); im Sprachmodus danach wieder zuhören", async ({ page }) => {
  await setupVoice(page, { sr: "ok", ki: false, tts: "stumm" });
  await page.click('button[data-a="voiceStart"]');
  await expect.poll(() => page.evaluate(() => window.__sr.length)).toBe(1);
  await page.evaluate(() => window.__sr[0].say("Welche Aufgaben sind offen?"));
  await expect(page.locator("#voicebar")).toContainText("Vorlesen reagiert gerade nicht", { timeout: 6000 });
  await expect(page.locator("#voicebar")).toContainText("ich höre zu", { timeout: 6000 });
  // Ausgabe wieder in Ordnung (z. B. nach dem Tippen) → 🔊 liest vor, danach wieder zuhören
  await page.evaluate(() => (window.__ttsMode = "ok"));
  const n0 = await heardCount(page);
  await page.locator('.msg.ai button[data-a="chatSpeak"]').last().click();
  await expect.poll(() => heardCount(page), { timeout: 6000 }).toBeGreaterThan(n0);
  await expect(page.locator("#voicebar")).toContainText("ich höre zu", { timeout: 6000 });
  await expect(page.locator("#voicebar")).not.toContainText("Vorlesen reagiert"); // Hinweis verschwindet, sobald es wieder geht
  // außerhalb des Sprachmodus: 🔊 liest einfach vor
  await page.click('#voicebar button[data-a="voiceStop"]');
  const n1 = await heardCount(page);
  await page.locator('.msg.ai button[data-a="chatSpeak"]').last().click();
  await expect.poll(() => heardCount(page)).toBeGreaterThan(n1);
});

test("Lange Antwort im Sprachmodus: kurz vorgelesen (Rest im Chat), Modell wird um Kürze gebeten; im Text-Chat nicht", async ({ page }) => {
  const long = Array.from({ length: 20 }, (_, i) => `Satz Nummer ${i + 1} mit einer künstlichen Erläuterung zur Testfrage.`).join(" ");
  const { calls } = await setupVoice(page, { sr: "ok", chat: () => ({ response: long }) });
  await page.click('button[data-a="chatNew"]');
  await page.fill("#chatIn", "Wie läuft das Meetup?");
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => msgCount(page)).toBe(2);
  expect(calls.inputs[0].messages[0].content).not.toContain("Sprachmodus:");
  await page.click('button[data-a="voiceStart"]');
  await expect.poll(() => page.evaluate(() => window.__sr.length)).toBe(1);
  await page.evaluate(() => window.__sr[0].say("Und was heißt das für nächste Woche?"));
  await expect.poll(() => msgCount(page), { timeout: 8000 }).toBe(4);
  await expect(page.locator("#voicebar")).toContainText("ich höre zu", { timeout: 8000 });
  expect(calls.inputs.at(-1).messages[0].content).toContain("Sprachmodus: Deine Antwort wird vorgelesen");
  const said = await page.evaluate(() => window.__said.map((x) => x.text));
  const spoken = said.join(" ");
  expect(spoken.length).toBeLessThan(700);
  expect(said.at(-1)).toBe("Mehr dazu steht im Chat.");
  await expect(page.locator(".msg.ai .bub").last()).toContainText("Satz Nummer 20"); // vollständig im Chat
});

test("Unterbrechen und sofort neue Frage: die nächste Antwort wird wieder hörbar vorgelesen", async ({ page }) => {
  await setupVoice(page, { sr: "ok", ki: false });
  await page.click('button[data-a="voiceStart"]');
  await expect.poll(() => page.evaluate(() => window.__sr.length)).toBe(1);
  await page.evaluate(() => (window.__holdTts = true));
  await page.evaluate(() => window.__sr[0].say("Analysiere die aktuellen Kennzahlen"));
  await expect(page.locator("#voicebar")).toContainText("ich spreche", { timeout: 6000 });
  await page.click('#voicebar button[data-a="voiceInterrupt"]');
  await expect(page.locator("#voicebar")).toContainText("ich höre zu", { timeout: 6000 });
  await page.evaluate(() => (window.__holdTts = false));
  const n0 = await heardCount(page);
  await page.evaluate(() => window.__sr.filter((r) => r.live)[0].say("Welche Aufgaben sind offen?"));
  await expect.poll(() => heardCount(page), { timeout: 8000 }).toBeGreaterThan(n0);
  expect(await voiceOn(page)).toBe(true);
});

test("Bildschirm an: nach Freigabe durch das System wird erneut angefordert; ohne Unterstützung läuft der Sprachmodus trotzdem", async ({ page }) => {
  await setupVoice(page, { sr: "ok", ki: false });
  await page.click('button[data-a="voiceStart"]');
  await expect.poll(() => page.evaluate(() => window.__wl.active)).toBe(1);
  await page.evaluate(() => (VO.wake.release(), (VO.wake = null))); // System gibt frei (z. B. Energiesparmodus)
  await expect.poll(() => page.evaluate(() => window.__wl.req), { timeout: 4000 }).toBe(2);
  await page.click('#voicebar button[data-a="voiceStop"]');
  await expect.poll(() => page.evaluate(() => window.__wl.active)).toBe(0);
});
test("Ohne Wake-Lock-Unterstützung (ältere iOS-Version) läuft der Sprachmodus trotzdem", async ({ page }) => {
  await setupVoice(page, { sr: "ok", ki: false, wakeLock: false });
  await page.click('button[data-a="voiceStart"]');
  await expect(page.locator("#voicebar")).toContainText("ich höre zu");
  await page.evaluate(() => window.__sr[0].say("Welche Aufgaben sind offen?"));
  await expect.poll(() => msgCount(page), { timeout: 8000 }).toBe(2);
});

test("Sprachmodus-Protokoll: Ereignisse und Zeiten, aber keine Inhalte; in den KI-Einstellungen sichtbar", async ({ page }) => {
  await setupVoice(page, { sr: "aus", standalone: true, stt: () => ({ text: "Geheime Testfrage zu Kennzahl XYZ?" }) });
  await page.click('button[data-a="voiceStart"]');
  await talk(page);
  await expect.poll(() => msgCount(page), { timeout: 8000 }).toBe(2);
  await expect(page.locator("#voicebar")).toContainText("ich höre zu", { timeout: 6000 });
  await page.click('#voicebar button[data-a="voiceStop"]');
  const log = await page.evaluate(() => voLogText());
  for (const ev of ["start", "mikrofon (an)", "whisper", "frage", "antwort", "mikrofon (aus)", "ende"]) expect(log).toContain(ev);
  expect(log).not.toContain("Geheime");
  expect(log).not.toContain("XYZ");
  expect(log).not.toContain("Testaufgabe");
  await expect.poll(async () => JSON.stringify(await page.evaluate(() => kvGet("voice-log")))).toContain("whisper");
  // nicht in der Synchronisierung/Sicherung
  expect(JSON.stringify(await state(page))).not.toContain("whisper");
  await page.click('button[data-a="chatBack"]');
  await page.click('button[data-a="kiSettings"]');
  await page.click("#vo-log summary");
  await expect(page.locator("#vo-log .vo-logp")).toContainText("whisper");
});
