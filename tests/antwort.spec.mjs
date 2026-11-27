// Antwortqualität (ab 2.13): Antwortarten, „bereits genannt“, Prüfungen nach der Antwort (Kennzeichnung,
// Wiederholung, Beratungsstruktur) mit höchstens EINEM Nachfass-Aufruf, nie im Sprachmodus. Künstliche Daten, Attrappe.
import { test, expect } from "@playwright/test";
import { setupVoice, msgCount } from "./voice-fakes.mjs";

const ask = async (page, q) => {
  const n = await msgCount(page);
  await page.fill("#chatIn", q);
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => msgCount(page)).toBe(n + 2);
  return page.evaluate(() => S.chatMsgs.at(-1));
};
const GUT = "[Empfehlung] Option A: Erinnerung am Vortag (wenig Aufwand). Option B: Warteliste (mittlerer Aufwand). Ich empfehle A, weil Nichterscheinen sonst Plätze kostet. Erster Schritt: diese Woche eine Erinnerung einrichten. Erfolg messen: Nichterscheinen nach 4 Wochen.";

test("Antwortarten werden technisch erkannt", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium-desktop" && info.project.name !== "webkit-ipad", "Logik einmal je Browser-Technik");
  await setupVoice(page, { ki: false });
  const L = [
    ["Wie viele Anmeldungen haben wir?", "kurz"],
    ["Wann ist das nächste Meetup?", "kurz"],
    ["Wie entwickeln sich die Registrierungen?", "analyse"],
    ["Warum sind weniger Leute gekommen?", "analyse"],
    ["Du hast mir gerade empfohlen, mehr Marketing zu machen. Welche konkrete Maßnahme würdest du als Erstes umsetzen und warum?", "beratung"],
    ["Was sollten wir tun, um mehr Anmeldungen zu bekommen?", "beratung"],
    ["Wie können wir mehr Mitglieder gewinnen?", "beratung"],
    ["Die Synchronisierung funktioniert nicht, was ist los?", "technik"],
    ["Lege eine Aufgabe an: Flyer drucken", "gespraech"],
    ["Danke, das hilft mir.", "gespraech"],
  ];
  expect(await page.evaluate((L) => L.map(([t]) => [t, answerMode(t)]), L)).toEqual(L);
});

test("Beratung: Struktur im Auftrag an das Modell; unvollständige Antwort → genau ein Nachfass-Aufruf, bessere Fassung wird übernommen", async ({ page }) => {
  const { calls } = await setupVoice(page, { chat: (n) => (n === 1 ? { response: "Mehr Marketing machen." } : { response: GUT }) });
  await page.click('button[data-a="chatNew"]');
  const m = await ask(page, "Welche Maßnahme würdest du als Erstes umsetzen, um mehr Anmeldungen zu bekommen?");
  expect(calls.chat).toBe(2);
  expect(calls.inputs[0].messages[0].content).toContain("Antwortart Beratung");
  expect(calls.inputs[1].messages.at(-1).content).toContain("Für eine Beratung fehlen");
  expect(calls.inputs[1].tools).toBeUndefined(); // Nachfass ohne Werkzeuge
  expect(m.text).toContain("Option A");
});

test("Nachfass bringt nichts Besseres oder schlägt fehl: erste Antwort bleibt; nie mehr als ein zusätzlicher Aufruf", async ({ page }) => {
  const { calls } = await setupVoice(page, { chat: (n) => (n === 1 ? { response: "Mehr Marketing machen." } : n === 2 ? { status: 503 } : { response: "Mehr Marketing machen, wirklich." }) });
  await page.click('button[data-a="chatNew"]');
  let m = await ask(page, "Was würdest du tun, um mehr Mitglieder zu gewinnen?");
  expect(m.text).toContain("Mehr Marketing machen.");
  expect(m.engine).toBe("ki");
  expect(calls.chat).toBe(2);
  m = await ask(page, "Welche Strategie empfiehlst du für das nächste Quartal?");
  expect(calls.chat).toBe(4); // Hauptaufruf + höchstens ein Nachfass
  expect(m.text).toContain("Mehr Marketing machen");
});

