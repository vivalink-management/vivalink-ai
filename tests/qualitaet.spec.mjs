// Gegenprobe zum Qualitäts-Testset: Die regelbasierte Bewertung erkennt gute und schwache Antworten zuverlässig
// (sonst wären die Live-Vergleiche wertlos). Reine Logik, keine Browser-Abhängigkeit.
import { test, expect } from "@playwright/test";
import { bewerte, zusammenfassung, wiederholung, GESPRAECHE } from "./qualitaet-rubrik.mjs";

test("Bewertung unterscheidet gute und schwache Antworten", async ({}, info) => {
  test.skip(info.project.name !== "chromium-desktop", "reine Logik, einmal genügt");
  const gut = "[Empfehlung] Option A: Erinnerung am Vortag (wenig Aufwand, hohe Wirkung). Option B: Warteliste. Ich empfehle A, weil bei kleinen Gruppen jede Absage zählt und du allein wenig Zeit hast. Erster Schritt: diese Woche eine Vorlage schreiben. Erfolg messen: Absagen je Meetup nach vier Wochen.";
  const schwach = "Mehr Marketing machen und Social Media nutzen.";
  const g = bewerte({ frage: "x", art: "beratung", text: gut, prevs: [], aktionenNeu: 0, mitProfil: true });
  const s = bewerte({ frage: "x", art: "beratung", text: schwach, prevs: [], aktionenNeu: 0, mitProfil: true });
  expect(g.punkte).toBe(g.max);
  expect(s.punkte).toBeLessThanOrEqual(3);
  expect(bewerte({ frage: "x", art: "beratung", text: gut, prevs: [gut], aktionenNeu: 0, mitProfil: true }).k.wiederholung).toBe(0);
  expect(bewerte({ frage: "x", art: "beratung", text: gut, prevs: [], aktionenNeu: 1, mitProfil: true }).k.aktion).toBe(0); // unbeauftragte Aufgabe
  expect(bewerte({ frage: "x", art: "auftrag", text: "Erledigt.", prevs: [], aktionenNeu: 1 }).k.aktion).toBe(1);
  expect(bewerte({ frage: "x", art: "auftrag", text: "Erledigt.", prevs: [], aktionenNeu: 2 }).k.aktion).toBe(0); // Dublette
  expect(wiederholung("eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn vierzehn", ["eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn vierzehn"])).toBe(1);
  expect(zusammenfassung([g, s]).prozent).toBeLessThan(100);
  expect(GESPRAECHE.flat().length).toBe(11);
});
