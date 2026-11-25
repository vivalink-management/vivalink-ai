# Arbeitsweise für Claude in diesem Repository (vom Gründer festgelegt, dauerhaft gültig)

Zuerst lesen: `docs/ENTWICKLUNGSSTAND.md` (Gesamtstand, offene Entscheidungen, nächste Schritte). Am Ende jedes Auftrags aktualisieren.

## Tests und Qualität: Claude prüft selbst
1. **Automatisch prüfen.** Bei jeder Änderung laufen Funktions-, Integrations-, Sicherheits-, Speicher-, Update- und Regressionstests:
   - lokal: `npm run test:local`
   - in GitHub Actions zusätzlich WebKit (Safari-Technik)
2. **Neue Funktionen** bekommen eigene Tests in Chromium und WebKit, auf iPhone- und iPad-Bildschirmgrößen.
3. **Oberfläche selbst prüfen.** `tests/layout.spec.mjs` erkennt automatisch:
   - waagerechtes Überlaufen
   - abgeschnittene Texte und Knöpfe
   - zu kleine Tippflächen
   - verdeckte Aktionsleisten

   Neue Ansichten und Fenster dort aufnehmen. Zusätzlich Bildschirmfotos (iPhone, iPad) selbst ansehen.
4. **Probleme selbstständig erkennen und beheben**, ohne den Gründer bei jedem Schritt einzubeziehen.
   - Tests nie abschwächen, überspringen oder löschen, um grün zu werden.
   - Unzuverlässige Tests reparieren, nicht wiederholen lassen.
5. **Manuelle Gerätetests nur, wenn wirklich nötig**, d. h. wenn ein wesentliches Risiko automatisiert nicht prüfbar ist. Dann kurz begründen, warum. Beispiele:
   - Teilen-Menü von iOS
   - Home-Bildschirm-Installation
   - Kamera- und Fotoauswahl
   - Speicherlöschung durch iOS
6. **Ehrlich berichten:** Bestandene automatische Tests sind **keine Garantie** für echte Geräte. Verbleibende Risiken immer benennen.

## Grenzen (unverändert)
7. **Veröffentlichen nur nach ausdrücklicher Freigabe des Gründers:** kein Merge in `main` ohne Freigabe. Geschäftliche und strategische Entscheidungen trifft nur der Gründer.
8. **Keine kostenpflichtigen Dienste, APIs oder Credits ohne ausdrückliche Zustimmung.** Claude Pro ist keine kostenlose API.
- Keine Änderungen an Rork, der produktiven Supabase-Datenbank oder der öffentlichen Vivalink-Plattform ohne gesonderte Freigabe.
- Keine Geheimnisse, Zugangsdaten, personenbezogenen Daten oder Unternehmenskennzahlen im öffentlichen Repository. Das prüft `npm run check:sensitive`.
- Demodaten nur in der Testversion („VL Test“, Repository `vivalink-ai-test`). Keine erfundenen Fakten in Inhalten.
- Keine Aufforderungen zu manuellen Backups (automatische Sicherungspunkte sind vorhanden).
- Arbeiten auf dem Entwicklungszweig mit Pull Request; die Testversion darf ohne Freigabe aktualisiert werden.

## Technik in Kürze
- Statische PWA ohne Build-Schritt; Skripte in der Reihenfolge aus `index.html`.
- Bei neuer Version gemeinsam erhöhen (automatisch geprüft):
  - `APP_VERSION` (`js/core.js`)
  - `VERSION` (`sw.js`)
  - `package.json`
  - `?v=` in `index.html`
- Neue Skriptdateien: in `index.html` **und** in die Offline-Liste von `sw.js` eintragen.
- Datenformat ändern: `SCHEMA` erhöhen, Migration ergänzen, Update- und Rückbau-Tests ergänzen.
- Testversion bauen: `node scripts/build-test.mjs` → Inhalt von `dist-test/` ins Repository `vivalink-ai-test` übernehmen.
