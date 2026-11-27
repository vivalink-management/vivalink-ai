# Zentrale Entwicklungsübersicht: Vivalink Management AI

**Fortsetzungsdokument für alle weiteren Entwicklungsaufträge.** Bei jedem Auftrag zuerst lesen und am Ende aktualisieren. Arbeitsweise (Tests, Gerätetests, Grenzen): **`CLAUDE.md`**.
Stand: 27.11.2026 · Zweig `claude/vivalink-ai-audit-5jsxqp` · Produktion: **Version 2.10.0** (`main`, Pull Request #8; echte Kennzahlen, Testdaten getrennt; Supabase-Erweiterung, neue Edge Function und Kennzeichnung der vier Testkonten durch den Gründer erledigt – App zeigt 0 echte Nutzer) · Veröffentlicht: **2.12.1** (PR #12) · Entwicklungszweig: **2.13.0** (Phase 1 des KI-Plans: Unternehmensprofil, Playbook, Antwortarten, Prüfungen; nicht veröffentlicht) · Testversion „VL Test“: 2.8.3

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
| Kennzahlen aus der Verwaltung | **2.9.0:** echte Adresse der Edge Function eingetragen (CSP erlaubt genau diesen Host); ohne Kopplung wird nichts gesendet; Kopplung/Abruf/Widerruf über die echte Adresse mit nachgebildeter Gegenstelle getestet; Live-Prüfung des Endpunkts (nur lesend) in GitHub Actions („Live-Prüfung Verwaltung“) | Veröffentlichung (Freigabe Gründer), dann Kopplung iPhone/iPad und Abgleich (`bereitstellung/ABGLEICH.md`, privat) |
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
- Live-Prüfung der Synchronisierung (Testversion gegen den echten Worker) bitte über den Workflow „Live-Prüfung“ in GitHub Actions starten, nicht aus einer Claude-Sitzung der Umgebung „Vivalink“: Seit dort der Netzwerkschlüssel für das Aufgaben-Postfach hinterlegt ist, lehnt der Worker Tresor-Anfragen aus dieser Umgebung mit 401 ab (das Postfach selbst funktioniert). Echte Geräte und GitHub Actions sind nicht betroffen; 2.6 dort am 25.11.2026 bestanden (Chromium und WebKit, iPhone und iPad).

## Stand der Autonomie (2.7.1, veröffentlicht)

### Einsatzbereit (Produktion 2.7.1)
| Funktion | Was die KI selbstständig tut | Grenze |
|---|---|---|
| Autonomie-Zyklus | Daten prüfen, Befunde, „Heute zu tun“, Entwürfe aus Fakten, Rückblick-Entwurf nach Meetups, Selbstreparatur eindeutiger Datenfehler | nur Stufe 0/1; Stufe 2 mit Berechtigung |
| Synchronisierung iPhone ↔ iPad | Abgleich beim Öffnen und nach Änderungen, Konflikte erkennen | Ende-zu-Ende verschlüsselt; Kopplung der echten Geräte siehe Abschnitt 6 |
| Überwachung der geplanten Aufgaben | zeigt Termin, letzten belegten Erfolg, Ergebnis; ausgeblieben/Problem als Befund | nur belegte Erfolge |
| Geplante Aufgabe „technische Wartung“ (Mo 4:43) | Tests, Abgleich der veröffentlichten Version, Fehlerbehebung auf eigenem Zweig, **Rückmeldung an die Überwachung** (seit 25.11.2026; Kette einmal echt geprüft) | nie veröffentlichen |
| Geplante Aufgabe „Instagram-Entwürfe und Wochenanalyse“ (Mo 5:17) | 14-Tage-Entwürfe, Wochenanalyse mit Vorwochen, bis zu 5 Aufgabenvorschläge; meldet Probleme (z. B. kein Auftrag) | nur Entwürfe bzw. Vorschläge zur Freigabe |
| Wochenbericht, Studio-Feinarbeit, Sammelfreigabe | Trends, Prioritäten, Erfolgskontrolle; Entwürfe automatisch nachgebessert | Freigabe bleibt beim Gründer |

### Neu in 2.7 (veröffentlicht; Verwaltungs-Gegenstelle noch nicht bereitgestellt)
- Verwaltungs-Gegenstelle mit eingeschränkter Datenbankrolle, READ-ONLY-Lesen, Schutz vor Code-Durchprobieren, 503 ohne Einzelheiten
- Getrennte Testumgebung mit künstlicher Verwaltung; läuft bei jedem Testlauf (lokal und GitHub Actions)
- App: Widerruf erkannt (kein Dauerabruf), wachsende Pause nach Fehlern, Hinweis „Verwaltung gestört“, letzter Fehler sichtbar

### Vorbereitet, nicht aktiv
| Funktion | Was fehlt |
|---|---|
| Kennzahlen aus der Verwaltung | 1) lesende Bestandsaufnahme (Gründer führt eine Strukturabfrage aus), 2) Zuordnung, 3) Bereitstellung in Supabase – **gesonderte Freigabe**, Schritte in `AUFTRAG-VERWALTUNG.md` |
| Automatisches Veröffentlichen bei Instagram | Meta-App und Business-Login (kostenlos), Worker-Erweiterung, Berechtigung „automatisch veröffentlichen“ |

