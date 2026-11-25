# Zentrale Entwicklungsübersicht: Vivalink Management AI

**Fortsetzungsdokument für alle weiteren Entwicklungsaufträge.** Bei jedem Auftrag zuerst lesen und am Ende aktualisieren. Arbeitsweise (Tests, Gerätetests, Grenzen): **`CLAUDE.md`**.
Stand: 25.11.2026 · Zweig `claude/vivalink-ai-audit-5jsxqp` · Pull Request #2 (offen, **nicht veröffentlicht**) · Version **2.4.0** · Produktion: Version 2.1 (`main`)

## 1. Umgesetzt und getestet (noch nicht veröffentlicht)

| Bereich | Funktion | Prüfstatus |
|---|---|---|
| Studio: Planung | Monatsplan (3/Woche, nur freie Termine, Bereiche nie direkt hintereinander, Blickwinkel und Beitragsart je Termin); Ankündigung, Erinnerung und Rückblick zum Meetup automatisch | automatisch getestet |
| Studio: Texte | KI-Auftrag mit Vivalink-Besonderheiten, Floskelverbot, Platzhalter statt Erfindungen; abwechslungsreiche automatische Texte | automatisch getestet |
| Studio: Prüfung | Prüfhinweise (blockieren): erfundene Zahlen und Daten, Preise, Zitate, Versprechen, Links, App-Store/Download, Platzhalter, Mitgliederzahlen, unbestätigte Rückblicke, Dubletten, Meetup-Ort, Caption-Länge. Stilhinweise: Länge, Floskeln, laute Emojis, Wiederholungen | automatisch getestet |
| Studio: Gestaltung | echter Logo-Verlauf (11 Stufen), 4 Gestaltungen automatisch abwechselnd, 9 Vorlagen, Story mit Schutzzonen, eigene Fotos mit Einwilligung (nur auf dem Gerät) | automatisch getestet und sichtgeprüft |
| Studio: Bedienung | Bereiche Vorschau/Text/Gestaltung/Termin, feste Aktionsleiste, „Ungespeichert“, Zwischenspeicher, Monatsübersicht; iPad quer zweispaltig | automatisch getestet und sichtgeprüft (iPhone, iPad) |
| Management | Heute zu tun, Entscheidungen, Entwicklungen; Aufgaben bearbeiten/löschen mit Abhängigkeiten; Maßnahmen mit Reihenfolge, Risiko und Vergleich zum Zeitraum davor; seltenere Wiederholungen | automatisch getestet |
| Autonomie | Zyklus (8 Schritte), Stufen 0–3, widerrufbare befristete Berechtigungen, Aktionsprotokoll, Selbstreparatur Stufe 1 | automatisch getestet |
| Assistenz | KI-Antwort → Aufgaben (Auswahl, Reihenfolge, Dubletten, Geschäftsentscheidungen nur als Entscheidung), Wochenbericht | automatisch getestet und sichtgeprüft |
| Schutz | Demodaten-Sperre in der echten App, Veröffentlichungsschutz, beschädigte Daten, unterbrochenes Update, Doppelaktionen | automatisch getestet |
| Daten | Datenversion 4 (unverändert), Update 2.1 → 2.3 und Rückbau mit dem originalen 2.1-Code | automatisch getestet (Chromium; WebKit in GitHub Actions) |

## 2. Vorbereitet, aber nicht aktiv

| Funktion | Stand | Was fehlt |
|---|---|---|
| Synchronisierung iPhone ↔ iPad | neues Sicherheitskonzept (Zufallsschlüssel, Kopplung mit Prüfzahl, Wiederherstellung, Schlüsselwechsel), mit simulierten Geräten und Angreifer getestet | **Entscheidung Anbieter** (Empfehlung Cloudflare, kostenlos) → Einrichtung (`SYNCHRONISIERUNG.md`) |
| Geplante Claude-Aufgaben | Aufgaben-Kanal und Brückenskript fertig und getestet | Synchronisierungs-Server; dann Aufgabe in Claude anlegen (`KI-AUTONOMIE.md`) |
| Kennzahlen aus der Verwaltung | Client fertig und getestet | Gegenstelle in Supabase/Rork laut `AUFTRAG-VERWALTUNG.md` |
| Automatische Instagram-Veröffentlichung und Statistiken | Schutzregeln, Berechtigung, JPEG-Export | Meta-App und Business-Login, Worker-Erweiterung (`INSTAGRAM-AUTOMATIK.md`) |

