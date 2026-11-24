# Änderungsprotokoll

## 2.2.0 (Entwicklungszweig, noch nicht veröffentlicht) – Instagram-Studio, Stufe 1

**Neu: Bereich „Studio“**
- **Monatsplan:**
  - 3 Beiträge pro Woche (Wochentage, Uhrzeit und Reels pro Monat einstellbar)
  - Die sechs Themenbereiche werden abwechselnd verteilt.
  - Zu einem Meetup werden Ankündigung und Erinnerung automatisch eingeplant, ohne Doppelungen.
- **KI-Auftrag:** enthält Zielgruppe, Ziele, Tonalität, Regeln und nur erlaubte Fakten. Die komplette KI-Antwort wird eingefügt und als Entwürfe übernommen.
- **Faktenprüfung gegen erfundene Angaben:** Zahlen, Daten, Preise, Zitate oder Erfahrungsberichte, Versprechen, Links, Dubletten.
- **Fertige Grafiken** mit dem offiziellen Logo, den Markenfarben und der Schrift Nunito:
  - Feed 1080×1350 und Story 1080×1920
  - 7 Vorlagen (Titel, Tipp, Info, Frage, Meetup-Ankündigung, Rückblick, Abschluss)
  - Karussells mit Titel- und Abschlussfolie
- **Wochenfreigabe:** Beiträge mit Prüfhinweis brauchen eine Einzelfreigabe. Bearbeiten, Folien ergänzen, Ablehnen, Löschen.
- **Export:** „Teilen (Instagram)“ mit Bildern und kopierter Caption samt Hashtags, außerdem „Bilder speichern“.
- **Auswertung:** Ergebnisse je Beitrag eintragen. Die Planung bevorzugt danach die erfolgreicheren Themenbereiche (als Annahme gekennzeichnet).
- **Selbstständig erkannt:**
  - Meetup ohne Ankündigung → fertiger Entwurf nur aus Fakten
  - Regelmotor-Hinweise: Freigabe nötig, Veröffentlichung fällig, Plan für den nächsten Monat fehlt, Ergebnisse fehlen, Markenprofil unvollständig
- **Markenprofil:** Farben (bestätigt) und Anmeldung über vivalink.me sind voreingestellt. Region, Konto, feste Hashtags, Tabus und Rhythmus sind einstellbar und liegen in den App-Daten, nicht im Code.
- **Reels** (Skript und Szenenliste) sind vorbereitet, standardmäßig 0 pro Monat.

**Erweiterungen in diesem Entwicklungsabschnitt**
- **Studio:**
  - Status Geplant/Fällig, Filter, „Wichtig“-Markierung
  - Prüf- und Stilhinweise, Meetup-Ortsprüfung
  - Captions werden nicht mehr abgeschnitten
  - Logo-Verlauf, 3 Gestaltungsvarianten
  - nur freie Termine planen
  - Änderung nach Freigabe → erneut freigeben
- **Empfehlungen:** Bedeutung, Ursachen (Annahme), priorisierte Maßnahmen. Maßnahmenkontrolle mit vorher/nachher.
- **Startseite:** Statuszeile, Ziele, eingeklappte Kennzahlen.
- **Freigabelogik** (Stufen 0–3) mit Aktionsprotokoll und Veröffentlichungsschutz.
- **Synchronisierung** (Ende-zu-Ende verschlüsselt) und **Verwaltungs-Schnittstelle**: vorbereitet und getestet, nicht aktiv.
- **5 neue Kennzahlen.** Keine Erinnerung an manuelle Backups mehr.

**Sicherung**
- **Automatische lokale Sicherungspunkte:** täglich, die letzten 7 Tage, unter „Mehr“ wiederherstellbar (vorher Rückgängig-Punkt).
- Der Backup-Hinweis erscheint erst nach 30 Tagen und nur unauffällig unter „Alle Hinweise“.

**Technik**
- Datenversion 4 mit geprüfter Sicherheitskopie vor dem Update.
- Studio-Daten sind für die Synchronisierung vorbereitet: Konflikterkennung, Löschvermerke, Backup und Zusammenführen.
- Tests für das Update 2.1 → 2.2 und den Rückbau mit dem originalen Code von 2.1.
- Testversion: „Studio-Demo laden“ (künstlicher Monatsplan ohne KI).

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
  - Demofunktionen sind nur in der Testversion enthalten.
- Freigabeprüfung:
  - Service Worker umgeht den Browser-Zwischenspeicher; Versionsnummer in den Skript-Adressen
  - `.nojekyll`
  - Tests für Update und Rückbau mit dem originalen Code von Version 1

## 2.0 (Claude-Artefakt, 23.11.2026)
Kennzahlen, nächstes Meetup, Regelmotor, Sicherheitskopie.

## 1.0 (GitHub Pages)
Gedächtnis, Aufgaben, Arbeitsaufträge, Backup, WebGPU-Test, KI-Test.
