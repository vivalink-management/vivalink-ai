# Weg zu einer weitgehend selbstständigen Management AI: realistische Bewertung

## 1. Was mit den vorhandenen Abonnements möglich ist (ohne Zusatzkosten)

| Weg | Was geht | Was nicht geht | Kosten |
|---|---|---|---|
| **Claude Pro: Chat** | Analysen, Texte, Monatspläne per Kopieren und Einfügen (heute im Einsatz) | kein Zugriff der App auf Claude ohne dich | im Abo |
| **Claude Pro: geplante Claude-Code-Aufgaben** | Zeitgesteuerte Cloud-Sitzungen, frühestens stündlich, z. B. montags: Fakten lesen, Wochen- oder Monatsplan im Studio-Format erstellen, Entwürfe ablegen, Bericht schreiben, Tests und technische Prüfungen ausführen | kein garantierter Dauerbetrieb: Ist das Pro-Kontingent erschöpft, fällt ein Lauf aus. Kein Zugriff auf iPhone/iPad direkt. | im Abo |
| **ChatGPT Plus** | manuelle Nutzung, Bilderzeugung, Aufgaben-Erinnerungen in ChatGPT | keine Schnittstelle, über die die App ChatGPT nutzen könnte. Ergebnisse gelangen nur per Kopieren in die App. | im Abo |
| **Claude- oder OpenAI-API** | echte Programmsteuerung, jederzeit, aus dem Server | – | **kostenpflichtig pro Nutzung**, nicht im Pro- oder Plus-Abo enthalten. Nur nach deiner Zustimmung. |
| **Lokale KI im Browser (WebGPU)** | kurze Texte offline und privat | komplexe Analysen, verlässliches Deutsch | 0 € |

**Ehrliche Einschätzung:** Mit den vorhandenen Abos lässt sich ein **regelmäßig selbstständig arbeitender Assistent** bauen:
- Er läuft wöchentlich oder täglich über geplante Claude-Code-Aufgaben.
- Der Regelmotor in der App läuft immer, ohne KI.

Eine KI, die **jederzeit sofort** auf Ereignisse reagiert, braucht eine API. Die kostet pro Nutzung; bei moderater Nutzung schätzungsweise wenige Euro im Monat. Diese Entscheidung liegt bei dir.

## 2. Autonomie-Zyklus und Berechtigungen (in Version 2.3 umgesetzt)
**Zyklus** (`js/autonomy.js`): Er läuft beim Start, beim Wiederöffnen (höchstens alle 6 Stunden) und auf Knopfdruck. Bericht unter „Mehr › Autonomie“.

| Schritt | Was passiert | Stufe |
|---|---|---|
| 1. Daten erfassen | lokale Daten; Synchronisierung und Verwaltung, sobald angebunden | 0 |
| 2. Analysieren | Regelmotor (Fakten und Annahmen getrennt) | 0 |
| 3. Aufgaben erkennen | „Heute zu tun“ mit Begründung und Reihenfolge | 0 |
| 4. Maßnahmen entwickeln | priorisierte Vorschläge mit Nutzen, Aufwand, Dringlichkeit, Risiko | Start: 2 |
| 5. Entwürfe erstellen | Instagram-Entwürfe nur aus bestätigten Fakten (Ankündigung, Erinnerung, Rückblick mit Platzhaltern) | 0 |
| 6. Freigaben einholen | warten auf dich – oder automatisch mit Berechtigung | 2 |
| 7. Freigegebenes ausführen | Veröffentlichung: heute manuell, später über den Worker | 2 |
| 8. Ergebnisse prüfen | Maßnahmenkontrolle zum Prüftermin, ohne Ursachenbehauptung | 0 |

**Berechtigungen:** Eine Handlung der Stufe 2 läuft nur dann automatisch, wenn du eine Berechtigung erteilt hast.
- **Befristet:** höchstens 3 Monate.
- **Begrenzt:** höchstens n pro Tag oder Woche; die Grenze hält auch bei gleichzeitigen Abläufen.
- **Jederzeit widerrufbar.**
- **Synchronisiert und protokolliert:** Jede automatische Nutzung steht mit Verweis auf die Berechtigung im Aktionsprotokoll.
- **Zurzeit erteilbar:**
  - „Beiträge ohne Prüfhinweis automatisch freigeben“ (nur Termine in den nächsten 7 Tagen, nie Demo)
  - „Freigegebene Beiträge automatisch veröffentlichen“ (wirkt erst nach der Instagram-Anbindung)
