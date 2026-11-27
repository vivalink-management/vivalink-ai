// Praxistest des Gründers auf dem iPad (2.11.1), nachgestellt mit künstlichen Daten:
//  1. Sprachmodus beendet sich während einer Unterhaltung selbst
//  2. Antworten werden nicht (hörbar) vorgelesen
//  3. KI legt auf eine reine Frage hin Aufgaben an – sogar doppelt
//  4. Gesprächszusammenhang, Wiederholungen, Länge im Sprachmodus
// Diese Tests schlugen mit 2.11.1 fehl (Nachweis: ROOT=tests/fixtures/legacy-v2111) und bestehen ab 2.12.
// Grenzen: Die Sprachausgabe von iOS ist nachgebildet (siehe voice-fakes.mjs) – hörbar/unhörbar auf dem echten Gerät
// lässt sich nur dort prüfen.
import { test, expect } from "@playwright/test";
import { state } from "./helpers.mjs";
import { setupVoice, talk, voiceOn, msgCount, heardCount } from "./voice-fakes.mjs";

const FRAGE = "Du hast mir gerade empfohlen, mehr Marketing zu machen. Welche konkrete Maßnahme würdest du als Erstes umsetzen und warum?";
// So hat sich das Modell beim Gründer verhalten: zwei Aufrufe „aufgabe_anlegen“, einer mit, einer ohne Frist
const modelLegtAn = (input) =>
  input.tools && input.tools.some((t) => t.function.name === "aufgabe_anlegen") && !input.messages.at(-1).content.startsWith("Ergebnisse")
    ? { response: "", tool_calls: [{ name: "aufgabe_anlegen", arguments: { titel: "Social-Media-Kampagne starten", frist: "2026-12-04" } }, { name: "aufgabe_anlegen", arguments: { titel: "Social-Media-Kampagne" } }] }
    : { response: "[Empfehlung] Als Erstes eine wöchentliche Instagram-Serie mit echten Meetup-Momenten, weil sie Vertrauen schafft." };

test("Reine Frage nach einer Empfehlung legt keine Aufgabe an – auch wenn das Modell es versucht; Vorschlag nur per Tippen, ohne Dubletten", async ({ page }) => {
  const { calls, errors } = await setupVoice(page, { chat: () => modelLegtAn });
  const before = (await state(page)).tasks.length;
  await page.click('button[data-a="chatNew"]');
  await page.fill("#chatIn", FRAGE);
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => msgCount(page)).toBe(2);
  let s = await state(page);
  expect(s.tasks.filter((t) => !t.deleted).length, "keine Aufgabe ohne Auftrag").toBe(before);
  const last = page.locator(".msg.ai .bub").last();
  await expect(last).toContainText("wöchentliche Instagram-Serie");
  // höchstens EIN Vorschlag (Dubletten zusammengefasst), mit Tippen zum Anlegen
  const acts = s.chatMsgs.at(-1).actions || [];
  expect(acts.filter((a) => a.type === "task.add").length).toBeLessThanOrEqual(1);
  // das Modell bekommt bei einer Frage gar kein Werkzeug zum Anlegen angeboten
  expect(calls.inputs.every((i) => !(i.tools || []).some((t) => t.function.name === "aufgabe_anlegen"))).toBe(true);
  if (acts.length) {
    expect(acts[0].status).toBe("vorschlag");
    await last.locator('button[data-a="chatAct"]').dblclick(); // auch doppeltes Tippen legt nur eine an
    await expect(last.locator(".ca")).toContainText("erledigt");
    s = await state(page);
    expect(s.tasks.filter((t) => !t.deleted).length).toBe(before + 1);
  }
  expect(errors).toEqual([]);
});

test("Ausdrücklicher Auftrag wird ausgeführt – genau eine Aufgabe, auch wenn das Modell sie doppelt anlegt; Rückgängig bleibt", async ({ page }) => {
  await setupVoice(page, {
    chat: () => (input) =>
      input.messages.at(-1).content.startsWith("Ergebnisse")
        ? { response: "Erledigt: Aufgabe angelegt." }
        : { response: "", tool_calls: [{ name: "aufgabe_anlegen", arguments: { titel: "Instagram-Kampagne planen", frist: "2026-03-13" } }, { name: "aufgabe_anlegen", arguments: { titel: "Instagram-Kampagne planen" } }, { name: "aufgabe_anlegen", arguments: { titel: "Instagram Kampagne" } }] },
  });
  const before = (await state(page)).tasks.filter((t) => !t.deleted).length;
  await page.click('button[data-a="chatNew"]');
  await page.fill("#chatIn", "Erstelle eine Aufgabe für eine Instagram-Kampagne bis Freitag.");
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => msgCount(page)).toBe(2);
  let s = await state(page);
  const neu = s.tasks.filter((t) => !t.deleted && t.src === "chat");
  expect(neu.length).toBe(1);
  expect(s.tasks.filter((t) => !t.deleted).length).toBe(before + 1);
  expect(neu[0]).toMatchObject({ title: "Instagram-Kampagne planen", due: "2026-03-13" });
  const last = page.locator(".msg.ai .bub").last();
  await last.locator('button[data-a="chatUndo"]').click();
  await expect(last.locator(".ca")).toContainText("rückgängig gemacht");
  s = await state(page);
  expect(s.tasks.filter((t) => !t.deleted && t.src === "chat").length).toBe(0);
});

