// Absichtsprüfung vor jeder schreibenden Aktion (ab 2.12): technisch in der App, unabhängig vom Sprachmodell.
// Fragen, Empfehlungen und Überlegungen ändern nichts; ausdrückliche Aufträge werden nach den bestehenden Freigabestufen
// ausgeführt; Unklares wird als Vorschlag mit Rückfrage gezeigt. Keine Dubletten. Nur künstliche Daten.
import { test, expect } from "@playwright/test";
import { state } from "./helpers.mjs";
import { setupVoice, msgCount } from "./voice-fakes.mjs";

const SAETZE = [
  // [Text, erwartete Art, darf selbstständig: ...]
  ["Du hast mir gerade empfohlen, mehr Marketing zu machen. Welche konkrete Maßnahme würdest du als Erstes umsetzen und warum?", "frage", []],
  ["Was empfiehlst du?", "frage", []],
  ["Welche Aufgabe würdest du als Nächstes anlegen?", "frage", []],
  ["Was sollte ich als Aufgabe anlegen?", "frage", []],
  ["Wie läuft Vivalink und was sollten wir tun?", "frage", []],
  ["Sollten wir dafür eine Aufgabe anlegen?", "unklar", []],
  ["Würdest du eine Aufgabe für die Kampagne anlegen?", "frage", []],
  ["Wäre es sinnvoll, Instagram-Beiträge vorzubereiten?", "unklar", []],
  ["Wir brauchen mehr Marketing.", "unklar", []],
  ["Leg keine Aufgabe an, ich möchte nur deine Meinung.", "aussage", []],
  ["Bitte keine Aufgaben erstellen – wie siehst du das Marketing?", "aussage", []],
  ["Erstelle eine Aufgabe für eine Instagram-Kampagne.", "auftrag", ["task.add"]],
  ["Lege eine Aufgabe an: Fotos vom Meetup sortieren bis morgen", "auftrag", ["task.add"]],
  ["Kannst du mir eine Aufgabe für die Pressemitteilung anlegen?", "auftrag", ["task.add"]],
  ["Bitte trage als Aufgabe ein: Sponsoren anschreiben", "auftrag", ["task.add"]],
  ["Erinnere mich daran, dass ich am Freitag die Rechnung prüfe", "auftrag", ["task.add"]],
  ["Mach daraus eine Aufgabe.", "auftrag", ["task.add"]],
  ["Testaufgabe Eins ist erledigt", "auftrag", ["task.done"]],
  ["Ist Testaufgabe Eins erledigt?", "frage", []],
  ["Bereite drei Instagram-Beiträge für nächste Woche vor.", "auftrag", ["drafts"]],
  ["Wie planen wir Instagram-Beiträge für nächste Woche?", "frage", []],
  ["Überprüfe, ob es technische Probleme gibt.", "unklar", []],
  ["Behebe die technischen Fehler.", "auftrag", ["repair"]],
  ["Merke dir, dass das nächste Meetup im Testcafé stattfindet", "auftrag", ["memory.add"]],
];

test("Satztabelle: Fragen, Empfehlungen, Überlegungen, Verneinungen und Aufträge werden technisch unterschieden", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium-desktop" && info.project.name !== "webkit-ipad", "Logik einmal je Browser-Technik");
  await setupVoice(page, { ki: false });
  const got = await page.evaluate((L) => L.map(([t]) => { const r = userIntent(t); return [t, r.kind, [...r.allow]]; }), SAETZE);
  expect(got).toEqual(SAETZE);
  // Anzahl je Auftrag
  expect(await page.evaluate(() => userIntent("Lege zwei Aufgaben an: A und B").count)).toBe(2);
  expect(await page.evaluate(() => userIntent("Lege eine Aufgabe an: A").count)).toBe(1);
  // Titelvergleich gegen Dubletten
  expect(await page.evaluate(() => [similarTitle("Social-Media-Kampagne starten", "Social-Media-Kampagne"), similarTitle("Instagram Kampagne", "Instagram-Kampagne planen"), similarTitle("Fotos sortieren", "Sponsoren anschreiben"), similarTitle("Meetup März vorbereiten", "Meetup April vorbereiten")])).toEqual([true, true, false, false]);
});

