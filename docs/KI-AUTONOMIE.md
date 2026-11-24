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

## 2. Geplante Claude-Code-Aufgaben: vorgesehener Aufbau
1. **Voraussetzung:** Die Synchronisierung ist eingerichtet (`SYNCHRONISIERUNG.md`). Die Aufgabe braucht einen privaten Ablageort. Das öffentliche Repository kommt dafür nie in Frage.
2. **Zugriff der Aufgabe auf die Daten:**
   - **Variante A, einfach:** Die Aufgabe ist ein „drittes Gerät“. Der Kopplungscode liegt als geschütztes Umgebungs-Geheimnis in Claude Code. Sie liest den Tresor, ergänzt Entwürfe (Status „Entwurf“) und schreibt zurück.
   - **Variante B, sparsamer mit Daten:** Die Geräte stellen der Aufgabe nur eine **Faktenliste** bereit (`studioFacts`, ohne Vertrauliches). Die Aufgabe liefert ausschließlich Entwürfe zurück.
   - Empfehlung: **B**, sobald die Grundfunktionen stehen.
3. **Wiederkehrende Aufgaben (Vorschlag):**
   - **montags:** Entwürfe für die Woche, Prüfung des Monatsplans
   - **täglich:** Kennzahlen abrufen, Befunde und Maßnahmenkontrolle
   - **monatlich:** Bericht
4. **Grenzen jeder Aufgabe:** Sie unterliegt der Freigabelogik (`js/actions.js`).
   - Sie darf **Entwürfe und Berichte** erstellen.
   - Veröffentlichen darf sie nur bereits Freigegebenes.
   - Stufe-3-Handlungen nie.

## 3. Lokale KI auf iPhone und iPad
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

## 4. Werkzeuge kontrolliert nutzen (vorbereitet)
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

## 5. Fortschritt (ehrliche Einordnung)
- **Hilfreicher Management-Assistent** (Daten, Regeln, Empfehlungen, Maßnahmenkontrolle, Instagram-Studio, Sicherung): **weitgehend vorhanden** in Version 2.2.
- **Weitgehend autonome KI:** etwa **25–30 % des Weges**. Es fehlen:
  1. Synchronisierung aktivieren (deine Entscheidung zum Anbieter)
  2. Kennzahlen-Gegenstelle in der Verwaltung (Rork/Supabase-Auftrag)
  3. Geplante Claude-Aufgaben (wöchentliche Entwürfe, tägliche Prüfung)
  4. Automatische Instagram-Veröffentlichung und Statistiken (Meta-App, Business-Login)
  5. Optional eine KI-API für Echtzeit-Reaktionen (kostenpflichtig, nur mit deiner Zustimmung)
