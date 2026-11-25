# Änderungsprotokoll

## 2.7.0 (Entwicklungszweig, noch nicht veröffentlicht) – Anbindung der Vivalink-Verwaltung

- **Gegenstelle der Verwaltung** (Edge Function, nicht bereitgestellt):
  - liest nur vorhandene Auswertungen laut `mapping.json`, je Kennzahl nur Datum und Zahl
  - eigene Rolle ohne Zugriff auf Personendaten, READ-ONLY, eigenes Schema, keine Änderung bestehender Objekte
  - Kopplungscodes (8 Ziffern, 10 Minuten, Sperre nach Fehlversuchen), widerrufbare Gerätezugänge, Begrenzung, CORS, 503 ohne Einzelheiten
- **Getrennte Testumgebung:** eigenes PostgreSQL + Edge Function unter Deno, künstliche Verwaltung; läuft bei jedem Testlauf
- **App:** erkennt Widerruf (kein Dauerabruf), wachsende Pause nach Fehlern, Zeitlimit, Hinweis bei gestörter Anbindung, letzter Fehler sichtbar
- **Werkzeuge:** `scripts/verwaltung.mjs` (lesende Bestandsaufnahme, Rechte-SQL, Bereitstellungsordner)
- Wartungsaufgabe meldet ihr Ergebnis an die Überwachung; Inhaltsaufgabe meldet Probleme
- Datenversion unverändert (4)

## 2.6.0 (veröffentlicht am 25.11.2026) – Überwachung, bessere Analysen, Studio-Feinarbeit, Verwaltung vorbereitet

- **Überwachung der geplanten KI-Aufgaben** (Mehr › Autonomie):
  - je Aufgabe Status, Rhythmus, letzter belegter Erfolg, Ergebnis, nächster Termin
  - erkennt ausgebliebene oder fehlgeschlagene Läufe und meldet sie als Befund
  - Erfolg nur mit Beleg (Zeitstempel und Inhalt)
- **Ergebnis-Postfach als Liste:**
  - mehrere Rückmeldungen gehen nicht verloren, atomares Leeren
  - Rückmeldung der Wartung per `ki-aufgabe.mjs melden`
- **Wochenbericht:**
  - Vergleich mit der Vorwoche, 4-Wochen-Trend je Kennzahl
  - automatisch erkannte wichtige Entwicklungen
  - Empfehlungen nach deiner Zielrangfolge, Erfolgskontrolle der Maßnahmen
  - frühere Berichte und eine Anleitung zum Vergleich gehen an die wöchentliche Claude-Analyse
- **Studio:**
  - automatische Feinarbeit an KI-Entwürfen (transparent angezeigt): fehlender Anmelde-Hinweis, #Vivalink, laute oder zu viele Emojis, Leerzeilen
  - Kennzeichnung „Freigabebereit“ und Sammelfreigabe der nächsten 14 Tage
- **Verwaltung (vorbereitet):**
  - Oberfläche zum Koppeln, automatischer Abruf höchstens alle 6 Stunden
  - Gegenstelle mit Zuordnung der vorhandenen Auswertungen, Supabase-Vorlagen
  - alles mit künstlichen Daten getestet, nichts an Supabase verändert

## 2.5.0 (veröffentlicht am 25.11.2026) – Synchronisierung über Cloudflare vorbereitet, Aufgaben-Postfach für geplante Claude-Aufgaben

- **Server:** Cloudflare Worker mit D1-Speicher.
  - atomare Versionsprüfung: gleichzeitiges Schreiben kann nie still überschreiben
  - Ablaufzeiten und tägliches Aufräumen
  - Zugriff nur für die eigene App-Adresse (Browser) bzw. mit Token
- **Aufgaben-Postfach:**
  - Auftrag mit Instagram-Terminen und Wochenanalyse (ohne Vertrauliches)
  - Rückgabe von Entwürfen, Analyse und Aufgabenvorschlägen
  - Zugang über ein Token, das in Claude als geschützter Netzwerkschlüssel liegt
