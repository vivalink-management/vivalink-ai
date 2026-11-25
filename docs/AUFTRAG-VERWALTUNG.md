# Anbindung der Vivalink-Verwaltung an die Management AI

**Zweck:** Die Management AI übernimmt zusammengefasste Kennzahlen automatisch, ohne manuelles Übertragen. Daraus erkennt sie Entwicklungen selbst (Wochenbericht, Trends, Empfehlungen, Erfolgskontrolle).

## Stand (2.7, Entwicklungszweig)
| Teil | Stand |
|---|---|
| App (`js/kpi.js`, „Mehr › Verwaltung“) | fertig: Kopplung, Abruf höchstens alle 6 Stunden, Historie, Widerruf, wachsende Pause nach Fehlern, Hinweis bei Störung |
| Gegenstelle (`server/kpi-core.mjs`, `server/kpi-pg.mjs`) | fertig und in einer getrennten Testumgebung geprüft |
| Edge Function (`server/supabase/functions/management-kpis/index.ts`) | fertig, läuft in den Tests unverändert unter Deno; **nicht bereitgestellt** |
| Migration (`server/supabase/migrations/20261126_management_kpis.sql`) | fertig, in der Testumgebung ausgeführt; **nicht in Supabase ausgeführt** |
| Zuordnung zu den vorhandenen Auswertungen (`mapping.json`) | **offen:** braucht die lesende Bestandsaufnahme der echten Verwaltung |

## Keine Doppelentwicklung
Die Gegenstelle **berechnet nichts selbst**. Sie liest ausschließlich die Auswertungen, die die Verwaltung schon hat (Views oder parameterlose Funktionen), und zwar je Kennzahl nur zwei Spalten: Datum und Zahl. Welche Auswertung welche Kennzahl liefert, steht in `mapping.json`:

```json
"reg_total": { "source": "public.<vorhandene_view>", "date": "<datumsspalte>", "value": "<zahlenspalte>" },
"signups":   { "source": "public.<vorhandene_funktion>()", "value": "<zahlenspalte>", "snapshot": true }
```

`snapshot: true` heißt: Die Auswertung liefert nur den aktuellen Wert, das Datum ist dann „heute“. Kennzahlen ohne passende Auswertung bleiben leer und werden übersprungen. Neue Auswertungen entstehen nur, wenn du das ausdrücklich möchtest.

## Datenschutz und Sicherheit (umgesetzt und getestet)
- **Nur zusammengefasste Zahlen.** Erlaubt sind nur die Schlüssel aus `KPI_KEYS`, nur Zahlen mit Tagesdatum. Alles andere verwirft die Gegenstelle, und die App lehnt die ganze Antwort ab.
- **Eigene Rolle `management_ai` ohne Anmeldung.** Sie darf nur die zugeordneten Auswertungen lesen, keine Basistabellen mit Personendaten (Namen, E-Mail, Telefon, Zahlungen je Person) und nichts schreiben außer den eigenen Zugangstabellen. Kennzahlen werden in einer **READ-ONLY-Transaktion** mit Zeitlimit gelesen.
- **Eigenes Schema `management_ai`.** Die Supabase-API (PostgREST) liefert es nicht aus; `anon` und `authenticated` haben keinen Zugriff. **Bestehende Tabellen, Views und Funktionen der Verwaltung werden nicht verändert.** Hinzu kommen nur Leserechte für die eigene Rolle auf die zugeordneten Auswertungen.
- **Kein Service-Role-Schlüssel im Code.** Die Funktion nutzt die Verbindung, die Supabase ihr selbst bereitstellt (`SUPABASE_DB_URL`), und wechselt für jede Abfrage in die eingeschränkte Rolle.
- **Zugang je Gerät:**
  - Einmalcode (8 Ziffern, 10 Minuten gültig, kryptografisch zufällig)
  - Token mit 256 Bit; gespeichert wird nur der Hash
  - jederzeit widerrufbar
  - höchstens 60 Abrufe je Stunde und Gerät
  - nach 10 Fehlversuchen beim Koppeln 10 Minuten Sperre
- **CORS** nur für die Adresse der App; Anfragen fremder Webseiten werden abgewiesen (403).
- **Fehler:** Datenbankfehler ergeben `503` ohne Einzelheiten. Eine fehlerhafte Auswertung überspringt nur ihre Kennzahl, die übrigen werden weiter geliefert.

## Getrennte Testumgebung (automatisch bei jedem Testlauf, lokal und in GitHub Actions)
- **Aufbau:** `tests/verwaltung/env.mjs` startet eine **eigene PostgreSQL-Instanz** in einem temporären Ordner, mit nachgebildeten Supabase-Grundrechten. Darauf läuft die **unveränderte Edge Function** unter Deno, gebündelt wie für Supabase. Es gibt keine Verbindung zu Rork, Supabase oder einer produktiven Datenbank. Die Umgebung kostet nichts.
- **Künstliche Verwaltung (`tests/verwaltung/fixture.sql`):**
  - 120 künstliche Personen, davon 12 Testkonten
  - ein Demo-Meetup
  - Einladungen und Zahlungen
  - typische Dashboard-Auswertungen
  - eine Auswertung mit Personendaten, die nie erreichbar sein darf