- **Stufe 3 ist nicht erteilbar:** Preise, Zahlungen, Werbung, Produktivsysteme, kostenpflichtige Dienste.

## 3. Geplante Claude-Aufgaben: Aufgaben-Postfach (fertig und getestet, Aktivierung nach Worker-Einrichtung)
**Ablauf (wöchentlich, Vorschlag montags früh):**
1. Die App legt automatisch einen Auftrag ins Postfach „out“ (höchstens alle 20 Stunden erneuert):
   - **Instagram:** freie Termine der nächsten 14 Tage, Regeln, ausschließlich öffentliche Fakten
   - **Wochenanalyse:** Wochenbericht, zusammengefasste Kennzahlen, offene Aufgaben, Befunde (ohne vertrauliche Einträge, ohne Geschäftsmodell-Interna, ohne Personendaten)
2. Die geplante Claude-Aufgabe (Claude Code, im Pro-Abo, Umgebung „Vivalink“):
   - holt den Auftrag mit `node scripts/ki-aufgabe.mjs holen`
   - schreibt Instagram-Entwürfe sowie eine Wochenanalyse mit höchstens 5 Aufgabenvorschlägen
   - prüft mit `pruefen` und gibt mit `abgeben` zurück
3. Die App holt das Ergebnis beim nächsten Öffnen selbst ab:
   - Beiträge nur als **Entwürfe** (mit Faktenprüfung)
   - Analyse als **Einschätzung** im Gedächtnis
   - Aufgaben als **Vorschläge** unter „Entscheidungen für dich“: Du wählst aus; Preise, Zahlungen, Werbung und Verträge nur als Entscheidung

**Sicherheit:**
- Ein zufälliges Postfach-Token (256 Bit) öffnet nur die beiden Postfächer, nie den Daten-Tresor.
- In der Claude-Umgebung ist es ein **geschützter Netzwerkschlüssel**: Der Proxy setzt ihn ein, die Claude-Sitzung sieht ihn nie. Er steht nie im Repository.
- Ergebnisse werden nach der Übernahme gelöscht; Postfächer laufen nach 21 Tagen ab.
- **Bewusste Abwägung:** Die Postfach-Inhalte (öffentliche Fakten, zusammengefasste Kennzahlen, Aufgabentitel) sind bei Cloudflare nicht Ende-zu-Ende verschlüsselt, weil die Claude-Sitzung sie lesen muss und dort keine geheimen Schlüssel liegen dürfen. Vertrauliches wird nie übertragen. Der Daten-Tresor bleibt Ende-zu-Ende verschlüsselt.

**Angelegt:**
- **„Vivalink: technische Wartung (wöchentlich)“** (montags 4:43 Uhr, Umgebung „Vivalink“):
  - Tests, Abgleich der veröffentlichten Version
  - Fehlerbehebung auf eigenem Zweig, ohne Veröffentlichung
  - Hinweis: Geplante Aufgaben haben keinen GitHub-Connector. Die Korrektur liegt dann auf einem Zweig; den Pull Request legt Claude in einer normalen Sitzung an.
- **Erprobt (Testversion, echter Server):** Auftrag abgeholt, 7 Entwürfe, Wochenanalyse und 3 Aufgabenvorschläge zurückgegeben. Die App hat alles korrekt übernommen und geprüft.

- **„Vivalink: Instagram-Entwürfe und Wochenanalyse (wöchentlich)“** (montags 5:17 Uhr, Umgebung „Vivalink“): eingerichtet am 25.11.2026.
  - Postfach-Schlüssel als geschützter Netzwerkschlüssel hinterlegt; Verbindung geprüft (Auftrag der echten App abholbar).
  - Ergebnisse holt die App beim nächsten Öffnen selbst ab.

**Einrichtung der Inhalts- und Analyseaufgabe (erledigt; Ablauf zur Erinnerung):**
1. Du tippst in der App **Mehr › Autonomie › Geplante KI-Aufgaben › Einrichten** und kopierst den Schlüssel.
2. Claude öffnet ein sicheres Formular für die Worker-Adresse (Header `x-vl-task-token`); du fügst den Schlüssel dort ein.
3. Claude legt die geplanten Aufgaben an:
   - wöchentliche Inhalte und Analyse
   - wöchentliche technische Wartung: Tests ausführen, Fehler auf einem eigenen Zweig beheben, Pull Request; ohne Veröffentlichung