- **App:**
  - holt Ergebnisse im Zyklus selbst ab und erneuert den Auftrag
  - Vorschläge erscheinen unter „Entscheidungen für dich“
- **Tests:**
  - Der echte Worker läuft in der Cloudflare-Laufzeit (wrangler dev) bei jeder Änderung mit: Kopplung, Synchronisierung, Konflikt, gleichzeitiges Schreiben, Schlüsselwechsel, Herkunftsprüfung, Aufgaben-Postfach.
  - Die Speicherlogik wird mit SQLite geprüft.
- **Server eingerichtet:**
  - `vivalink-sync` im bestehenden Cloudflare-Konto (kostenlos), D1 in der EU
  - Webseite vivalink.me nachweislich unverändert
- **Anbindung:**
  - Testversion angebunden und live geprüft (Chromium und WebKit)
  - echte App vorbereitet: Server-Adresse und CSP nur für diesen Server
  - Es wird nichts gesendet, bevor auf dem Gerät eine Synchronisierung eingerichtet ist (getestet).
- **Prüfung:**
  - Zitat- und Erfahrungsberichtsprüfung erkennt Namen nur noch mit Großschreibung (vorher Fehlalarm bei „erzählt und …“).
  - Meetup-Beiträge aus KI-Antworten werden nicht doppelt angelegt.
- **Planung:** Blickwinkel werden über den Monatswechsel nicht wiederholt.
- **Geplante Claude-Aufgabe „technische Wartung“** (wöchentlich) angelegt.
- **Veröffentlichung von 2.4:** am 25.11.2026 freigegeben und geprüft (Update von 2.1 mit erhaltenen Daten unter der echten Adresse simuliert).

## 2.4.0 (Entwicklungszweig, noch nicht veröffentlicht) – Assistenz und automatische Qualitätssicherung

**Neu**
- **KI-Antwort → Aufgaben:**
  - Strategie-, Wochen-, Problem- und Entscheidungsaufträge verlangen am Ende einen Aufgabenblock.
  - „Aufgaben aus der Antwort übernehmen“ zeigt die Vorschläge zur Auswahl, mit Frist, Priorität und Reihenfolge.
  - Ähnliche bestehende Aufgaben werden erkannt und nicht vorausgewählt.
  - Preise, Zahlungen, bezahlte Werbung und Verträge werden nur als „Entscheidung nötig“ angelegt und erscheinen unter „Entscheidungen für dich“.
- **Wochenbericht:**
  - automatisch aus den Daten, ohne KI und ohne Ursachenbehauptungen
  - wird jede Woche abgelegt
  - lässt sich kopieren oder im Gedächtnis speichern
- **Selbstreparatur (Stufe 1):** Verwaiste Verweise und ungültige Fristen werden im Zyklus automatisch behoben, mit Rückgängig-Punkt und Protokoll.

**Qualität**
- **Automatische Oberflächenprüfung** aller Ansichten und Fenster:
  - Überlaufen, abgeschnittene Inhalte, kleine Tippflächen, verdeckte Leisten
  - iPhone, iPad, 375 px und 320 px; in GitHub Actions zusätzlich WebKit
- **Behoben:** Statuszeile und Aktionsleiste ragten bei 320 px (iPhone SE, vergrößerte Anzeige) aus dem Bildschirm.
- **Arbeitsweise in `CLAUDE.md` festgelegt:** Claude prüft selbst, Gerätetests nur bei begründetem Restrisiko.

## 2.3.0 (Entwicklungszweig, noch nicht veröffentlicht) – Studio-Qualität, Bedienung, Management, Autonomie

**Instagram-Studio**
- **Grafiken:**
  - Verlauf entlang des echten Logo-Verlaufs (11 Farbstufen)
  - 4 Gestaltungen (Logo-Verlauf, Violett, Hell, Dunkel), automatisch abwechselnd
  - 9 Vorlagen, neu: Meetup-Erinnerung mit Countdown, eigenes Foto
