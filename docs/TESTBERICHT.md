# Testbericht

## Version 2.2.0 – Instagram-Studio (Entwicklungszweig, nicht veröffentlicht)

| Prüfung | Ergebnis |
|---|---|
| Neue Studio-Tests (13): Markenprofil, Monatsplan, Faktenprüfung, KI-Antwort, Grafiken, Wochenfreigabe, Bearbeiten, Export Feed/Story, Teilen, Auswertung und Lernen, automatische Meetup-Entwürfe ohne Doppelungen, Regelmotor-Hinweise, Synchronisierungs-Tauglichkeit, manipulierte KI-Antworten, Sicherungspunkte, 30-Tage-Hinweis | ✅ lokal |
| Update **2.1 → 2.2** und Rückbau 2.2 → 2.1 → 2.2 mit dem **originalen Code von 2.1** (`tests/fixtures/legacy-v21`) | ✅ lokal |
| Alle bisherigen Tests (Regression V1/V2/2.1, Migration, Backup, Konflikte, Sicherheit, Diagnose, PWA, Testversion) | ✅ lokal |
| GitHub Actions (Chromium + WebKit, Desktop/iPhone/iPad) | siehe Pull Request |
| Sichtprüfung der Grafiken (alle Vorlagen, Feed und Story) und der Studio-Oberfläche auf iPhone-Breite | ✅ Layout überarbeitet |

**Während der Entwicklung gefundene und behobene Fehler**
1. Ein bestätigter Fakt mit dem Wort „kostenlos“ ließ jede Preisangabe durch. Jetzt muss jeder Betrag genau so in den Fakten stehen.
2. Die Faktenprüfung erkannte das Datum „12.3.2026“ nicht als erlaubt, sondern nur „2026-03-12“. Jetzt werden alle üblichen Schreibweisen erkannt.
3. Die Dublettenerkennung war bei kurzen Einstiegssätzen zu empfindlich.
4. Meetup-Ankündigungen wären doppelt entstanden (Automatik und Monatsplan). Beide Wege kennen sich jetzt gegenseitig.
5. Der Test-Build kopierte die Markendateien nicht. Der Service Worker der Testversion hätte sich deshalb nicht installieren lassen.

---

# Testbericht Version 2.1.0

Stand: 23.11.2026 · Zweig `claude/vivalink-ai-audit-5jsxqp` · **nicht veröffentlicht, nicht in `main`**

## Zusammenfassung

| Prüfung | Ergebnis |
|---|---|
| Prüfung auf vertrauliche Inhalte (33 Dateien) | ✅ bestanden |
| Syntax, doppelte Namen, Offline-Dateiliste | ✅ bestanden |
| Automatische Tests: 49 Tests × 3 Varianten (Chromium Desktop, iPhone-Bildschirm, iPad-Bildschirm) | ✅ 147/147 |
| Stabilität: Gesamtlauf 5× wiederholt | ✅ 735/735, keine instabilen Tests |
| Sichtprüfung der neuen Ansichten auf iPhone-Breite (Bildschirmfotos) | ✅ kein seitliches Scrollen, Darstellung angepasst |
| GitHub Actions, Lauf 1 (Chromium + WebKit, 5 Varianten) | ❌ 243/245. Nur der Offline-Test in WebKit (iPhone, iPad) schlug fehl, siehe unten |
| GitHub Actions, Lauf 3 nach Korrektur (Chromium + WebKit, 5 Varianten) | ✅ 245/245 |
| Getrennte Testversion: 4 zusätzliche Tests (Speicher, Demodaten, Offline-Speicher-Trennung inkl. Gegenprobe) | ✅ GitHub Actions Lauf 5/6: 265/265 |
| **Freigabeprüfung:** 3 Tests mit dem **originalen Code von Version 1** (Update, Rückbau, V1-Backups) | ✅ lokal; CI siehe Pull Request #1 |
| Gesamt lokal nach Freigabeprüfung: 56 Tests × 3 Varianten, 2× wiederholt | ✅ 336/336 |
| Echte Geräte (iPhone, iPad) in der getrennten Testversion | ✅ vom Gründer gemeldet: iPad (Demodaten, Backups, Import, Konflikte, Rückgängig, Diagnose), iPhone (Demodaten, Empfehlungen, Kennzahlen, Offline im Flugmodus, Diagnose); bestehende App unverändert |
| Produktive Freigabe | ⏳ ausstehend, nur durch den Gründer |

Alle Tests verwenden ausschließlich künstliche Daten (`tests/fixtures.mjs`). Jeder Test prüft zusätzlich, dass keine JavaScript-Fehler auftreten. Die meisten Tests prüfen außerdem, dass keine Anfrage an fremde Server geht.

## Testfälle

