# Auftrag: Lesende Kennzahlen-Schnittstelle der Vivalink-Verwaltung (für Rork / Supabase)

**Zweck:** Die Management AI übernimmt zusammengefasste Kennzahlen automatisch, ohne manuelles Übertragen.
**Gegenseite in der Management AI:** fertig entwickelt und getestet (`js/kpi.js`, Oberfläche unter „Mehr › Kennzahlen aus der Verwaltung“, automatischer Abruf höchstens alle 6 Stunden).
**Gegenstelle der Verwaltung: vorbereitet und mit künstlichen Daten getestet (2.6):**
- **Logik:** `server/kpi-core.mjs`, dieselbe Logik in Tests und Edge Function
- **Supabase-Vorlagen** (nicht bereitgestellt):
  - Migration: `server/supabase/migrations/20261126_management_kpis.sql`
  - Edge Function: `server/supabase/functions/management-kpis/index.ts`
  - Zuordnung: `server/supabase/functions/management-kpis/mapping.json`

## Keine Doppelentwicklung
Die Verwaltung besitzt bereits umfangreiche Auswertungen. Die Gegenstelle **berechnet nichts neu**. In `mapping.json` wird je Schlüssel die **vorhandene** Auswertung (View oder Funktion) eingetragen, die Zeilen `{date, value}` liefert. Leere Einträge werden übersprungen.

## Umsetzung (nach gesonderter Freigabe, zuerst Testumgebung, ohne Rork-Credits soweit möglich)
1. **Bestandsaufnahme (lesend):** vorhandene Auswertungen der Verwaltung den Schlüsseln zuordnen → `mapping.json`.
2. **Migration** in der Supabase-Testumgebung ausführen: drei Tabellen, RLS aktiv, keine Policies.
3. **Edge Function bereitstellen:**
   - `kpi-core.mjs` in den Funktionsordner kopieren.
   - Der Service-Role-Schlüssel kommt nur aus der Umgebungsvariable der Funktion.
4. **Kopplungscode in der Verwaltung:**
   - SHA-256 von `vivalink-pair:<Code>` in `management_pair_codes` speichern (Ablauf 10 Minuten).
   - Erzeugung durch einen Admin; das kann zunächst ein SQL-Befehl sein, später eine Schaltfläche in Rork.
5. **In der Management AI:**
   - Funktionsadresse als `VL_KPI_URL` in `js/config.js` und in die CSP (`connect-src`) eintragen.
   - Test mit „VL Test“, dann Freigabe.
**Ausführung:** erst nach Freigabe durch den Gründer, zuerst in der **Supabase-Testumgebung**, dann in der Produktion. Rork-Credits nur, wenn ohne Rork nicht umsetzbar.

## Grundsätze
- **Nur lesend.** Nur zusammengefasste Zahlen, **keine Personendaten**: keine Namen, E-Mail-Adressen, Telefonnummern oder Nutzer-IDs.
- Testkonten und Demo-Meetups sind ausgeschlossen.
- **Zugriff:**
  - Kein direkter Datenbankzugriff aus dem Browser. Der Service-Role-Schlüssel bleibt ausschließlich serverseitig.
  - Zugriff nur über eine Edge Function mit **widerrufbaren Gerätezugängen**.

## 1. Datenbank (Migration, zuerst Testumgebung)
- **Tabelle `management_devices`:**
  - Felder: `id uuid`, `name text`, `token_hash text` (SHA-256), `created_at`, `last_used_at`, `revoked_at`
  - RLS aktiv, keine Policies für `anon`/`authenticated`.
- **Tabelle `management_pair_codes`:**
  - Felder: `code_hash text`, `expires_at` (10 Minuten), `used_at`
  - Codes werden in der Verwaltung von einem Admin erzeugt.
- **Views oder SQL-Funktionen** (nur zusammengefasste Werte, je Tag), mit Testkonto- und Demo-Filter:

| `key` | Bedeutung |
|---|---|
| `reg_total` | Registrierungen gesamt |
| `reg_week` | neue Registrierungen letzte 7 Tage |
| `active_users` | aktive Nutzer letzte 30 Tage |
| `signups` | Anmeldungen zum nächsten Meetup |
| `attend` | tatsächliche Teilnehmer letztes Meetup, falls erfasst |
| `noshow` | Absagen und Nichterscheinen letztes Meetup |
| `invites` | versendete Einladungen letzte 7 Tage |
| `invite_rate` | Annahmequote in % |
| `payments` | Zahlungen letzte 30 Tage, € |
| `refunds` | Erstattungen letzte 30 Tage, € |
| `inc` | Einnahmen, falls verlässlich |
| `exp` | Ausgaben, falls verlässlich |

## 2. Edge Function `management-kpis`
- `POST /pair`, Body `{code, device}`:
  - Code prüfen (Hash, Ablauf, einmalig) und einen neuen Token erzeugen (32 Byte, hex). Nur dessen Hash wird gespeichert.
  - Antwort `{token}`; bei Fehler 401 oder 410.
- `GET /kpis`, Header `Authorization: Bearer <token>`:
  - Token-Hash prüfen, `revoked_at` muss leer sein.
  - Antwort **genau** in diesem Format (zusätzliche Felder führen in der App zur Ablehnung):

```json
{"format":"vivalink-kpis","version":1,"generatedAt":"2026-03-10T06:00:00Z",
 "meta":{"excludesTestAccounts":true,"excludesDemoMeetups":true,"timezone":"Europe/Berlin"},
 "values":[{"key":"reg_total","date":"2026-03-09","value":321,"source":"supabase"}]}
```

- CORS nur für `https://vivalink-management.github.io`. Begrenzung: höchstens 60 Abrufe pro Stunde und Gerät.

## 3. Verwaltung (Rork)
- Bereich „Management AI“: **Kopplungscode erzeugen** (6–8 Ziffern, 10 Minuten gültig).
- Liste der gekoppelten Geräte mit **Widerrufen**.

## 4. Tests (Pflicht vor Produktion)
- Antwort enthält keine Personendaten. Automatischer Test: Schlüssel gegen eine Positivliste prüfen.
- Testkonten und Demo-Meetups sind nicht mitgezählt.
- Widerrufener Token → 401. Abgelaufener oder doppelt genutzter Code → 401/410.
- Ohne Token → 401. Mit `anon`-Schlüssel kein Zugriff auf die neuen Tabellen.

## 5. Rückbau
Edge Function deaktivieren, Tabellen löschen. Die Vivalink-App ist nicht betroffen.

## Historie in der Management AI
- Jeder Abruf speichert Tageswerte als Kennzahl-Einträge (Quelle „verwaltung“), ohne Doppelungen.
- Über die Synchronisierung liegt die Historie auf beiden Geräten.
- Verläufe, Ziele, Regelmotor und Maßnahmenkontrolle nutzen diese Werte automatisch.
