// Automatisches Vorlesen auf dem iPad (Praxistest des Gründers mit 2.12.0): Whisper und KI funktionieren, aber keine
// Antwort wird automatisch hörbar vorgelesen; Protokoll: je Satz nach ~20 s „vorlesen (Ende nicht gemeldet)“.
// Der 🔊-Knopf (Tippen) funktioniert. Nachgestellt mit dem iOS-Modell aus voice-fakes.mjs (Freischalten nur durch
// Tippen, leerer Satz hängt, Warteschlange blockiert bis cancel). Zeiten wie auf dem Gerät (nicht verkürzt).
// Grenze: Das Modell ist aus WebKit-Berichten und dem Protokoll abgeleitet – ob das echte iPad genauso reagiert,
// zeigt erst der Gerätetest; dafür protokolliert die App jetzt Start/Ende/Warteschlange der Sprachausgabe.
import { test, expect } from "@playwright/test";
import { setupVoice, talk, voiceOn, msgCount, heardCount } from "./voice-fakes.mjs";

const REAL = { ttsStart: 3000, ttsBase: 8000, ttsPerChar: 90, gap: 400 };
const answer = () => ({ response: "Die Anmeldungen steigen leicht. Ich empfehle eine wöchentliche Serie mit Meetup-Momenten. Den Erfolg messen wir an den Anmeldungen pro Woche. Soll ich Details zeigen?" });

test("iPad (installierte App, Server-Erkennung): drei gesprochene Fragen – jede Antwort hörbar vorgelesen, danach sofort wieder zuhören, keine langen Wartezeiten", async ({ page }) => {
  test.setTimeout(120_000);
  const { errors } = await setupVoice(page, { sr: "aus", standalone: true, tts: "ios", chat: answer, stt: (n) => ({ text: "Testfrage " + n + "?" }), T: { ...REAL, idle: 60000 } });
  await page.click('button[data-a="voiceStart"]');
  for (let i = 1; i <= 3; i++) {
    await talk(page);
    await expect.poll(() => msgCount(page), { timeout: 10000 }).toBe(2 * i);
    const t0 = Date.now();
    await expect.poll(() => heardCount(page), { timeout: 10000 }).toBeGreaterThanOrEqual(i * 2); // mehrere Sätze hörbar
    await expect(page.locator("#voicebar")).toContainText("ich höre zu", { timeout: 10000 });
    expect(Date.now() - t0, "Antwort " + i + " ohne lange Wartezeit").toBeLessThan(8000);
  }
  expect(await voiceOn(page)).toBe(true);
  const said = await page.evaluate(() => window.__said);
  expect(said.filter((x) => x.blocked), "keine stummen Versuche in der Warteschlange").toEqual([]);
  // Protokoll: Start und Ende der Sprachausgabe nachvollziehbar, ohne Inhalte
  const log = await page.evaluate(() => voLogText());
  for (const ev of ["vorlesen-freigabe", "vorlesen-satz", "vorlesen-start", "vorlesen-ende"]) expect(log).toContain(ev);
  expect(log).not.toContain("Anmeldungen steigen");
  expect(log).not.toContain("Testfrage");
  expect(errors).toEqual([]);
});

test("Safari-Tab (Geräte-Erkennung): Antworten werden ebenfalls automatisch hörbar vorgelesen", async ({ page }) => {
  test.setTimeout(90_000);
  await setupVoice(page, { sr: "ok", tts: "ios", chat: answer, T: REAL });
  await page.click('button[data-a="voiceStart"]');
  for (let i = 1; i <= 2; i++) {
    await expect.poll(() => page.evaluate(() => window.__sr.filter((r) => r.live).length), { timeout: 10000 }).toBe(1);
    await page.evaluate((i) => window.__sr.filter((r) => r.live)[0].say("Frage Nummer " + i), i);
    await expect.poll(() => heardCount(page), { timeout: 10000 }).toBeGreaterThanOrEqual(i * 2);
  }
  expect((await page.evaluate(() => window.__said)).filter((x) => x.blocked)).toEqual([]);
});

test("Falls iPadOS jedes Vorlesen nur nach Tippen erlaubt: nach höchstens wenigen Sekunden ein großer Knopf „Antwort vorlesen“, die App hört weiter zu; Tippen liest vor und danach geht es automatisch weiter", async ({ page }) => {
  test.setTimeout(90_000);
  await setupVoice(page, { sr: "aus", standalone: true, tts: "ios-streng", chat: answer, T: { ...REAL, idle: 60000 } });
  await page.click('button[data-a="voiceStart"]');
  await talk(page);
  await expect.poll(() => msgCount(page), { timeout: 10000 }).toBe(2);
  const t0 = Date.now();
  const btn = page.locator('#voicebar button[data-a="voiceSayTap"]');
  await expect(btn).toBeVisible({ timeout: 8000 });
  expect(Date.now() - t0).toBeLessThan(8000);
  await expect(page.locator("#voicebar")).toContainText("ich höre zu"); // Gespräch geht weiter
  // höchstens zwei automatische Versuche (Versuch + ein Wiederholversuch), danach keine weiteren stummen Versuche
  const tries = (await page.evaluate(() => VO_LOG.filter((e) => e.ev === "vorlesen-satz").length));
  expect(tries).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => speechSynthesis.pending || speechSynthesis.speaking), "nichts Stummes in der Warteschlange").toBe(false);
  const h0 = await heardCount(page);
  await btn.click();
  await expect.poll(() => heardCount(page), { timeout: 8000 }).toBeGreaterThan(h0);
  await expect(page.locator("#voicebar")).toContainText("ich höre zu", { timeout: 10000 });
  await expect(btn).toBeHidden();
  // nächste Antwort: kein erneutes langes Warten
  await talk(page);
  await expect.poll(() => msgCount(page), { timeout: 10000 }).toBe(4);
  const t1 = Date.now();
  await expect(btn).toBeVisible({ timeout: 6000 });
  expect(Date.now() - t1, "zweite Antwort: Knopf nach kurzem Versuch").toBeLessThan(4000);
  expect(await page.evaluate(() => voLogText())).toContain("tippen nötig");
  expect(await voiceOn(page)).toBe(true);
});
