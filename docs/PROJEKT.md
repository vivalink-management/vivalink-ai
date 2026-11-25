# Projektübersicht Vivalink Management AI

> Aktueller Gesamtstand und nächste Schritte: **[`ENTWICKLUNGSSTAND.md`](ENTWICKLUNGSSTAND.md)** (zentrale, fortlaufende Übersicht).

Zentrale, fortlaufend gepflegte Übersicht. Jede neue Funktion wird hier abgeglichen.
**Enthält bewusst keine Unternehmenszahlen, Orte, Personen oder Zugangsdaten** (öffentliches Repository).

Prüfstatus: **I** implementiert · **AT** automatisch getestet · **MT** manuell getestet · **GT** auf echtem Gerät getestet · **PF** produktiv freigegeben (nur durch den Gründer).
Zuständigkeit: CC = Claude Code, R = Rork, G = Gründer.

## Feste Regeln
- Strategische und unternehmerische Entscheidungen trifft ausschließlich der Gründer: Preise, Standorte, Geschäftsmodell, bezahlte Werbung, Zahlungen und Erstattungen, Produktiv-Einstellungen.
- Keine zusätzlichen Kosten ohne ausdrückliche Zustimmung.
- Rork und Supabase werden von Claude Code nicht verändert.
- Kein direkter Merge in `main`. Veröffentlichung nur nach Freigabe des Gründers.
- Keine vertraulichen Inhalte im Code oder in GitHub-Protokollen (automatisch geprüft).

## Freigabestufen für spätere Automatik (Vorschlag)
| Stufe | Beispiel | Ausführung |
|---|---|---|
| 0 | Cache leeren, Abruf wiederholen | automatisch |
| 1 | lokale Datenreparatur | automatisch nach Sicherheitskopie, mit Protokoll und Rückgängig |
| 2 | Codeänderung | Pull Request mit bestandenen Tests; der Gründer merged |
| 3 | Produktion, Supabase, Rork, Zahlungen, Preise, Strategie | nie automatisch |

## Funktionen

| ID | Funktion | Stand | Prüfstatus | Prio | Abhängig von | Zust. | Kosten |
|---|---|---|---|---|---|---|---|
| F-01 | Dashboard: Zähler, Empfehlungen, Kennzahlen, nächstes Meetup | vorhanden | I, AT | – | – | CC | 0 |
| F-02 | Aufgaben: anlegen, Priorität, Frist, erledigen, wieder öffnen | vorhanden | I, AT | – | – | CC | 0 |
| F-03 | Aufgaben bearbeiten und löschen | **fehlt** | – | P1 | B1 | CC | 0 |
| F-04 | Gedächtnis mit Verlauf, Sicherheitsgrad, Datenschutzfilter, Suche | vorhanden | I, AT | – | – | CC | 0 |
| F-05 | Gedächtnis archivieren | **fehlt** | – | P2 | – | CC | 0 |
| F-06 | Arbeitsaufträge (7 Vorlagen) inklusive Kennzahlen und Befunden | vorhanden | I, AT | – | – | CC | 0 |
| F-07 | KI-Antwort → Aufgaben übernehmen | **fehlt** | – | P2 | F-03 | CC | 0 |
| F-08 | Regelmotor mit Fakt/Annahme, Ausblenden, als Aufgabe übernehmen | vorhanden | I, AT (feste Testuhr) | – | – | CC | 0 |
| F-09 | Kennzahlen manuell, Ziel, 7/30-Tage-Vergleich, Import im `values`-Format | vorhanden | I, AT | – | – | CC | 0 |
| F-10 | Backup mit Prüfsumme, Datei, Prüfung, Vorschau, Rückgängig, alte Formate | **neu in 2.1** | I, AT, GT (Testversion) | P0 | – | CC | 0 |
| F-11 | Konflikterkennung und -entscheidung | **neu in 2.1** | I, AT, GT (Testversion) | P0 | – | CC | 0 |
| F-12 | Diagnoseseite und technisches Protokoll | **neu in 2.1** | I, AT, GT (Testversion) | P0 | – | CC | 0 |
| F-13 | Migration mit geprüfter Sicherheitskopie (Datenversion 1/2 → 3) | **neu in 2.1** | I, AT (auch mit originalem V1-Code, Update und Rückbau) | P0 | – | CC | 0 |
| F-14 | Home-Bildschirm-Installation, Offline-Betrieb | vorhanden (aus V1) | I, AT (Chromium + WebKit), GT (Testversion) | P0 | – | CC | 0 |
| F-15 | Sicherheitsrichtlinie (CSP) und Eingangsprüfung | **neu in 2.1** | I, AT | P0 | – | CC | 0 |
| F-16 | WebGPU-Prüfung und KI-Test-Protokoll | vorhanden | I, AT | – | – | CC | 0 |
| F-18 | Getrennte Testversion (GitHub Pages im eigenen Repository, Demodaten) | **neu in 2.1** | I, AT, GT | P0 | – | CC | 0 |
| F-17 | Backup optional verschlüsselt (Passwort) | offen | – | P2 | – | CC | 0 |
| E-1 | **Instagram-Studio lokal**: Themenpool, Redaktionsplan, Captions, Bildvorlagen, Freigabestatus, Ergebniserfassung | geplant, **nächster Schritt** | – | P1 | 2.1 freigegeben | CC | 0 |
| C-1 | Lesende Kennzahlen-Schnittstelle mit Geräte-Kopplung | geplant (Rork-Auftrag) | – | P1 | Testumgebung | R | ggf. Rork-Credits |
| C-2 | Client-Adapter auf das vorhandene `values`-Format | geplant | – | P1 | C-1 | CC | 0 |
| C-3 | Synchronisierung iPhone/iPad (Ende-zu-Ende verschlüsselt, nutzt F-11) | geplant | – | P2 | F-10, F-11, Backend-Entscheidung | CC | 0 (offen: Supabase-Projektzahl) |
| D-1 | Wirkungskontrolle Maßnahme ↔ Kennzahl (zeitlicher Bezug, kein Beweis) | geplant | – | P2 | C-2 | CC | 0 |
| D-2 | Wochenbericht | geplant | – | P2 | C-2 | CC | 0 |
| F-B1 | Zeitgesteuerter Regelmotor und Berichte im Backend | geplant | – | P3 | C-1, C-3 | CC | 0 |
| F-B2 | Claude-Code-Zeitaufgabe: Tiefenanalyse und Vorschläge zur Freigabe | geplant | – | P3 | F-B1 | CC | 0 (Pro-Limits) |
| F-B3 | Technische Überwachung und Reparaturvorschläge als Pull Request | geplant | – | P3 | F-12, C-1 | CC | 0 |
| E-2 | Instagram automatisch veröffentlichen (Graph API, Freigabe-Warteschlange) | geplant | – | P3 | E-1, F-B1 | CC | 0 |
| L-1 | Eingebaute lokale KI | geparkt | – | P4 | KI-Testergebnisse | CC | 0 |

