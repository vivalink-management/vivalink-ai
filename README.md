# Vivalink Management AI

Interne Management-App für Vivalink. Statische Web-App (PWA) für iPhone und iPad, ohne Server und ohne Build-Schritt. Alle Daten liegen ausschließlich im Gerätespeicher (IndexedDB).

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Oberfläche, Gestaltung, Sicherheitsrichtlinie (CSP), Einbindung der Skripte |
| `js/core.js` | Konstanten, Hilfsfunktionen, Speicher, technisches Protokoll |
| `js/data.js` | Datenversionen und Migration, Eingangsprüfung, Zusammenführen mit Konflikterkennung, Backup-Format, Integritätsprüfung |
| `js/metrics.js` | Kennzahlen und nächstes Meetup |
| `js/studio.js` | Instagram-Studio: Planung, KI-Auftrag, Prüfung, automatische Entwürfe, Auswertung (ohne Oberfläche) |
| `js/render.js` | Instagram-Grafiken (Feed, Story) mit Logo, Farben und Schrift |
| `js/studio-view.js` | Instagram-Studio: Oberfläche |
| `brand/` | Offizielles Logo (freigestellt, weiß, Symbol), Schrift Nunito (OFL) |
| `js/rules.js` | Regelmotor (feste Regeln, keine KI) |
| `js/prompts.js` | Arbeitsaufträge für Claude / ChatGPT |
| `js/aitest.js` | KI-Test (lokale KI) |
| `js/views.js` | Ansichten und Formulare |
| `js/diag.js` | Diagnose, Konfliktanzeige, Backup-Dialoge |
| `js/app.js` | Bedienlogik und Start |
| `js/advice.js` | Empfehlungen, Maßnahmen, Erfolgskontrolle |
| `js/manage.js` | Heute zu tun, Entscheidungen, Entwicklungen, Aufgaben-Abhängigkeiten, Risiken |
| `js/autonomy.js` | Autonomie-Zyklus, widerrufbare Berechtigungen, Aufgaben-Kanal für geplante KI-Aufgaben |
| `js/actions.js` | Freigabelogik (Stufen 0–3), Aktionsprotokoll, Veröffentlichungsschutz |
| `js/sync.js` | Synchronisierung (Ende-zu-Ende verschlüsselt, Kopplung mit Prüfzahl, Wiederherstellung), vorbereitet |
| `scripts/ki-aufgabe.mjs` | Brücke für geplante Claude-Aufgaben (Auftrag holen, Entwürfe abgeben), vorbereitet |
| `js/kpi.js` | Kennzahlen aus der Verwaltung, vorbereitet |
| `server/` | Tresor-Server (Logik + Cloudflare Worker, nicht eingerichtet) |
| `js/config.js` | Ausgabekanal (echte App oder Testversion) |
| `test-build/demo.js` | Künstliche Demodaten, wird nur in die Testversion eingebaut |
| `sw.js` | Service Worker (Offline-Betrieb, Home-Bildschirm) |

Die Skripte sind klassische Skripte mit gemeinsamem Gültigkeitsbereich und werden in der Reihenfolge aus `index.html` geladen.

## Tests

```bash
npm ci
npm run test:local   # Chromium: Desktop, iPhone- und iPad-Bildschirm
npm test             # zusätzlich WebKit, wenn installiert (in GitHub Actions automatisch)
```

- `scripts/check-sensitive.mjs` verhindert vertrauliche Inhalte im öffentlichen Code: Zugangsdaten, Schlüssel, echte Kontaktdaten, Unternehmenswerte.
- `scripts/check-syntax.mjs` prüft Syntax, doppelte Namen und die Offline-Dateiliste.
- Tests verwenden **ausschließlich künstliche Daten** (`tests/fixtures.mjs`).
- GitHub Actions (`.github/workflows/tests.yml`) führt alle Prüfungen bei jeder Änderung aus. Der Ablauf veröffentlicht nichts.

## Getrennte Testversion

```bash
npm run build:test   # erzeugt dist-test/ mit eigenem Speicher, Symbol „TEST“ und Demodaten
```

Veröffentlichung nur im separaten Repository `vivalink-ai-test` (siehe `docs/TESTVERSION.md`).

## Regeln

- Keine Unternehmenskennzahlen, personenbezogenen Daten oder Zugangsdaten im Code. Werte gehören in die App-Daten.
- Änderungen nur über einen Entwicklungszweig und einen Pull Request. `main` wird über GitHub Pages veröffentlicht.
- Bei jeder neuen Version `APP_VERSION` (js/core.js), `VERSION` (sw.js), `version` (package.json) und `?v=` in index.html gemeinsam erhöhen (automatisch geprüft).
- Vor Änderungen am Datenformat: `SCHEMA` erhöhen, Migration ergänzen und Tests für alle älteren Versionen ergänzen. Die App legt vor jeder Migration automatisch eine geprüfte Sicherheitskopie an.

**Zentrale Entwicklungsübersicht:** [`docs/ENTWICKLUNGSSTAND.md`](docs/ENTWICKLUNGSSTAND.md)

Weitere Unterlagen: [`docs/SYNCHRONISIERUNG.md`](docs/SYNCHRONISIERUNG.md) · [`docs/AUFTRAG-VERWALTUNG.md`](docs/AUFTRAG-VERWALTUNG.md) · [`docs/KI-AUTONOMIE.md`](docs/KI-AUTONOMIE.md) · [`docs/INSTAGRAM-AUTOMATIK.md`](docs/INSTAGRAM-AUTOMATIK.md) · [`docs/PROJEKT.md`](docs/PROJEKT.md) · [`docs/TESTBERICHT.md`](docs/TESTBERICHT.md) · [`docs/GERAETETEST.md`](docs/GERAETETEST.md) · [`docs/TESTVERSION.md`](docs/TESTVERSION.md) · [`docs/VEROEFFENTLICHUNG.md`](docs/VEROEFFENTLICHUNG.md) · [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md) · [`docs/STUDIO-FORMAT.md`](docs/STUDIO-FORMAT.md) · [`CHANGELOG.md`](CHANGELOG.md)
