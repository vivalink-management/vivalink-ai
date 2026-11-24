# Zentrale Entwicklungsübersicht: Vivalink Management AI

**Fortsetzungsdokument für alle weiteren Entwicklungsaufträge.** Bei jedem Auftrag zuerst lesen und am Ende aktualisieren.
Stand: 24.11.2026 · Zweig `claude/vivalink-ai-audit-5jsxqp` · Pull Request #2 (offen, **nicht veröffentlicht**) · Produktion: Version 2.1 (`main`)

## 1. Umgesetzt und getestet (Version 2.2, noch nicht veröffentlicht)

| Bereich | Funktion | Prüfstatus |
|---|---|---|
| Instagram-Studio | Monatsplan (3/Woche, 6 Bereiche, nur freie Termine, Meetup-Ankündigung und -Erinnerung ohne Doppelung), KI-Auftrag, Übernahme der Antwort, Wochenfreigabe, Filter, Status Entwurf/Geplant/Fällig/Veröffentlicht, Bearbeiten, Teilen, PNG und JPEG | automatisch getestet; Gerätetest der Stufe 1 offen |
| Studio-Qualität | Prüfhinweise (blockieren die Wochenfreigabe): erfundene Zahlen und Daten, Preise, Zitate, Versprechen, Links, Dubletten, Meetup-Ort, Caption über 2.200 Zeichen. Stilhinweise (blockieren nicht): Länge, Lesbarkeit, Hashtags, Emojis, Handlungsaufforderung, Wiederholung. Hinweis auf die Grenzen der Prüfung. | automatisch getestet |
| Studio-Gestaltung | Offizielles Logo, Verlauf wie im Logo, Farben bestätigt, Nunito; 7 Vorlagen × 3 Varianten; Feed und Story | automatisch getestet und sichtgeprüft |
| Empfehlungen | Befund mit Fakten, Bedeutung, Ursachen (Annahme) und Maßnahmen (Nutzen, Dringlichkeit, Aufwand → Priorität) | automatisch getestet |
| Maßnahmenkontrolle | Freigabe → Aufgabe mit Ausgangswert und Prüftermin (bei Instagram-Maßnahmen inklusive Entwurf) → vorher/nachher ohne Ursachenbehauptung → Ergebnis im Gedächtnis | automatisch getestet |
| Startseite | Statuszeile (Freigaben, Maßnahmen, Technik, Kennzahlen), Ziele mit Fortschritt, Kennzahlen ohne Wert eingeklappt | automatisch getestet und sichtgeprüft |
| Sicherung | täglicher Sicherungspunkt (7 Tage), Rückgängig-Punkte, keine Backup-Erinnerung mehr, Meldung bei Ausfall | automatisch getestet |
| Freigabelogik | Stufen 0–3, Aktionsprotokoll, Veröffentlichungsschutz (nur freigegeben, unverändert, einmalig) | automatisch getestet |
| Daten | Datenversion 4, Update 2.1 → 2.2 und Rückbau mit dem originalen 2.1-Code | automatisch getestet (Chromium und WebKit) |

## 2. Vorbereitet, aber nicht aktiv (braucht deine Entscheidung oder fremde Systeme)

| Funktion | Stand | Was fehlt |
|---|---|---|
| Synchronisierung iPhone ↔ iPad, verschlüsselte Sicherung außerhalb der Geräte | Client und Server-Logik fertig, mit zwei simulierten Geräten getestet | **Entscheidung Anbieter** (Empfehlung Cloudflare, kostenlos) → Einrichtung (`SYNCHRONISIERUNG.md`) |
| Kennzahlen aus der Verwaltung | Client fertig und getestet (Kopplung, strikte Datenschutzprüfung, Historie) | Umsetzung in Supabase/Rork laut `AUFTRAG-VERWALTUNG.md`, zuerst in der Testumgebung |
| Automatische Instagram-Veröffentlichung und Statistiken | Schutzregeln, JPEG-Export, Datenmodell fertig | Meta-App und Business-Login, Worker-Erweiterung (`INSTAGRAM-AUTOMATIK.md`) |
| Geplante Claude-Aufgaben | Konzept und Austauschformat (`STUDIO-FORMAT.md`) | setzt die Synchronisierung voraus (`KI-AUTONOMIE.md`) |
| Lokale KI | bewertet: vorerst nicht sinnvoll | – |

## 3. Tests
- **90 automatische Tests:** Regression V1/V2/2.1, Migration, Backup, Konflikte, Sicherheit, Diagnose, Offline, Testversion, Update und Rückbau, Studio, Empfehlungen, Synchronisierung, Verwaltung, Freigabelogik.
- Lokal in drei Bildschirmgrößen (Chromium), in GitHub Actions zusätzlich WebKit.
- Nur künstliche Daten. Prüfung auf vertrauliche Inhalte bei jedem Lauf.

## 4. Offene Entscheidungen (nur du)
1. **Freigabe von Version 2.2** nach dem Gerätetest (`TESTVERSION.md`, Abschnitt C2).
2. **Synchronisierung:** Cloudflare (Empfehlung) oder Supabase. Danach legst du ein kostenloses Konto an.
3. **Verwaltung:** Freigabe, den Auftrag in `AUFTRAG-VERWALTUNG.md` umzusetzen. Zuerst Testumgebung; Rork-Credits nur wenn nötig.
4. **Instagram:** Business-Konto bestätigen, Anmeldeweg (Empfehlung: Instagram Login).
5. Später: ob eine kostenpflichtige KI-API für Echtzeit-Reaktionen gewünscht ist (geschätzt wenige €/Monat).

## 5. Nächste Arbeiten (Reihenfolge)
1. Nach deiner Freigabe: 2.2 veröffentlichen (Ablauf wie bei 2.1, `VEROEFFENTLICHUNG.md` analog).
2. Synchronisierung einrichten (Worker, CSP, `VL_SYNC_URL`), Test mit „VL Test“, dann Produktion.
3. Geplante Claude-Aufgabe „Wochenentwürfe“ (Variante B, nur Faktenliste).
4. Instagram-Veröffentlichung über den Worker.
5. Verwaltungs-Schnittstelle aktivieren, sobald die Gegenstelle existiert.

## 6. Bekannte Einschränkungen
- Bisher ist das Studio der Stufe 1 noch nicht auf echten Geräten getestet worden.
- Eigene Fotos lassen sich noch nicht in Beiträge einfügen (nur Grafik-Vorlagen).
- Die Faktenprüfung erkennt typische Probleme, kann Aussagen ohne Datenbasis aber nicht verifizieren. Die Freigabe durch dich bleibt nötig.
- KV-Speicher ist „letztlich konsistent“. Gleichzeitiges Schreiben heilt sich beim nächsten Durchlauf (getestet).

## Architektur (Kurzfassung)
Siehe `ARCHITEKTUR.md`. Module:
- **Grundlage und Daten:** `core`, `data` (Migration, Prüfung, Zusammenführen)
- **Kennzahlen und Regeln:** `metrics`, `actions` (Freigabelogik), `rules` (Regelmotor), `advice` (Empfehlungen und Maßnahmen)
- **Instagram:** `studio` (Logik), `render` (Grafiken), `studio-view` (Oberfläche)
- **Oberfläche und Bedienung:** `prompts`, `aitest`, `views`, `diag`, `app`
- **Anbindungen:** `sync` (Synchronisierung), `kpi` (Verwaltung)
- **Server:** `server/vault-core.mjs` (Tresor-Logik), `server/sync-worker.js` (Cloudflare Worker, nicht eingerichtet)