test("Lokaler Assistent (ohne KI): Frage nach Empfehlung legt nichts an, ausdrücklicher Auftrag schon – Rückgängig bleibt", async ({ page }) => {
  await setupVoice(page, { ki: false });
  const n0 = (await state(page)).tasks.filter((t) => !t.deleted).length;
  await page.click('button[data-a="chatNew"]');
  for (const q of ["Was empfiehlst du als nächste Maßnahme?", "Welche Aufgaben sind offen?", "Sollten wir eine Aufgabe für die Sponsorensuche anlegen?"]) {
    const n = await msgCount(page);
    await page.fill("#chatIn", q);
    await page.click('button[data-a="chatSend"]');
    await expect.poll(() => msgCount(page)).toBe(n + 2);
  }
  expect((await state(page)).tasks.filter((t) => !t.deleted).length).toBe(n0);
  await page.fill("#chatIn", "Lege eine Aufgabe an: Sponsoren anschreiben bis morgen");
  await page.click('button[data-a="chatSend"]');
  await expect(page.locator(".msg.ai .bub").last().locator(".ca")).toContainText("✅ erledigt");
  expect((await state(page)).tasks.filter((t) => !t.deleted).length).toBe(n0 + 1);
  // gleicher Auftrag erneut → keine Dublette (ähnliche offene Aufgabe vorhanden)
  await page.fill("#chatIn", "Lege eine Aufgabe an: Sponsoren anschreiben");
  await page.click('button[data-a="chatSend"]');
  await expect(page.locator(".msg.ai .bub").last().locator(".ca")).toContainText("schon vorhanden");
  expect((await state(page)).tasks.filter((t) => !t.deleted).length).toBe(n0 + 1);
});

test("Unklar formuliert: KI fragt nach, App zeigt höchstens einen Vorschlag; Verwerfen ändert nichts", async ({ page }) => {
  const { calls } = await setupVoice(page, {
    chat: () => (input) => (input.messages.at(-1).content.startsWith("Ergebnisse") ? { response: "ok" } : { response: "[Empfehlung] Ja, eine Kampagne mit Meetup-Fotos. Soll ich daraus eine Aufgabe machen?", tool_calls: [{ name: "aufgabe_anlegen", arguments: { titel: "Kampagne mit Meetup-Fotos" } }] }),
  });
  const n0 = (await state(page)).tasks.filter((t) => !t.deleted).length;
  await page.click('button[data-a="chatNew"]');
  await page.fill("#chatIn", "Sollten wir eine Kampagne mit Meetup-Fotos machen?");
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => msgCount(page)).toBe(2);
  const last = page.locator(".msg.ai .bub").last();
  await expect(last).toContainText("Soll ich daraus eine Aufgabe machen?");
  await expect(last.locator(".ca")).toContainText("Vorschlag");
  expect(calls.inputs[0].tools.some((t) => t.function.name === "aufgabe_anlegen")).toBe(false);
  await last.locator('button[data-a="chatActNo"]').click();
  await expect(last.locator(".ca")).toContainText("verworfen");
  expect((await state(page)).tasks.filter((t) => !t.deleted).length).toBe(n0);
});

test("Doppelt gesendete Nachricht (Senden zweimal, Eingabetaste + Senden) wird nur einmal verarbeitet", async ({ page }) => {
  await setupVoice(page, { ki: false });
  const n0 = (await state(page)).tasks.filter((t) => !t.deleted).length;
  await page.click('button[data-a="chatNew"]');
  // Speichern künstlich verlangsamen: die Antwort ist schon sichtbar, aber noch nicht gespeichert (auf WebKit gefundene Lücke)
  await page.evaluate(() => {
    const s0 = save;
    window.save = async (...a) => (await new Promise((r) => setTimeout(r, 400)), s0(...a));
  });
  await page.fill("#chatIn", "Lege eine Aufgabe an: Flyer drucken");
  // zweimal Senden; sobald die Antwort sichtbar ist (Speichern läuft noch), dieselbe Nachricht erneut
  await page.evaluate(async () => {
    chatAction("chatSend");
    chatAction("chatSend");
    while (S.chatMsgs.length < 2) await new Promise((r) => setTimeout(r, 5));
    await chatSend("Lege eine Aufgabe an: Flyer drucken");
  });
  await expect.poll(() => msgCount(page)).toBe(2);
  await page.waitForTimeout(300);
  expect(await msgCount(page)).toBe(2);
  expect((await state(page)).tasks.filter((t) => !t.deleted).length).toBe(n0 + 1);
});