**Regression – bestehende Funktionen aus V1 und V2 (10 Tests)**
- Startseite, Navigation, alle 11 Kennzahlen, kein fest eingebauter Unternehmenswert
- Aufgaben:
  - anlegen inklusive Pflichtfeld
  - Sortierung, überfällig, erledigen, wieder öffnen
  - Persistenz nach Neuladen
- Gedächtnis:
  - anlegen, ändern mit Pflichtgrund, Verlauf
  - ersetzte Einträge zeigen, Suche, Kategoriefilter
- Datenschutzfilter (E-Mail, Telefon)
- Arbeitsaufträge:
  - alle 7 Vorlagen, Kennzahlen und Befunde im Auftrag
  - Vertrauliches ausgeschlossen und zuschaltbar
  - Kompaktmodus, Aufgaben abwählen, Kategorien, Zusatzinfo, Kopieren
  - Antwort verwerfen, als Einschätzung speichern, „bestätigt“ nur mit Häkchen
- Kennzahlen: Eingabeprüfung, Wert, Ziel, 7-Tage-Vergleich, Entfernen, früherer Stand
- Nächstes Meetup
- Regelmotor: Befund als Aufgabe, Später, Nicht relevant, alle Hinweise
- Mehr: WebGPU-Hinweis, KI-Test speichern und kopieren, Akzentfarbe, Versionsanzeige

**Migration (5 Tests)**
- V1 → 3: alle Datensätze unverändert, geprüfte Sicherheitskopie, keine Startwerte
- V2 → 3: Kennzahlen, Meetup und Ausblendungen unverändert
- Wiederholbarkeit
- Wiederherstellen mit Rückgängig-Punkt
- leerer Start

**Backup (9 Tests)**
- Neues Format mit Prüfsumme und KI-Tests
- „Letztes Backup“ erst nach Erfolg; bei gesperrter Zwischenablage erst nach „Backup prüfen“
- Selbsttest „0 Einträge übernommen“ wie bisher
- Alte V1- und V2-Backups
- **Szenario iPhone (V1) + iPad (V1) + Artefakt (V2) ohne Verlust und ohne Scheinkonflikte**
- Rückgängig
- Abgeschnittene und manipulierte Backups werden abgelehnt, ohne Änderung
- Kennzahlen-Import mit ungültigen Werten
- Datei-Export

**Konflikte (8 Tests)**
- Gedächtnis-Verzweigung: Erkennung, Befund, Entscheidung für eine Version oder „beide behalten“, nichts gelöscht
- Aufgabe auf zwei Geräten geändert: andere Version übernehmen, kein Wiederauftauchen beim erneuten Import
- Weiterentwicklung ist kein Konflikt
- Ältere Daten ohne Historie: möglicher Konflikt
- Kennzahl-Ziel, Kennzahl-Wert
- Erkennung beim Start

**Sicherheit (5 Tests)**
- Manipuliertes Backup mit HTML und Skripten: nur als Text sichtbar, ungültige Datensätze übersprungen
- KI-Antwort mit HTML
- Rundgang durch alle Ansichten ohne Richtlinienverstoß und ohne fremde Server
- Richtlinie blockiert eingeschleuste Skripte und protokolliert das
- Keine Schlüssel im Backup

**Diagnose (6 Tests)**
- Diagnoseseite und Bericht ohne Inhalte
- Fehler und abgelehnte Promises werden protokolliert, persönliche Daten unkenntlich gemacht, als Befund gemeldet
- Zusammenfassen gleicher Fehler, Begrenzung auf 200 Einträge
- Simulierter Speicherausfall wird erkannt
- Integritätsprüfung
- Migration im Protokoll

**Home-Bildschirm / Offline (3 Tests)**
- Manifest, Icons, Apple-Angaben
- Alle Offline-Dateien vorhanden
- Service Worker aktiv, App startet offline mit Daten

**Regelmotor mit fester Testuhr (3 Tests)**
- Erwartete Befunde inklusive Fakt/Annahme und Sortierung
- Höchstens 3 Hinweise auf der Startseite
- Ausblendung und Aufgabe unterdrücken den Befund
- Ohne Auffälligkeiten kein Handlungsbedarf

## Während der Entwicklung gefundene und behobene Fehler
1. Ein unverändertes Backup hätte beim erneuten Einlesen Scheinkonflikte erzeugt (leere Felder wurden unterschiedlich behandelt). Behoben, durch Test abgesichert.
2. Ein Kennzahl-Ziel aus Version 2 ohne eigenen Zeitstempel hätte beim Import still überschrieben werden können. Behoben.
3. Nach dem Übernehmen der „anderen Version“ wäre derselbe Konflikt beim erneuten Import wieder aufgetaucht. Behoben, durch Test abgesichert.
4. Die Vorschau des Kennzahlen-Imports zeigte nicht, wie viele Werte übersprungen werden. Behoben.
5. Bekannte Mängel aus der Bestandsaufnahme behoben:
   - „Letztes Backup“ wurde vor dem Kopieren gesetzt
   - KI-Tests fehlten im Backup
   - Speichern der KI-Tests ohne Bestätigung
   - unmaskierte IDs
   - veralteter Hinweistext
   - parallele Änderungen ohne Hinweis

