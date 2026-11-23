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
| Getrennte Testversion: 4 zusätzliche Tests (Speicher, Demodaten, Offline-Speicher-Trennung inkl. Gegenprobe) | ✅ lokal; CI siehe Pull Request #1 |
| Echte Geräte (iPhone, iPad) | ⏳ **ausstehend**, siehe `TESTVERSION.md` |
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