test("Sprachmodus: ausdrücklicher Auftrag per Sprache wird ausgeführt (Stufe 1); Gedächtnis und Löschen nur durch Tippen; Riskantes nie", async ({ page }) => {
  await setupVoice(page, { sr: "ok", ki: false });
  const n0 = (await state(page)).tasks.filter((t) => !t.deleted).length;
  await page.click('button[data-a="voiceStart"]');
  const say = async (t) => {
    const n = await msgCount(page);
    await expect.poll(() => page.evaluate(() => window.__sr.filter((r) => r.live).length), { timeout: 6000 }).toBe(1);
    await page.evaluate((t) => window.__sr.filter((r) => r.live)[0].say(t), t);
    await expect.poll(() => msgCount(page), { timeout: 8000 }).toBe(n + 2);
  };
  await say("Was empfiehlst du für mehr Anmeldungen?");
  expect((await state(page)).tasks.filter((t) => !t.deleted).length).toBe(n0);
  await say("Lege eine Aufgabe an: Plakate aufhängen bis Freitag");
  expect((await state(page)).tasks.filter((t) => !t.deleted).length).toBe(n0 + 1);
  await say("Merke dir, dass wir im April ein zweites Meetup planen");
  let s = await state(page);
  expect(s.chatMsgs.at(-1).actions[0]).toMatchObject({ type: "memory.add", status: "offen", note: "Bitte auf dem Bildschirm bestätigen (nicht per Sprache)." });
  await say("Veröffentliche den Beitrag jetzt auf Instagram");
  s = await state(page);
  expect(s.chatMsgs.at(-1).text).toContain("Ich habe nichts ausgeführt");
});

test("Gesprächszusammenhang: Rückfrage bekommt die vorige KI-Antwort (ohne Hinweiszeilen), Regeln gegen Wiederholungen und Kennzeichnung", async ({ page }) => {
  const { calls } = await setupVoice(page, {
    chat: (n) => (n === 1 ? { response: "[Fakt] 9 neue Registrierungen pro Woche (Stand 8.1.2026). [Empfehlung] Mehr Marketing über Instagram." } : { response: "[Empfehlung] Als Erstes eine wöchentliche Serie mit Meetup-Momenten." }),
  });
  await page.click('button[data-a="chatNew"]');
  await page.fill("#chatIn", "Wie entwickeln sich die Anmeldungen?");
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => msgCount(page)).toBe(2);
  await page.fill("#chatIn", "Welche konkrete Maßnahme würdest du davon als Erstes umsetzen und warum?");
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => msgCount(page)).toBe(4);
  const sys = calls.inputs[0].messages[0].content;
  for (const rule of ["Wiederhole keine Zahlen", "Rückfragen", "[Fakt]", "[Annahme]", "[Empfehlung]", "Testdaten sind nie echte Kennzahlen", "erster Schritt", "Eine Aufgabe legst du nur an, wenn der Gründer ausdrücklich darum bittet"]) expect(sys).toContain(rule);
  const second = calls.inputs.at(-1).messages;
  const prev = second.find((m) => m.role === "assistant" && m.content.includes("Mehr Marketing über Instagram"));
  expect(prev, "vorige KI-Antwort im Verlauf").toBeTruthy();
  expect(prev.content).not.toContain("An die KI übermittelt"); // keine Hinweiszeilen als Rauschen
  expect(second.at(-1)).toMatchObject({ role: "user", content: "Welche konkrete Maßnahme würdest du davon als Erstes umsetzen und warum?" });
  // bei einer Frage kein Werkzeug zum Anlegen, bei einem Auftrag schon
  expect(calls.inputs.every((i) => !(i.tools || []).some((t) => t.function.name === "aufgabe_anlegen"))).toBe(true);
  await page.fill("#chatIn", "Lege dafür eine Aufgabe an: Wöchentliche Meetup-Serie starten");
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => msgCount(page)).toBe(6);
  expect(calls.inputs.at(-1).tools.some((t) => t.function.name === "aufgabe_anlegen")).toBe(true);
});