## 4. Lokale KI auf iPhone und iPad
- **Geräte laut KI-Test:** iPhone 16 Pro (8 GB Arbeitsspeicher), iPad mit A16-Chip.
- **Speichergrenze:** Safari erlaubt einer Webseite in der Praxis nur etwa 1,5–3 GB, darüber wird die Seite neu geladen.
- **Realistische Modelle (WebLLM, 4-Bit):**
  - Llama 3.2 1B (ca. 0,9 GB) und Qwen 2.5 1.5B (ca. 1,1 GB): laufen voraussichtlich, langsam bis mittel.
  - Phi-3.5-mini (ca. 2,2 GB) und größere Modelle sind wahrscheinlich zu groß.
- **Qualität im Deutschen:** Modelle mit 1–2 Milliarden Parametern machen spürbar Grammatik- und Faktenfehler.
- **Geeignet nur für:**
  - Varianten einer Caption umformulieren
  - Hashtag-Vorschläge
  - kurze Zusammenfassungen
  - einfache Einordnung von Texten
- **Ungeeignet für:** Strategie, Analysen, alles mit Fakten.
- **Empfehlung:** vorerst **nicht einbauen**.
  - Der Download von über 1 GB pro Gerät und die Wartezeiten stehen in keinem Verhältnis zum Nutzen.
  - Die Arbeitsaufträge und später die geplanten Claude-Aufgaben liefern deutlich bessere Ergebnisse.
  - Der vorhandene KI-Test (Mehr › KI-Test) bleibt, um das später mit echten Messwerten neu zu bewerten.

## 5. Werkzeuge kontrolliert nutzen (vorbereitet)
- **Freigabelogik** (`js/actions.js`): Jede Handlung hat eine Stufe.
  - Stufe 0: automatisch
  - Stufe 1: automatisch mit Rückgängig-Punkt
  - Stufe 2: nur nach Freigabe
  - Stufe 3: nie automatisch (Preise, Zahlungen, bezahlte Werbung, Produktivsysteme, kostenpflichtige Dienste)
- Unbekannte Handlungen werden abgelehnt.
- Alles wird im **Aktionsprotokoll** festgehalten (Mehr › Diagnose).
- **Vorgesehene Werkzeuge**, jeweils serverseitig im selben kostenlosen Worker, mit Zugangsdaten nur dort:

| Werkzeug | Stufe | Stand |
|---|---|---|
| Instagram: veröffentlichen | 2 | Schutz vor doppelter oder nicht freigegebener Veröffentlichung fertig und getestet; Anbindung siehe `INSTAGRAM-AUTOMATIK.md` |
| Instagram: Statistiken | 0 | Datenmodell (`metrics` je Beitrag) und Lernlogik fertig |
| Vivalink-Verwaltung: Kennzahlen lesen | 0 | Client fertig und getestet; Gegenstelle laut `AUFTRAG-VERWALTUNG.md` |
| Kalender (z. B. Meetup-Termine) | 0 lesen / 2 schreiben | nicht begonnen |
| Canva | – | nicht nötig: Die Grafiken entstehen kostenlos in der App. Canvas Schnittstelle für automatische Vorlagen ist nach unserem Kenntnisstand Enterprise-Kunden vorbehalten. |
| Website-Statistiken | 0 | erst, wenn ein datenschutzfreundliches Statistikwerkzeug auf vivalink.me genutzt wird |

## 6. Fortschritt (ehrliche Einordnung, Stand 2.3)
- **Hilfreicher Management-Assistent:** **weitgehend vorhanden** (ca. 80–85 %).
  - Daten, Regeln, Empfehlungen mit Risiken, „Heute zu tun“, Maßnahmenkontrolle
  - Instagram-Studio mit fertigen Grafiken
  - Sicherung und Robustheit
- **Weitgehend autonome KI:** etwa **35–40 % des Weges**. Die Architektur (Zyklus, Berechtigungen, Protokoll, Aufgaben-Kanal, sichere Synchronisierung) steht. Es fehlen die Anbindungen:
  1. Synchronisierungs-Server einrichten (deine Entscheidung zum Anbieter; kostenlos)
  2. Geplante Claude-Aufgabe anlegen (im Pro-Abo)
  3. Kennzahlen-Gegenstelle in der Verwaltung (Rork/Supabase-Auftrag)
  4. Instagram-Veröffentlichung und Statistiken (Meta-App, Business-Login)
  5. Optional eine KI-API für Reaktionen in Echtzeit (kostenpflichtig, nur mit deiner Zustimmung)