test("Wiederholung: fast gleiche Antwort wie zuvor → ein Nachfass-Aufruf; bereits genannte Zahlen gehen als Hinweis mit", async ({ page }) => {
  const A1 = "[Fakt] Die neuen Registrierungen liegen bei 9 pro Woche, Stand 8.1.2026, und das Ziel sind 15 pro Woche. Die Entwicklung ist leicht steigend im Vergleich zur Vorwoche.";
  const { calls } = await setupVoice(page, { freigaben: { kennzahlen: true }, chat: (n) => (n <= 2 ? { response: A1 } : { response: "[Annahme] Neu ist: Der Anstieg kam vor allem in der zweiten Wochenhälfte." }) });
  await page.click('button[data-a="chatNew"]');
  await ask(page, "Wie entwickeln sich die Registrierungen?");
  const m = await ask(page, "Und was fällt dir sonst noch auf?");
  expect(calls.inputs[1].messages.filter((x) => x.role === "system").map((x) => x.content).join(" ")).toContain("bereits genannt");
  expect(calls.inputs[1].messages.filter((x) => x.role === "system").map((x) => x.content).join(" ")).toContain("9 pro Woche");
  expect(calls.chat).toBe(3);
  expect(calls.inputs[2].messages.at(-1).content).toContain("wiederholt weitgehend");
  expect(m.text).toContain("zweiten Wochenhälfte");
});

test("Kennzeichnung: „[Fakt]“ mit Zahl, die nirgends in den Daten steht → „[Annahme]“; belegte Zahl bleibt Fakt", async ({ page }) => {
  await setupVoice(page, {
    freigaben: { kennzahlen: true },
    chat: () => (input) =>
      input.tools && !input.messages.at(-1).content.startsWith("Ergebnisse")
        ? { response: "", tool_calls: [{ name: "kennzahlen", arguments: {} }] }
        : { response: "[Fakt] Neue Registrierungen: 9 pro Woche. [Fakt] Die Konversionsrate liegt bei 37 %. Das ist eine Testantwort ohne weitere Aussage." },
  });
  await page.click('button[data-a="chatNew"]');
  const m = await ask(page, "Wie viele Registrierungen haben wir?");
  expect(m.text).toContain("[Fakt] Neue Registrierungen: 9 pro Woche.");
  expect(m.text).toContain("[Annahme] Die Konversionsrate liegt bei 37 %.");
});

test("Sprachmodus: Antwortart mitgegeben, aber kein Nachfass-Aufruf (Antwortzeit) – Sprachmodus-Ablauf unverändert", async ({ page }) => {
  const { calls } = await setupVoice(page, { sr: "ok", chat: () => ({ response: "Mehr Marketing machen." }) });
  await page.click('button[data-a="voiceStart"]');
  await expect.poll(() => page.evaluate(() => window.__sr.filter((r) => r.live).length), { timeout: 6000 }).toBe(1);
  await page.evaluate(() => window.__sr.filter((r) => r.live)[0].say("Was würdest du tun, um mehr Mitglieder zu gewinnen?"));
  await expect.poll(() => msgCount(page), { timeout: 8000 }).toBe(2);
  expect(calls.chat).toBe(1);
  const sys = calls.inputs[0].messages[0].content;
  expect(sys).toContain("Sprachmodus: Deine Antwort wird vorgelesen");
  expect(sys).toContain("Im Sprachmodus: nur deine Empfehlung");
});

test("Kennzahlen-Werkzeug nennt den Abstand zum Ziel; Maßnahmen-Werkzeug liefert der KI Befunde mit Daten statt fertiger Empfehlungen (lokal unverändert)", async ({ page }) => {
  await setupVoice(page, { ki: false });
  const r = await page.evaluate(() => {
    const m = S.metrics.find((x) => x.key === "reg_week");
    m.goal = 15;
    return { k: TOOLS.kennzahlen.run().map((b) => b.t).join("\n"), ki: TOOLS.massnahmen.run({}, { ki: true }).map((b) => b.k + ":" + b.t).join("\n"), lokal: TOOLS.massnahmen.run().map((b) => b.k + ":" + b.t).join("\n") };
  });
  expect(r.k).toMatch(/Neue Registrierungen pro Woche: 9 .*Ziel 15 \(noch 6 entfernt\)/);
  expect(r.ki).toContain("Befund:");
  expect(r.ki).toContain("Regel-Hinweis der App (kein Ersatz für eine eigene Empfehlung)");
  expect(r.ki).not.toContain("empfehlung:");
  expect(r.lokal).toContain("empfehlung:Zu „");
});