### Was für eine weitgehend autonome Management-KI noch fehlt
1. **Echte Kennzahlen automatisch:** technisch fertig; es fehlen Bestandsaufnahme, Zuordnung und Bereitstellung mit Freigabe.
2. **Instagram-Veröffentlichung und -Statistiken automatisch:** schließt den Kreis Entwurf → Veröffentlichung → Ergebnis → Lernen.
3. **Wirkungsmessung über Zeit:** mehrere Wochen echter Daten, damit Trends und Maßnahmenkontrolle belastbar werden.
4. **Reaktion in Echtzeit:** heute wöchentlich bzw. beim Öffnen; schneller nur mit kostenpflichtiger KI-API (nur mit Zustimmung).
5. **Weitere Aufgabenbereiche** (später): E-Mail/Newsletter-Entwürfe, Meetup-Organisation, Auswertung der Website.

### KI-Chat und Sprachmodus (2.11.0, 27.11.2026) – Einzelheiten in `docs/KI-CHAT.md`
- Fertig und getestet:
  - Chat mit lokalem Assistenten ohne KI-Modell (Werkzeuge auf vorhandene Funktionen, Herkunftskennzeichnung)
  - Aufträge über POLICY/act
  - Gedächtnis nur nach Bestätigung
  - Sprachmodus mit Geräte-Spracherkennung (Gesprächsschleife, Unterbrechen, Anzeige, Diktiermodus als ehrlicher Ersatz)
  - Chats über die vorhandene Synchronisierung (begrenzt)
  - Datenversion 5