## 3. Tests und Qualitätssicherung (Claude prüft selbst, siehe `CLAUDE.md`)
- Automatische Oberflächenprüfung (`tests/layout.spec.mjs`): alle Ansichten und Fenster; iPhone, iPad, 375 px, 320 px; WebKit in GitHub Actions.
- Bildschirmfotos für Claudes Sichtprüfung: `node scripts/screenshots.mjs <Ordner>` (hell, dunkel, klein, iPad hoch und quer).
- **Nicht automatisch prüfbar (Restrisiko, ggf. gezielter Gerätetest):**
  - Teilen-Menü von iOS
  - Installation auf dem Home-Bildschirm
  - Fotoauswahl
  - Speicherlöschung durch iOS
  - Systemschriftgröße
  - Safari-Leisten und Bildschirmtastatur
- **Über 120 automatische Tests** (lokal über 370 Läufe): Regression V1/V2/2.1, Migration, Backup, Konflikte, Sicherheit, Diagnose, Offline, Testversion, Update und Rückbau, Studio, Grafiken, Bedienung, Management, Empfehlungen, Synchronisierung (inklusive Angreifer, Ablauf, Fehlversuche), Autonomie, Robustheit.
- Je Test in drei Bildschirmgrößen (Chromium: Desktop, iPhone, iPad), in GitHub Actions zusätzlich WebKit.
- Nur künstliche Daten. Prüfung auf vertrauliche Inhalte bei jedem Lauf.

## 4. Offene Entscheidungen (nur du)
1. **Freigabe zur Veröffentlichung** von 2.4 (automatisch geprüft; ein manueller Gerätetest ist nicht mehr nötig, Restrisiken siehe Abschnitt 3).
2. **Synchronisierung:** Cloudflare (Empfehlung) oder Supabase; danach legst du ein kostenloses Konto an.
3. **Verwaltung:** Freigabe des Auftrags in `AUFTRAG-VERWALTUNG.md` (zuerst Testumgebung).
4. **Instagram:** Business-Konto bestätigen, Anmeldeweg (Empfehlung: Instagram Login).
5. Später: ob eine kostenpflichtige KI-API für Echtzeit-Reaktionen gewünscht ist.

## 5. Nächste Arbeiten (Reihenfolge)
1. Nach deiner Freigabe: 2.4 veröffentlichen (Ablauf wie bei 2.1, `VEROEFFENTLICHUNG.md`).
2. Synchronisierung einrichten (Worker, CSP, `VL_SYNC_URL`), Test mit „VL Test“, dann Produktion.
3. Geplante Claude-Aufgabe „Wochenentwürfe“ über den Aufgaben-Kanal.
4. Instagram-Veröffentlichung über den Worker (Berechtigung „automatisch veröffentlichen“ greift dann).
5. Verwaltungs-Schnittstelle aktivieren, sobald die Gegenstelle existiert.

## 6. Bekannte Einschränkungen
- Die Bedienung von 2.3/2.4 ist nur automatisch und per Bildschirmfoto geprüft, nicht auf echten Geräten (Restrisiken siehe Abschnitt 3).
- Eigene Fotos liegen nur auf dem Gerät, auf dem sie hinzugefügt wurden. Sie sind nicht im Backup und werden nicht synchronisiert (Speicherplatz, Datenschutz).
- Die Faktenprüfung erkennt typische Probleme, kann Aussagen ohne Datenbasis aber nicht verifizieren. Deine Freigabe bleibt nötig.
- Sicherungspunkte gibt es einmal täglich (beim Start aufgefrischt). Änderungen der letzten Stunden können bei einem Datenschaden fehlen; nach Aktivierung der Synchronisierung entfällt das weitgehend.
- KV-Speicher ist „letztlich konsistent“. Gleichzeitiges Schreiben heilt sich beim nächsten Durchlauf (getestet).

## Architektur (Kurzfassung)
Siehe `ARCHITEKTUR.md`. Module:
- **Grundlage und Daten:** `core`, `data` (Migration, Prüfung, Zusammenführen, Reparatur)
- **Kennzahlen und Regeln:** `metrics`, `actions` (Stufen, Protokoll), `rules` (Regelmotor), `advice` (Empfehlungen, Maßnahmen), `manage` (Heute zu tun, Entscheidungen, Abhängigkeiten)
- **Instagram:** `studio` (Logik), `render` (Grafiken, Fotos), `studio-view` (Oberfläche)
- **Autonomie und Anbindungen:** `autonomy` (Zyklus, Berechtigungen, Aufgaben-Kanal), `sync` (Synchronisierung), `kpi` (Verwaltung)
- **Oberfläche und Bedienung:** `prompts`, `aitest`, `views`, `diag`, `app`
- **Server:** `server/vault-core.mjs` (Tresor und Kopplung), `server/sync-worker.js` (Cloudflare Worker, nicht eingerichtet); `scripts/ki-aufgabe.mjs` (Brücke für geplante Aufgaben)
