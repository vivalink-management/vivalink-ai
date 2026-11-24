# Synchronisierung iPhone ↔ iPad: Entscheidungsvorlage und Technik

**Stand:** Technik fertig entwickelt und getestet (`js/sync.js`, `server/vault-core.mjs`, `tests/sync.spec.mjs`).
**Noch nicht aktiv:** Ein Server ist nicht eingerichtet. Ohne Freigabe sendet die App nichts.

## Funktionsweise
- **Kopplung:** Das erste Gerät erzeugt einen Kopplungscode (20 Zeichen, 100 Bit Zufall). Das zweite Gerät gibt ihn einmal ein. Es gibt kein Konto und kein Passwort.
- **Aus dem Code abgeleitet:**
  - **Tresor-Adresse:** zufällig, verrät nichts über den Inhalt
  - **Zugangs-Token:** Der Server speichert nur dessen Hash.
  - **Schlüssel:** PBKDF2 mit 210.000 Runden, AES-GCM 256 Bit
- **Ende-zu-Ende verschlüsselt:** Der Server sieht nur einen verschlüsselten Block und eine Versionsnummer. Weder Inhalte noch Namen noch der Code verlassen das Gerät im Klartext (getestet).
- **Zusammenführen:**
  - Es nutzt dieselbe Logik wie beim Backup, einschließlich Konflikterkennung („Mehr › Datenkonflikte“).
  - Vor jeder Übernahme wird ein Rückgängig-Punkt angelegt.
  - Schreiben beide Geräte gleichzeitig, wird erneut geholt und zusammengeführt (getestet).
- **Kein endloses Hin und Her:** Inhaltlich gleiche Stände werden nicht erneut geschrieben (getestet).
  - Nicht verglichen werden Zeitstempel, die Reihenfolge der Einträge und leere Werte.
  - Gerätebezogene Einstellungen werden nicht synchronisiert: Akzentfarbe, Konfliktliste, Lerndaten.
- **Automatik:** Beim Start und einige Sekunden nach jeder Änderung, wenn online. Offline arbeitet die App normal weiter.
- **Fehlerfall:** Unlesbare oder manipulierte Serverdaten führen zu keiner Änderung und werden im Protokoll gemeldet (getestet).
- **Sicherung außerhalb der Geräte:** Der verschlüsselte Tresor ist zugleich die Sicherung. Bei Geräteverlust genügt der Kopplungscode auf einem neuen Gerät.

## Anbieter-Vergleich (kostenlose Tarife, geprüft November 2026)

| Kriterium | **Cloudflare Workers + KV** (Empfehlung) | Supabase Free (eigenes Projekt) | Bereich im produktiven Supabase-Projekt |
|---|---|---|---|
| Kosten | 0 € (100.000 Anfragen/Tag; KV: 100.000 Lese- und 1.000 Schreibvorgänge/Tag) | 0 € (2 aktive Projekte, 500 MB) | 0 € |
| Bedarf bei 2 Geräten | ca. 20–200 Schreibvorgänge/Tag → weit unter dem Limit | gering | gering |
| Pausieren bei Inaktivität | nein | ja, nach 7 Tagen | nein |
| Trennung von der Vivalink-Plattform | vollständig getrennt | getrennt, belegt aber den zweiten kostenlosen Projektplatz (geplant für die Rork-Testumgebung) | **nicht getrennt**: Fehlkonfiguration könnte die Plattform betreffen |
| Konto | neues kostenloses Cloudflare-Konto | vorhanden | vorhanden |
| Sicherheit | Ende-zu-Ende verschlüsselt, der Anbieter sieht nichts | ebenso | ebenso, aber gleiche Angriffsfläche wie die Produktion |
| Spätere Erweiterung | Worker auch für Instagram-Veröffentlichung, Zeitpläne (Cron Triggers) und geschützte Zugangsdaten nutzbar | Edge Functions, `pg_cron` | nicht empfohlen |

**Empfehlung: Cloudflare Workers + KV.**
- Kostenlos, pausiert nicht und ist vollständig von der Produktion getrennt.
- Derselbe Worker kann später die Instagram-Veröffentlichung und zeitgesteuerte Aufgaben übernehmen. Ein zweites System entsteht nicht.

**Hinweis zu KV:** KV ist „letztlich konsistent“. Schreiben beide Geräte gleichzeitig, kann ein Schreibvorgang kurzzeitig überschrieben werden. Weil jedes Gerät seinen vollständigen Stand behält und beim nächsten Durchlauf erneut zusammenführt, gehen dabei keine Daten verloren (getestet). Für strikte Atomarität wäre später Cloudflare D1 möglich, ebenfalls kostenlos.

Quellen: [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits), [Cloudflare KV Limits](https://developers.cloudflare.com/kv/platform/limits), [Cloudflare D1 Free-Tier](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/), [Supabase Pricing](https://supabase.com/docs/pricing), [Supabase Free Tier 2026](https://automationatlas.io/answers/supabase-free-tier-limits-2026/).

## Einrichtung nach Freigabe (ca. 15 Minuten; Claude erledigt alles außer der Kontoanlage)
1. Der Gründer legt ein kostenloses Cloudflare-Konto an. Eine Kreditkarte ist für den kostenlosen Tarif nicht nötig, das bitte bei der Anmeldung prüfen.
2. KV-Namespace `VAULT` anlegen. `server/sync-worker.js` und `server/vault-core.mjs` als Worker veröffentlichen, `ALLOWED_ORIGIN` = `https://vivalink-management.github.io`.
3. In `js/config.js` `window.VL_SYNC_URL` setzen. In der Content-Security-Policy (`index.html`, `connect-src`) die Worker-Adresse ergänzen. Zuerst in der Testversion, dann per Pull Request.
4. iPhone: **Mehr › Synchronisierung › Neue Synchronisierung einrichten**. iPad: Code eingeben, **Verbinden**.
5. Den Kopplungscode zusätzlich sicher aufbewahren, z. B. in einer gesperrten Notiz.