## Grundlagen für automatische Tests und spätere Selbstreparatur (Stand 2.1)
- Vorhanden:
  - Aufteilung in testbare Dateien, feste Testuhr, nur künstliche Testdaten
  - Tests in Chromium und WebKit mit iPhone- und iPad-Bildschirm
  - Prüfung auf vertrauliche Inhalte, CI
  - App-Version, Diagnosebericht ohne Inhalte, technisches Protokoll, Integritätsprüfung
  - Befunde bei Fehlern und Konflikten
- Fehlt noch:
  - Stufe-1-Reparaturen (automatisch nach Sicherheitskopie)
  - Diagnose-Übergabe an Claude Code als Reparaturauftrag
  - Backend-Herzschlag für Hintergrundprozesse

## Offene Entscheidungen des Gründers
1. **Version 2.3 (Studio, Bedienung, Management, Autonomie):** Gerätetest in „VL Test“ (TESTVERSION.md, C2 und C3), danach Freigabe zur Veröffentlichung.
2. ✅ Markenfarben bestätigt (Pink #FA0372, Violett #6203DD, Orange #FE6603). ✅ Anmeldung über vivalink.me. Region einmal im Markenprofil der App eintragen.
3. Speicher für die Synchronisierung wählen: Supabase Free oder Cloudflare (beide kostenlos). Danach starten geplante Claude-Aufgaben.
4. Optional: `main` in den GitHub-Einstellungen schützen (kostenlos). Dann sind Änderungen nur noch über Pull Requests möglich.
5. Später: Supabase-Tarif und Projektanzahl (für Synchronisierung und Testumgebung), Rork-Auftrag als PDF, Instagram-Kontotyp und Markenvorgaben.

## Bekannte Grenzen
- Lokal wird nur Chromium getestet. WebKit (Safari-Technik) läuft in GitHub Actions. Echte iPhone- und iPad-Tests ersetzt beides nicht.
- iOS kann Website-Daten bei Speichermangel löschen, wenn die Persistenz nicht gewährt wurde (siehe Diagnose). Deshalb bleiben regelmäßige Backups nötig, bis die Synchronisierung existiert.
- Backups sind noch unverschlüsselt (F-17). Bitte in gesperrten Notizen ablegen.