## Freigabeprüfung (vor der Veröffentlichung)

Durchsicht des gesamten Pull Requests auf technische Fehler, Sicherheit, unbeabsichtigte Änderungen und Datenverlust. Ergebnis und Maßnahmen:

1. **Behoben – veraltete Dateien direkt nach einem Update.**
   - GitHub Pages erlaubt Browsern bis zu 10 Minuten Zwischenspeicherung. Der Service Worker hätte dadurch die alte Startseite in den neuen Offline-Speicher übernehmen oder alte und neue Programmdateien mischen können.
   - Jetzt: Vorabspeicherung mit `cache: "reload"`, Netzabrufe mit `cache: "no-cache"`, Versionsnummer in den Skript-Adressen (`?v=2.1.0`).
   - Die automatische Prüfung erzwingt einheitliche Versionsnummern.
2. **Behoben – Demofunktionen in der produktiven App.**
   - Sie waren bisher enthalten, aber inaktiv. Jetzt liegen sie nur noch in `test-build/demo.js` und werden ausschließlich in die Testversion eingebaut.
   - Automatisch geprüft: In der produktiven App gibt es keine Demofunktion, keinen Testkanal und keinen geänderten Speichernamen.
3. **Behoben – mögliche Umwandlung durch Jekyll.** `.nojekyll` ergänzt: GitHub Pages liefert die Dateien unverändert aus.
4. **Geprüft, kein Befund – Maskierung.** Alle Stellen, an denen Daten in die Oberfläche gelangen, sind maskiert. Zusätzlich blockiert die Content-Security-Policy eingeschleuste Skripte.
5. **Geprüft – Aktualisierung mit dem originalen Code von Version 1** (`tests/fixtures/legacy-v1` = `main`, Stand `f32f745`). In Version 1 werden über die Oberfläche angelegt:
   - eine Aufgabe
   - ein Gedächtnis-Eintrag, danach geändert (mit Verlauf)
   - ein KI-Testergebnis
   - ein Backup

   Danach liefert derselbe Server Version 2.1 aus. Ergebnis:
   - alle Datensätze unverändert, Datenversion 3
   - geprüfte Sicherheitskopie und KI-Tests erhalten
   - alter Offline-Speicher entfernt, neuer enthält die neue Startseite
   - das Version-1-Backup ist lesbar und bereits vollständig enthalten
   - offline lauffähig
6. **Geprüft – Rückbau.** 2.1 → Version 1 → 2.1: Kennzahlen, Meetup, Ausblendungen und Gedächtnis bleiben unverändert. Eine während des Rückbaus angelegte Aufgabe bleibt erhalten.
7. **Geprüft – Backups aus Version 1** (mit originalem Code erzeugt) lassen sich auf einem anderen Gerät mit 2.1 übernehmen.
8. **Nicht vermeidbar:**
   - Der auf den Geräten installierte Service Worker von Version 1 nutzt den Zwischenspeicher. Direkt nach der Veröffentlichung kann daher bis zu etwa 10 Minuten noch Version 1 erscheinen. Das ist harmlos und in `VEROEFFENTLICHUNG.md` beschrieben.
   - Ab 2.1 tritt das nicht mehr auf.

## Befund aus GitHub Actions (WebKit)
Lauf 1: Alle 49 Tests bestanden in Chromium. In WebKit bestanden alle Tests außer „App startet offline“.
- Beim Neuladen meldete Playwright „WebKit encountered an internal error“, also einen Fehler der Testumgebung.
- Direkt davor war im selben Test nachweislich der Service Worker aktiv und der Offline-Speicher gefüllt. Die App meldete keinen Fehler.
- Ursache: die Offline-Simulation `context.setOffline` von Playwright in WebKit.

Korrektur: Der Test simuliert „offline“ jetzt realistischer. Er startet einen eigenen Testserver, beendet ihn, prüft, dass dieser wirklich nicht mehr erreichbar ist, und lädt die App erst dann neu. Der Test wurde nicht übersprungen oder abgeschwächt.

## Nicht automatisch prüfbar
- Teilen-Menü und Dateien-App auf iOS (`navigator.share`). Getestet ist nur der Download-Weg.
- Verhalten von iOS bei Speichermangel, Persistenz-Anfrage auf echten Geräten
- Aktualisierung des installierten Home-Bildschirm-Symbols von V1 auf 2.1

Diese Punkte enthält die Checkliste in `GERAETETEST.md`.

## Tests selbst ausführen
```bash
npm ci && npm run test:local
```