test("Fünf gesprochene Fragen hintereinander (installierte App, Server-Erkennung): jede Antwort hörbar vorgelesen, danach wieder zuhören, Sprachmodus bleibt an", async ({ page }) => {
  const { calls, errors } = await setupVoice(page, { sr: "aus", standalone: true, stt: (n) => ({ text: "Testfrage Nummer " + n + "?" }) });
  await page.click('button[data-a="voiceStart"]');
  for (let i = 1; i <= 5; i++) {
    await talk(page);
    await expect.poll(() => msgCount(page), { timeout: 8000 }).toBe(2 * i);
    await expect.poll(() => heardCount(page), { timeout: 8000 }).toBeGreaterThanOrEqual(i); // hörbar (Mikrofon beim Vorlesen frei)
    await expect(page.locator("#voicebar")).toContainText("ich höre zu", { timeout: 6000 });
    expect(await voiceOn(page), "Runde " + i).toBe(true);
  }
  expect(calls.stt).toBe(5);
  const said = await page.evaluate(() => window.__said);
  expect(said.filter((x) => !x.heard), "nichts ins offene Mikrofon vorgelesen").toEqual([]);
  expect(errors).toEqual([]);
});

test("Fünf gesprochene Fragen hintereinander (Safari, Geräte-Erkennung): jede Antwort hörbar, danach wieder zuhören", async ({ page }) => {
  await setupVoice(page, { sr: "ok", ki: false });
  await page.click('button[data-a="voiceStart"]');
  for (let i = 1; i <= 5; i++) {
    await expect.poll(() => page.evaluate(() => window.__sr.filter((r) => r.live).length), { timeout: 6000 }).toBe(1);
    await page.evaluate((i) => window.__sr.filter((r) => r.live)[0].say(i % 2 ? "Welche Aufgaben sind offen?" : "Wie läuft das Meetup?"), i);
    await expect.poll(() => msgCount(page), { timeout: 8000 }).toBe(2 * i);
    await expect.poll(() => heardCount(page), { timeout: 8000 }).toBeGreaterThanOrEqual(i);
  }
  expect(await voiceOn(page)).toBe(true);
  expect((await page.evaluate(() => window.__said)).filter((x) => !x.heard)).toEqual([]);
});

test("Bildschirm bleibt während des Sprachmodus an (sonst sperrt das iPad und beendet ihn); danach wieder freigegeben", async ({ page }) => {
  await setupVoice(page, { sr: "ok", ki: false });
  await page.click('button[data-a="voiceStart"]');
  await expect.poll(() => page.evaluate(() => window.__wl.active)).toBe(1);
  await page.click('#voicebar button[data-a="voiceStop"]');
  await expect.poll(() => page.evaluate(() => window.__wl.active)).toBe(0);
});

test("Geräusche und Whisper-Fehlerkennungen („Vielen Dank.“) beenden das Gespräch nicht und landen nicht im Chat", async ({ page }) => {
  const seq = ["", "Vielen Dank.", "", "Untertitel im Auftrag des ZDF", "Welche Aufgaben sind offen?"];
  const { calls } = await setupVoice(page, { sr: "aus", standalone: true, stt: (n) => ({ text: seq[n - 1] ?? "" }), T: { idle: 30000 } });
  await page.click('button[data-a="voiceStart"]');
  for (let i = 0; i < 5; i++) {
    await talk(page);
    await expect.poll(() => calls.stt, { timeout: 6000 }).toBe(i + 1);
  }
  await expect.poll(() => msgCount(page), { timeout: 8000 }).toBe(2);
  const s = await state(page);
  expect(s.chatMsgs[0].text).toBe("Welche Aufgaben sind offen?");
  expect(await voiceOn(page)).toBe(true);
});

test("Lange Antwort dauert zu lange: Sprachmodus bleibt an, hört wieder zu, Antwort erscheint später im Chat", async ({ page }) => {
  await setupVoice(page, { sr: "ok", chat: () => "haengt", KI: { call: 2000, total: 2500 }, T: { think: 1200 } });
  await page.click('button[data-a="voiceStart"]');
  await expect.poll(() => page.evaluate(() => window.__sr.length)).toBe(1);
  await page.evaluate(() => window.__sr[0].say("Wie entwickelt sich Vivalink aktuell?"));
  await expect.poll(() => msgCount(page), { timeout: 8000 }).toBe(2); // lokale Antwort nach der KI-Zeitgrenze
  expect(await voiceOn(page)).toBe(true);
  await expect(page.locator("#voicebar")).toContainText("ich höre zu", { timeout: 6000 });
});