- **`tests/verwaltung.spec.mjs` prüft:**
  - **Werte:** Sie stimmen mit einer unabhängigen Berechnung aus den Basistabellen überein. Testkonten und Demo-Meetups zählen nicht.
  - **Datenschutz:** Keine Personendaten in Antworten. Das Token liegt nicht im Klartext in der Datenbank.
  - **Datenbankrechte:** Die eigene Rolle hat keinen Zugriff auf Personendaten und darf nichts schreiben. Die API-Rollen erreichen nichts.
  - **Zugang:** Code nur einmal nutzbar, Ablauf, Sperre nach Fehlversuchen, Begrenzung, Widerruf, CORS.
  - **Abwehr:** Versuche, über die Zuordnung Befehle einzuschleusen, werden abgewiesen. Texte (z. B. E-Mail-Adressen) werden verworfen. Eine kaputte Auswertung wird übersprungen.
  - **Ausfall:** Ist die Datenbank nicht erreichbar, antwortet die Gegenstelle mit 503 ohne Einzelheiten.
  - **App Ende-zu-Ende** (iPhone und iPad, in GitHub Actions auch WebKit): Kopplung in der Oberfläche, 31 Tage Verlauf, automatische Aktualisierung nach 6 Stunden, Ausfall mit wachsender Pause und Hinweis, Widerruf (kein weiterer Abruf), erneutes Koppeln.

## Schritte zur echten Anbindung (jeweils erst nach deiner ausdrücklichen Freigabe)
| # | Schritt | Wer | Ändert produktive Systeme? |
|---|---|---|---|
| 1 | **Bestandsaufnahme, nur lesend:** `node scripts/verwaltung.mjs inventory` erzeugt eine Abfrage, die nur Namen und Spaltentypen der vorhandenen Auswertungen auflistet (keine Inhalte). Du führst sie im Supabase-SQL-Editor aus und gibst Claude das Ergebnis. | Gründer | nein (nur lesen) |
| 2 | **Zuordnung:** Claude trägt die passenden vorhandenen Auswertungen in `mapping.json` ein. Du bestätigst, ob Testkonten und Demo-Meetups dort bereits ausgeschlossen sind; erst dann wird `_meta` auf `true` gesetzt. Fehlende Kennzahlen bleiben leer. | Claude, Bestätigung Gründer | nein |
| 3 | **Test mit der echten Struktur:** Claude bildet die Struktur der Auswertungen mit künstlichen Daten in der Testumgebung nach und prüft alles erneut. | Claude | nein |
| 4 | **Supabase-Testprojekt (empfohlen):** Migration und Edge Function zuerst in einem getrennten Supabase-Projekt ausführen, z. B. im kostenlosen zweiten Projekt. | Gründer/Claude | nein (separates Projekt), **Freigabe nötig** |
| 5 | **Produktion:** <ul><li>Migration und Rechte-SQL ausführen. Das legt nur das Schema `management_ai` und eine Rolle an und vergibt Leserechte auf die zugeordneten Auswertungen.</li><li>Function mit `verify_jwt = false` bereitstellen (`node scripts/verwaltung.mjs bundle <mapping> <ordner>`).</li></ul> | Gründer bzw. Claude mit Zugang | **ja, gesonderte Freigabe** |
| 6 | **App freischalten:** Funktionsadresse als `VL_KPI_URL` in `js/config.js` und in die CSP (`connect-src`) eintragen. Erst Testversion „VL Test“, dann Veröffentlichung. | Claude | ja (App-Version), **Freigabe** |
| 7 | **Koppeln:** <ul><li>In Supabase `select management_ai.new_pair_code();` ausführen.</li><li>Den Code in der App unter „Mehr › Verwaltung“ eingeben.</li><li>Später kann das eine Schaltfläche in der Verwaltung übernehmen. Das ist der einzige Teil, der Rork betreffen würde, und ist optional.</li></ul> | Gründer | nein |

- **Rork-Credits:** Für die Schritte 1–7 werden keine gebraucht. Alles läuft über SQL und die Edge Function. Nur eine spätere Schaltfläche in der Verwaltung wäre ein Rork-Auftrag, und der ist optional.
- **Kosten:** Edge Functions und Datenbankzugriffe liegen im kostenlosen Rahmen von Supabase. Erwartet werden höchstens 4 Abrufe pro Tag und Gerät.
- **Bitte vor Schritt 5 prüfen:** <ul><li>Supabase-Tarif und Projektgrenzen (Anzahl Edge Functions, Aufrufe).</li><li>Ob die zugeordneten Views mit `security_invoker` laufen. Dann bräuchte die Rolle Leserechte auf Basistabellen, was nicht gewollt ist; solche Auswertungen würden übersprungen.</li></ul>

## Rückbau
`drop schema management_ai cascade; drop owned by management_ai; drop role management_ai;` und Edge Function löschen (in der Testumgebung automatisch geprüft: die Daten und Auswertungen der Verwaltung bleiben unverändert). Die Vivalink-Plattform und die App sind davon nicht betroffen; bereits übernommene Kennzahlen bleiben in der Management AI erhalten.