- **Story:** Inhalte nur im sicheren Bereich, nicht unter Profilbild, Fortschrittsbalken oder Antwortfeld. Die Schutzzonen lassen sich in der Vorschau einblenden.
- **Eigene Fotos (optional):**
  - nur mit bestätigten Bildrechten und Einwilligung
  - verkleinert, bleiben nur auf dem Gerät (nicht im Backup)
- **Texte:**
  - Der KI-Auftrag enthält die Vivalink-Besonderheiten sowie Blickwinkel und Beitragsart je Termin.
  - Abgedroschene Floskeln sind verboten; fehlende Angaben werden als `[BITTE ERGÄNZEN]` markiert statt erfunden.
- **Prüfung, neu erkannt:**
  - App-Store- und Download-Behauptungen, Platzhalter, Mitgliederzahlen, unbestätigte Rückblicke
  - Stilhinweise: Floskeln, laute Emojis, wörtliche Wiederholungen
- **Planung:**
  - gleicher Bereich nie direkt hintereinander, seltene Bereiche zuerst
  - Ankündigung, Erinnerung und Rückblick zum Meetup automatisch und abwechslungsreich formuliert
  - Der Rückblick bleibt blockiert, bis echte Angaben eingetragen sind.
- **Schutz vor Demodaten:** Backups der Testversion und Demo-Beiträge werden in der echten App abgelehnt und nie veröffentlicht.

**Bedienung**
- **Bearbeiten in Bereichen:** Vorschau, Text, Gestaltung, Termin.
  - feste Aktionsleiste (Speichern, Freigeben, Schließen)
  - Anzeige „Ungespeichert“, Rückfrage beim Schließen
  - automatischer Zwischenspeicher, auch nach einem Absturz
  - Freigeben speichert vorher
  - auf dem iPad im Querformat zweispaltig
- **Monatsübersicht:** fertig, zu bearbeiten, zu prüfen, die nächsten 7 Tage.

**Management**
- **Startseite:**
  - „Heute zu tun“ (geordnet, mit Begründung)
  - „Entscheidungen für dich“
  - „Entwicklungen“ (ohne Ursachenbehauptung)
- **Aufgaben:** bearbeiten und löschen, „erst nach“-Abhängigkeit mit Reihenfolge und Kreisschutz.
- **Maßnahmen:** Reihenfolge, Risiko je Maßnahme, Vergleich mit dem Zeitraum davor.
- **Weniger Wiederholungen:** „Später“ verdoppelt den Abstand; „Nicht relevant“ erscheint nur bei höherer Dringlichkeit wieder.

**Autonomie (Architektur fertig, Anbindungen folgen)**
- **Zyklus:** erfassen → analysieren → Aufgaben → Maßnahmen → Entwürfe → Freigaben → ausführen → prüfen.
- **Berechtigungen:** widerrufbar, befristet und begrenzt; Stufe 3 nie.
- **Synchronisierung, neues Sicherheitskonzept:**
  - 256-Bit-Zufallsschlüssel
  - Kopplung per Schlüsselvereinbarung und Prüfzahl
  - Wiederherstellungsschlüssel
  - Schlüsselwechsel bei Geräteverlust
  - Begrenzung von Fehlversuchen
- **Aufgaben-Kanal für geplante Claude-Aufgaben:** nur öffentliche Fakten, Ergebnisse nur als Entwürfe.

**Robustheit**
- Beschädigte Gerätedaten: Original aufbewahrt, Reparatur oder letzter intakter Sicherungspunkt; Notfallansicht.
- Sicherungspunkt des Tages wird beim Start aufgefrischt (älter als 3 Stunden).
- Unterbrochenes Update: Der halb gefüllte Offline-Speicher wird entfernt, die bisherige Version bleibt lauffähig.
- Doppelte Übernahme derselben KI-Antwort und Doppeltipps erzeugen nichts doppelt.

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
