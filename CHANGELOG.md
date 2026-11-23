# Änderungsprotokoll

## 2.1.0 (Entwicklungszweig, noch nicht veröffentlicht)

Zusammenführung von Version 1 (GitHub Pages) und Version 2 (Claude-Artefakt). Grundlage ist Version 2.

**Übernommen aus Version 2:** Kennzahlen, nächstes Meetup, Regelmotor, Befunde als Aufgabe, Sicherheitskopie vor dem Update, Kennzahlen-Import, Persistenz-Anfrage.
**Übernommen aus Version 1:** Manifest, Icons, Apple-Angaben, Service Worker (Home-Bildschirm und Offline).
**Entfernt:** ein fest eingebauter historischer Unternehmenswert. Kennzahlen starten jetzt leer. Bereits auf einem Gerät gespeicherte Werte bleiben erhalten. Außerdem ungenutzter Altcode (`recs`), der in Version 2 durch den Regelmotor ersetzt worden war.

**Neu**
- Datenversion 3 mit automatischer, geprüfter Sicherheitskopie vor jeder Migration (Version 1 → 3 und 2 → 3).
- Backup:
  - neues Format mit SHA-256-Prüfsumme, KI-Testergebnisse eingeschlossen
  - „Als Datei sichern“
  - „Backup prüfen“ (verändert nichts)
  - Vorschau vor dem Zusammenführen
  - Rückgängig-Punkt vor jedem Import
  - „Letztes Backup“ wird nur nach nachweislichem Erfolg gesetzt
- Ältere Backups (Version 1 und 2) bleiben lesbar.
- Konflikterkennung:
  - Jede Änderung merkt sich ihren Vorgängerstand. Unabhängige Änderungen auf zwei Geräten werden als Konflikt angezeigt, statt still überschrieben zu werden.
  - Verzweigungen im Gedächtnis werden erkannt.
  - Entscheidung unter „Mehr › Datenkonflikte“. Nichts wird gelöscht.
- Diagnoseseite mit App- und Datenversion, Speichertest, Offline-Status, Integritätsprüfung und Diagnosebericht ohne Inhalte.
- Technisches Fehlerprotokoll: JavaScript-Fehler, Speicherfehler, Sicherheitsverstöße, Migrationen und Importe. Persönliche Daten und längere Zahlen werden unkenntlich gemacht.
- Regelmotor meldet offene Datenkonflikte und technische Fehler.
- Sicherheit:
  - Content-Security-Policy (keine fremden Skripte, keine fremden Server)
  - Eingangsprüfung für importierte Daten
  - alle IDs in der Oberfläche maskiert
- Service Worker: versionierter Offline-Speicher, speichert nur erfolgreiche Antworten der eigenen Seite.
- Automatische Tests (Playwright) und GitHub-Actions-Ablauf. Prüfung auf vertrauliche Inhalte.
- Getrennte Testversion (`scripts/build-test.mjs`, Anleitung `docs/TESTVERSION.md`):
  - eigener Speicher, eigener Offline-Speicher, eigenes Symbol
  - künstliche Demodaten
  - Die echte App und die Testversion löschen gegenseitig keine Offline-Speicher.

## 2.0 (Claude-Artefakt, 23.11.2026)
Kennzahlen, nächstes Meetup, Regelmotor, Sicherheitskopie.

## 1.0 (GitHub Pages)
Gedächtnis, Aufgaben, Arbeitsaufträge, Backup, WebGPU-Test, KI-Test.