- Vorbereitet, nicht bereitgestellt: Worker `vivalink-ki` (Workers AI: Llama 3.3 70B, Whisper) mit Tagesbudget 9.000 Neurons, Zugang über Tresor-Zugang, Datenfreigaben je Bereich.
- 2.11.0 enthält bereits Adresse und Sicherheitsrichtlinie des Workers (ohne Wirkung bis zum Einschalten).
- Datensparsamkeit: lokale Antworten nicht an das Modell; Einschalten nur nach „Verbindung prüfen“.
- Worker gehärtet: Ausweichmodell, Vorab-Buchung, Budget 8.000, Fehlversuchsgrenze, Status ohne Daten.
- ✅ 2.11.0 veröffentlicht (PR #9). Der Gründer hat den Workers-Tarif „Free“ bestätigt.
- ✅ **Worker `vivalink-ki` bereitgestellt (27.11.2026, Freigabe des Gründers):** https://vivalink-ki.hidden-art-0326.workers.dev
  - `vivalink-sync` und `vivalink-webseite` nachweislich unverändert (Änderungszeit und Versionskennung vorher/nachher gleich).
  - Live-Prüfung KI bestanden: Status, 401 ohne Zugang, 403 fremde Webseiten.
  - Funktionsprüfung mit künstlichem Test-Zugang: Llama 3.3 70B antwortet im kostenlosen Tarif, Werkzeugaufrufe funktionieren.
  - Verbrauch der Prüfung: 14 Neurons. Der Test-Zugang wurde danach gesperrt.
- ❗ **Fehler nach dem Einschalten (27.11.2026): „KI nicht erreichbar (503)“** bei Fragen mit Werkzeugaufruf.
  - Ursache (Live-Diagnose mit künstlichem Test-Zugang, Workflow „Live-Prüfung KI“ mit `diagnose=ja`): Der erste Aufruf klappt, Llama ruft ein Werkzeug auf. Im zweiten Schritt sendete die App die Ergebnisse als `tool_calls` (leerer Assistenten-Text) + role `tool`; diese Form lehnt Workers AI ab. Der Worker wich dabei nicht aus und meldete 503. Zugang, Kontingent und Verbindung waren in Ordnung.
  - Diagnose-Ergebnis: Form der App 2.11.0 → 503; Ergebnisse als Klartext → 200. Mit angebotenen Werkzeugen ruft Llama sie zudem gern erneut auf.
  - **Lösung 2.11.1 (App):** Werkzeugergebnisse als Klartext-Nachricht, letzter Schritt ohne Werkzeuge, verständliche Fehlermeldungen mit Code.
  - **Lösung Worker (vorbereitet, Bereitstellung braucht Freigabe):** wandelt die Form von 2.11.0 um (so funktioniert die veröffentlichte App sofort), nach Werkzeugergebnissen keine Werkzeuge mehr, grobe Fehlercodes (`modell_eingabe`, `modell_fehler`, `modell_nicht_verfuegbar`), abgelehnte Eingaben verbrauchen kein Budget; Protokoll nur Fehlercode, nie Inhalte.
  - Tests: strenge Workers-AI-Attrappe (lehnt die alte Form wie live ab), Form 2.11.0 am Worker, dreistufiger Werkzeugablauf in der App, Fehlercode-Anzeige.
- ✅ **Worker-Aktualisierung bereitgestellt (27.11.2026, Freigabe des Gründers):** `vivalink-ki` Version b6f2a4b5-c227-4527-9be5-478c2f463960. `vivalink-sync` und `vivalink-webseite` nachweislich unverändert (Änderungszeit/Kennung vorher = nachher); Supabase und App nicht verändert.
  - Live-Prüfung danach: Form A (App 2.11.0) → 200 mit Antwort. Die **veröffentlichte App 2.11.0** (GitHub Pages, frischer Browser, künstliche Daten, `tests/live-ki-app.spec.mjs`) erhielt auf zwei Fragen mit Werkzeugaufruf vollständige KI-Antworten (Llama 3.3 70B, Kennzahlen bzw. Aufgaben abgerufen). Verbrauch 170 Neurons; Test-Zugang gesperrt.
  - Beobachtung Antwortqualität: Die zweite Antwort wiederholte Sätze der ersten. Verbesserung der Anweisungen an das Modell sinnvoll (nächster Schritt).
- ❗ **Hänger im Sprachmodus auf dem iPad (27.11.2026, gemeldet vom Gründer)** – behoben in 2.11.1 (nicht veröffentlicht):
  - Nachgewiesene Ursache im Code: unbegrenzter Neustart der Spracherkennung (19 Neustarts in 5 s im Test), Stille-Zeitgrenze bei jedem Neustart zurückgesetzt, Sprachanzeige bei jeder Änderung neu aufgebaut (Fingertipps gingen verloren). Auf dem iPad aktiviert jeder Neustart Mikrofon und Audiosystem neu.
  - Lösung und Tests: `js/voice.js` (Sitzungsnummer, Grenzen, Zeitgrenzen, stabile Anzeige, „Fertig gesprochen“, Server-Erkennung in der installierten iOS-App), `KI_T` in `js/assistant.js`; `tests/voice-robust.spec.mjs` (14 Fälle; schlagen mit 2.11.0 fehl). Live-Prüfung Whisper mit künstlicher Sprache: Workflow „Live-Prüfung KI“, Eingabe `stt=ja`.
  - Kein Worker-Update nötig.
  - Dabei zwei unzuverlässige Tests repariert: Chat-Ansicht wird jetzt vor dem Speichern aktualisiert (Fingertipp ging sonst verloren); Test-Datenbank-Port 25400+ statt 54400+ (lag im Bereich für ausgehende Verbindungen). Lokal und in GitHub Actions (mit WebKit) grün.
  - Gerätetest nötig: Sprachmodus in Safari und in der installierten App auf iPad/iPhone (Mikrofonfreigabe, Wechsel Aufnahme/Wiedergabe, Stimmen).
- ✅ 2.11.1 veröffentlicht (PR #10).
- **2.12.0 (Praxistest des Gründers auf dem iPad, 27.11.2026) – Ursachen und Lösungen:**
  - Selbstständiges Ende: Bildschirmsperre → App im Hintergrund → Ende; Whisper-Fehlerkennungen/Geräusche und langsame Antworten führten zu Enden bzw. Unsinnsfragen. Jetzt: Wake Lock, Stille-Grenze 2 min mit Vorwarnung, Störungen beenden nicht, dauerhafter Endhinweis.
  - Nicht vorgelesen: Vorlesen bei offenem Mikrofon bzw. direkt nach dem Ende der Erkennung (iOS stumm); im Test 0 von 5 Antworten hörbar. Jetzt: Mikrofon frei, Umschaltpause, Startüberwachung, 🔊 per Tippen.
  - Unbeauftragte Aufgaben: Modell rief „aufgabe_anlegen“ bei einer Frage zweimal auf; die App führte Stufe 1 ohne Prüfung aus. Jetzt: technische Absichtsprüfung (`userIntent`), Vorschläge, Dublettenschutz (`dedupeActions`, `existingDup`, `srcKey`).
  - Wiederholungen: neue Systemanweisung, sauberer Verlauf, kurze Sprachantworten.
  - Live-Gespräch (künstliche Daten, ca. 430 Neurons): keine Aufgabe bei Fragen, genau eine bei Auftrag, kurze Sprachantwort. Grenze: Llama 3.3 70B greift bei Empfehlungen teils auf App-Hinweise zurück statt auf eigene Ideen (Anweisung und Werkzeugbeschreibung angepasst).
  - WebKit (GitHub Actions) fand zusätzlich eine Lücke im Wiederholschutz (Antwort sichtbar, aber noch nicht gespeichert) – behoben, Test deterministisch.
  - „Tests / test (push)“ schlug einmal fehl (WebKit iPad, Zusammenführungs-Test): echter kleiner Synchronisierungsfehler – eine Änderung während einer laufenden Synchronisierung wurde nicht nachgereicht. Behoben in `js/sync.js`, gezielter Test `tests/sync-laufend.spec.mjs` (schlägt ohne Behebung fehl).
  - Ergebnis: lokal 645 bestanden, GitHub Actions mit WebKit iPhone/iPad grün (PR #11).
  - Tests: `tests/praxis.spec.mjs` (schlagen mit 2.11.1 fehl), `sprachfluss`, `absicht`, `update-2112`, `voice-fakes.mjs`; Live: `live-ki-gespraech` (Workflow-Eingabe `gespraech=ja`).
- ✅ 2.12.0 veröffentlicht (PR #11). Gerätetest des Gründers: Whisper und KI-Antworten funktionieren, aber keine Antwort wurde automatisch hörbar vorgelesen (Protokoll: je Satz „Ende nicht gemeldet“ nach ca. 20 s); 🔊 per Tippen funktioniert.
- **2.12.1:**
  - Ursache: leerer Freischalt-Satz (Lautstärke 0) blieb hängen bzw. schaltete iOS nicht frei. Alle Antworten lagen stumm in der Warteschlange; `speaking` wurde fälschlich als Start gewertet.
  - Lösung: echter Freischalt-Satz beim Tippen, Warteschlange leeren, Start nur per Ereignis, Tipp-Ausweg „🔊 Antwort vorlesen“, ausführliches Protokoll ohne Inhalte.
  - Tests: `tests/vorlesen-ios.spec.mjs` (iOS-Modell in `voice-fakes.mjs`; schlägt mit 2.12.0 fehl).
  - Cloudflare-Sprachausgabe geprüft: keine kostenlose deutsche Stimme → nicht umgesetzt (Begründung in `docs/KI-CHAT.md`).
- ✅ 2.12.1 veröffentlicht (PR #12).
- **Entwicklungsplan KI (27.11.2026):** Analyse von Architektur und Schwachstellen und priorisierter Plan (Unternehmensprofil, Antwortmodi, Analyse-Werkzeug, Gesprächsnotizen, Modellvergleich, Eigenständigkeit) in `docs/ENTWICKLUNGSPLAN-KI.md`. Nichts umgesetzt; wartet auf Freigabe des Gründers (Abschnitt 8).
- **Phase 1 (2.13.0) umgesetzt:**
  - Profil (`js/profile.js`) und Playbook (`js/playbook.js`, Lesefassung `docs/VIVALINK-PLAYBOOK.md`) als Entwürfe – aktiv erst nach Freigabe des Gründers in der App.
  - Antwortarten und Prüfungen in `js/assistant.js` (`answerMode`, `kiReview`, `fixLabels`, `repetitionScore`, `missingStructure`, `alreadySaid`).
  - Qualitäts-Testset (`tests/qualitaet-rubrik.mjs`, live: Workflow-Eingabe `qualitaet=ja`).
  - Tests: `profil`, `antwort`, `qualitaet`, `update-2130` (Fixture `legacy-v2121`), Layout.
  - Live-Qualitätsvergleich (27.11.2026, künstliche Daten, 11 Fragen):
    - Ergebnis: 2.12.1: 75 %, 2.13: 79 %. Beratungsstruktur deutlich besser (Optionen 0/4 → 3/4, erster Schritt 1/4 → 3/4, Erfolgsmessung 3/4 → 4/4).
    - Profilbezug 0/4. Ursache: Profil, „bereits genannt“ und Playbook-Hinweis lagen in eigenen Systemnachrichten, die Llama kaum beachtet → jetzt eine Systemnachricht und ausdrücklicher Profilbezug.
    - Zusätzlich behoben: unbelegte Schätzungen als Annahme kennzeichnen, Meetup-Datum mit „in X Tagen“, Playbook-Marker.
  - ❗ Dabei wurde das Tageskontingent (8.000 Neurons) erreicht. Keine Kosten; die KI-Antworten fielen bis 1 Uhr UTC auf den lokalen Assistenten zurück. Der Live-Test schützt das Kontingent jetzt (bricht unter 5.000 verbleibenden Neurons ab, Varianten nacheinander).
  - Erneute Live-Messung nach Rücksetzung des Kontingents.
  - Nächste Phase nach Freigabe: Gesprächsgedächtnis.
- **Offen (vorher):**
  - Gerätetest 2.12.1; danach Gerätetest: drei Fragen per Sprache. Erwartet: „Ich höre zu.“ beim Start, jede Antwort automatisch vorgelesen. Sonst Protokoll kopieren.; für die Fehlerbehebung nicht mehr zwingend, da der Worker die Form von 2.11.0 annimmt.
  - Gründer schaltet das KI-Modell auf iPad und iPhone ein (KI-Einstellungen, je Gerät) und gibt die Datenbereiche frei.
  - Gerätetest von Sprachmodus und Server-Spracherkennung in der installierten App.
- **Gerätetests nötig:** Mikrofon und Spracherkennung in Safari bzw. in der installierten App, Stimmenqualität.
- Kostenpflichtiger Echtzeit-Sprachmodus (OpenAI Realtime) nur als Information; nichts aktiviert.

### Stand Verwaltungsanbindung (26.11.2026)
- Erste Bestandsaufnahme ausgewertet.
- Die Zuordnung deckt 9 von 12 Kennzahlen ab, dazu das nächste Meetup (Datum, Plätze).
- In der getrennten Testumgebung auf der nachgebildeten echten Struktur geprüft, inklusive Sonderfällen: Reservierungen, freigegebene Vormerkungen, Teilerstattungen, Tester, Beispiel-Meetups.
- Schemaspezifische Dateien liegen im **privaten Repository `vivalink-management/vivalink-verwaltung-intern`**. Sie werden in `vivalink-ai` als Ordner `private/` ausgecheckt (per `.gitignore` ausgeschlossen) und stehen nie im öffentlichen Repository.
- **Zweite Bestandsaufnahme (datensparsam)** liegt im privaten Repository als `verwaltung/bestandsaufnahme-2.sql`. Sie gibt keinen Programmcode aus, nur Treffer aus einer vorgegebenen Begriffsliste und kurze Statuscodes.
- **Probelauf ohne bleibende Wirkung** liegt als `verwaltung/probelauf.sql` vor (Ersatz für ein Supabase-Testprojekt im Free-Tarif). Er richtet alles ein, prüft es und nimmt alles zurück; die Meldung enthält nur ja/nein. Ausführen nur mit Freigabe.
- **Offen:**
  - ✅ zweite Bestandsaufnahme ausgewertet (Admin-Auswertungen nur mit Admin-Anmeldung nutzbar → eigene Zählungen mit denselben Filtern)
  - ✅ Probelauf in der produktiven Datenbank erfolgreich (26.11.2026): GESAMT OK, alles zurückgenommen.
  - Ereignistrigger: issue_pg_graphql_access liegt in der aktuellen Supabase-Form vor, ensure_rls (RLS automatisch aktivieren) wird nur mit Prüfsumme und Inhaltsnachweis anerkannt.
  - **Bereitstellungspaket fertig und getestet:** privates Repository, Ordner `bereitstellung/`, mit `ANLEITUNG.md`. Lebenszyklustest: Probelauf → Einrichtung → Edge Function → Abgleich → Widerruf → Rückbau.
  - **Nachprüfung (26.11.2026):** Kopfkommentare je Modus eindeutig (Einrichtung → COMMIT, Probelauf → ROLLBACK). Edge Function: jede Datenbankoperation zuerst in Rolle management_ai mit Kontrolle über current_user (sonst 503), keine Katalogabfrage beim Verbindungsaufbau. Kopplungscode einlösen und Gerät speichern in einer Transaktion. Ohne gültigen Gerätezugang keine Kennzahlen, auch mit gefälschten JWTs. Einrichtung prüft zusätzlich Schreibrechte und Sonderrechte; Fingerabdruck um Spalten und Constraints erweitert; Gegenproben getestet. Original-TypeScript-Datei mit SHA-256 in der Anleitung; GET …/version zeigt die Prüfsumme der laufenden Fassung.
  - **Letzte Korrekturen (26.11.2026):** Rollenwechsel und Kontrolle von current_user als zwei getrennte Anweisungen; nach einem fehlgeschlagenen Wechsel folgt nachweislich keine weitere Anweisung. Die Versionskennung (…/version) ist ausdrücklich nur ein Hinweis; Nachweis ist die SHA-256 der vollständigen Datei vor dem Einfügen (automatisch mit ANLEITUNG.md abgeglichen).
  - **Einrichtung 26.11.2026 abgebrochen** (Sicherheitsprüfung „Schreibrechte außerhalb des eigenen Bereichs: 3“), nichts gespeichert. Die Prüfung zählte auch Rechte, die an PUBLIC (jede Rolle) vergeben sind, ohne den Schemazugriff zu berücksichtigen. Jetzt genauer: direkt vergebene oder nutzbare Schreibrechte → Abbruch; geerbte Rechte in Schemas ohne Zugriff → je Objekt aktiv nachgewiesen, dass ein Schreibversuch abgewiesen wird. Ursache in Produktion noch zu bestätigen mit der lesenden Diagnose (privates Repository).
  - **Diagnose (26.11.2026):** Zwei Tabellen der Netzwerk-Erweiterung sind an PUBLIC beschreibbar und ihr Schema ist für alle nutzbar; eine Tabelle der Zeitplan-Erweiterung liegt in einem Schema ohne Zugriff. PUBLIC-Rechte lassen sich in PostgreSQL nicht für eine einzelne Rolle entziehen. Lösung ohne Änderung an Supabase-Rechten: Die Rolle liest nur (READ ONLY), schreibt nur über drei festgelegte Funktionen, und ein Schreibschutz bricht beim Abschluss jede Transaktion ab, die außerhalb von management_ai schreibt. Die Einrichtung prüft alle Schutzschichten; Rechte von Erweiterungen werden nur dann toleriert, sonst Abbruch.
  - ✅ **26.11.2026 produktiv eingerichtet** (GESAMT OK), Edge Function bereitgestellt, /version und 401 ohne Zugang vom Gründer bestätigt, JWT-Prüfung aus.
  - ✅ **2.9.0 veröffentlicht (26.11.2026)**: alle 24 Dateien auf GitHub Pages identisch mit `main`, Update 2.8.1 → 2.9.0 mit Daten geprüft.
  - ✅ Kopplung und Abgleich durch den Gründer (26.11.2026): alle neun Kennzahlen stimmen überein. Die vier gezählten Konten sind Testkonten des Gründers.
  - **2.10.0 vorbereitet (nicht veröffentlicht):** Testkonten werden ausdrücklich gekennzeichnet (Tabelle im eigenen Schema, nur Konto-Kennungen); Kennzahlen ohne Testkonten; Testdaten (Konten, Buchungen, Einladungen, Zahlungen, Erstattungen) getrennt in `meta.testData`. Die App verwendet Verwaltungswerte nur verifiziert (Kennzeichen `real`). Ablauf für den Gründer: privat `bereitstellung/UMSTELLUNG-TESTDATEN.md`. Reihenfolge: erst App 2.10.0, dann Server.
  - **Additive Umstellung statt Rückbau (geprüft und getestet):** Die Änderungsdatei verändert die bestehende Anbindung (Modus „erweiterung“ im Generator), ohne Neueinrichtung.
    - Gekoppelte Geräte, Kopplungscodes und Abrufprotokoll bleiben erhalten; die Datei weist das nach.
    - Voraussetzungen werden geprüft, ebenso alle Rechte- und Schutzprüfungen und die Ereignistrigger vor jeder Änderung. COMMIT nur bei Erfolg.
    - Eigene Rückbau-Datei für die Erweiterung. Der Stand „2.9 + Erweiterung“ ist gleichwertig mit einer Neueinrichtung (Test).
    - Ablauf: privat `bereitstellung/UMSTELLUNG-TESTDATEN.md`.
  - ✅ 2.10.0 veröffentlicht, E2-Erweiterung ausgeführt, neue Edge Function bereitgestellt, vier Testkonten gekennzeichnet (Gründer, 27.11.2026).
  - **Für KI-Chat / Sprachmodus (geplant):** Kennzahlen nur über `valid()`/`cur()`/`cmp()` lesen (liefern ausschließlich verifizierte Werte); Testdaten nur über `KPI_STATE.meta.testData` (Summen). So kann ein Chat keine Testdaten als echte Unternehmensdaten verwenden. früher offen: **Offen (Freigabe Gründer):** Einrichtung und Edge Function in Supabase, danach App-Version mit der Adresse der Edge Function.
  - Testkonten mit Nutzerrolle: nicht bekannt → gekennzeichnet (keine erfundenen Merkmale)
  - Einrichtung (Freigabe)
- **Kosten** (Stand 26.11.2026, offizielle Supabase-Angaben):
  - Free-Tarif: 500.000 Aufrufe von Edge Functions pro Monat je Organisation, ohne Nachberechnung; erwartet sind etwa 250.
  - Höchstens 2 aktive Free-Projekte; Free-Projekte pausieren nach 1 Woche Inaktivität.
  - Ein eigenes Supabase-Testprojekt ist nur möglich, wenn ein Free-Platz frei ist. Alternativ: lokale Testumgebung (vorhanden), danach direkt produktiv mit Rückbauplan.

## 4. Offene Entscheidungen (nur du)
1. ✅ Version 2.4 freigegeben und veröffentlicht (25.11.2026).
2. ✅ Synchronisierung: Cloudflare (kostenlos), bestehendes Konto; Server eingerichtet, Webseite unverändert.
3. ✅ Version 2.5 freigegeben und veröffentlicht (25.11.2026).
4. ✅ Geräte gekoppelt; Postfach-Schlüssel hinterlegt; wöchentliche Aufgaben „technische Wartung“ (Mo 4:43) und „Instagram-Entwürfe und Wochenanalyse“ (Mo 5:17) angelegt.
5. ✅ Version 2.6 freigegeben und veröffentlicht (25.11.2026).
6. **Verwaltung (höchste Priorität):** Bestandsaufnahme freigegeben (25.11.2026) – Gründer führt `docs/bestandsaufnahme-verwaltung.sql` im SQL-Editor aus und gibt das Ergebnis an Claude; Bereitstellung in Supabase später gesondert freigeben.
6a. ✅ Geräte zusammengeführt (26.11.2026, 09:13; laut Server-Metadaten ein gemeinsamer Speicher, alte Speicher und Schlüssel gesperrt).
7. ✅ Version 2.7.1 freigegeben und veröffentlicht (25.11.2026); ✅ Version 2.8.1 freigegeben und veröffentlicht (26.11.2026).
8. **Instagram:** Business-Konto bestätigen, Anmeldeweg (Empfehlung: Instagram Login).
9. Später: ob eine kostenpflichtige KI-API für Echtzeit-Reaktionen gewünscht ist.

## 5. Nächste Arbeiten (Reihenfolge)
1. ✅ Server bereitgestellt, Testversion angebunden und live geprüft.
2. ✅ Version 2.5 veröffentlicht; Geräte koppeln (Gründer, einmalig).
3. ✅ Postfach-Schlüssel eingerichtet, geplante Claude-Aufgaben angelegt (Inhalte und Analyse wöchentlich; technische Wartung wöchentlich).
4. ✅ Wartungsaufgabe meldet ihr Ergebnis an die Überwachung (`melden`), Inhaltsaufgabe meldet Probleme.
5. Verwaltung (höchste Priorität): Bestandsaufnahme → Zuordnung → Test mit nachgebildeter echter Struktur → Bereitstellung mit Freigabe (`AUFTRAG-VERWALTUNG.md`).
6. Instagram-Veröffentlichung über den Worker (Berechtigung „automatisch veröffentlichen“ greift dann).

## 6. Bekannte Einschränkungen
- **Synchronisierung der echten Geräte:** Seit 26.11.2026 (09:13) nutzen iPhone und iPad einen gemeinsamen Speicher (Server-Metadaten). Ab 2.8.2 meldet die App selbst, wenn die Synchronisierung gestört ist.
- Live-Prüfungen der Synchronisierung nur über GitHub Actions („Live-Prüfung“): Aus Claude-Sitzungen der Umgebung „Vivalink“ lehnt der Worker Tresor-Anfragen mit 401 ab (Netzwerkschlüssel des Postfachs); Geräte und GitHub Actions sind nicht betroffen.
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
