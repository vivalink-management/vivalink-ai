// Qualitäts-Testset der KI-Antworten (Phase 1; wiederverwendbar für den Modellvergleich in Phase 4).
// Realistische Gesprächsfolgen mit künstlichen Daten und eine regelbasierte, nachvollziehbare Bewertung je Antwort
// (keine KI als Richter – kostenlos und reproduzierbar). Grenzen: Regeln messen Form und Bezug, nicht jede inhaltliche
// Güte; deshalb werden die Antworten zusätzlich im Protokoll ausgegeben.

// Künstliches Testprofil (keine echten Vivalink-Angaben)
export const TESTPROFIL = `Angebot und Besonderheit: kleine Gruppentreffen (6–8 Personen) für Erwachsene, die neue Menschen kennenlernen möchten; feste Donnerstagstermine (Testangabe).
Zielgruppe: Erwachsene, die neu in der Stadt sind oder ihren Kreis erweitern möchten (Testangabe).
Ziele: 15 neue Registrierungen pro Woche; mehr Erstbesuche bei Meetups (Testangabe).
Rahmen: Der Gründer arbeitet allein, ohne Programmierkenntnisse, mit kleinem Budget.
Nie empfehlen: bezahlte Werbung ohne vorherige Freigabe (Testangabe).`;
export const PROFIL_WORTE = /kleingruppe|kleine[n]? gruppe|donnerstag|kleine[sm]? budget|allein|erstbesuch|neu in der stadt|6.?8 personen/i;

export const GESPRAECHE = [
  [
    ["Wie entwickeln sich die Registrierungen?", "analyse"],
    ["Du hast mir gerade empfohlen, mehr Marketing zu machen. Welche konkrete Maßnahme würdest du als Erstes umsetzen und warum?", "beratung"],
    ["Und woran merken wir in vier Wochen, ob das wirkt?", "analyse"],
    ["Welche Alternative gäbe es, falls das nicht klappt?", "beratung"],
  ],
  [
    ["Wann ist das nächste Meetup?", "kurz"],
    ["Was können wir tun, damit weniger Leute kurzfristig absagen?", "beratung"],
  ],
  [
    ["Was sollten wir in den nächsten vier Wochen priorisieren?", "beratung"],
    ["Warum gerade das?", "analyse"],
    ["Lege eine Aufgabe an: Erinnerungsnachricht am Vortag einrichten", "auftrag"],
  ],
  [
    ["Funktioniert die Synchronisierung?", "technik"],
    ["Danke. Gibt es sonst technische Probleme?", "technik"],
  ],
];

const shingles = (t) => {
  const w = String(t || "")
    .toLowerCase()
    .replace(/\[(fakt|annahme|empfehlung|testdaten)\]/g, " ")
    .split(/[^0-9a-zäöüß]+/)
    .filter(Boolean);
  const S = new Set();
  for (let i = 0; i + 2 < w.length; i++) S.add(w.slice(i, i + 3).join(" "));
  return S;
};
export function wiederholung(t, prevs) {
  const A = shingles(t);
  if (A.size < 12) return 0;
  let best = 0;
  for (const p of prevs) {
    const B = shingles(p);
    let n = 0;
    for (const x of A) if (B.has(x)) n++;
    best = Math.max(best, n / A.size);
  }
  return best;
}
function struktur(t) {
  const opts = (t.match(/\b(option|alternative|variante|möglichkeit)/gi) || []).length + (t.match(/(^|\n)\s*(\d[.)]|[a-c]\)|-\s)/g) || []).length;
  return [opts >= 2, /weil|\bda\b|denn|deshalb|daher|begründ|grund/i.test(t), /erste[rn]? schritt|als erstes|zuerst|diese woche|morgen|sofort|starte/i.test(t), /mess|erfolg|kennzahl|woran|nach (zwei|drei|vier|2|3|4) wochen|prüf/i.test(t)];
}
/* Bewertung einer Antwort: Punkte und Gründe (0–1 je Kriterium) */
export function bewerte({ frage, art, text, prevs, aktionenNeu, mitProfil }) {
  const k = {};
  k.inhalt = text && text.trim().length > 20 && !/KI nicht verfügbar|keine Antwort geliefert/.test(text) ? 1 : 0;
  k.wiederholung = wiederholung(text, prevs) < 0.45 ? 1 : 0;
  k.kennzeichnung = /\[(Fakt|Annahme|Empfehlung)\]/.test(text) || art === "auftrag" ? 1 : 0;
  k.aktion = art === "auftrag" ? (aktionenNeu === 1 ? 1 : 0) : aktionenNeu === 0 ? 1 : 0;
  if (art === "beratung") {
    const s = struktur(text);
    k.optionen = s[0] ? 1 : 0;
    k.begruendung = s[1] ? 1 : 0;
    k.ersterSchritt = s[2] ? 1 : 0;
    k.erfolgsmessung = s[3] ? 1 : 0;
    if (mitProfil != null) k.profilbezug = PROFIL_WORTE.test(text) ? 1 : 0;
  }
  if (art === "analyse") k.begruendung = /weil|\bda\b|denn|deshalb|daher|ursache|liegt (vermutlich|wahrscheinlich)|grund/i.test(text) ? 1 : 0;
  if (art === "kurz") k.knapp = text.length <= 400 ? 1 : 0;
  const v = Object.values(k);
  return { frage, art, punkte: v.reduce((a, b) => a + b, 0), max: v.length, k };
}
export function zusammenfassung(R) {
  const p = R.reduce((a, r) => a + r.punkte, 0),
    m = R.reduce((a, r) => a + r.max, 0);
  const krit = {};
  for (const r of R) for (const [n, v] of Object.entries(r.k)) (krit[n] = krit[n] || [0, 0]), (krit[n][0] += v), (krit[n][1] += 1);
  return { prozent: Math.round((p / m) * 100), punkte: p, max: m, kriterien: Object.fromEntries(Object.entries(krit).map(([n, [a, b]]) => [n, a + "/" + b])) };
}
