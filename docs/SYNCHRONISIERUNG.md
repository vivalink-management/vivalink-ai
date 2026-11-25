# Synchronisierung iPhone ↔ iPad: Entscheidungsvorlage und Technik

**Stand:** Technik fertig entwickelt und getestet (`js/sync.js`, `server/vault-core.mjs`, `tests/sync.spec.mjs`). Sicherheitskonzept in Version 2.3 grundlegend überarbeitet.
**Noch nicht aktiv:** Ein Server ist nicht eingerichtet. Ohne Freigabe sendet die App nichts.

## Sicherheitskonzept (Version 2.3)
Grundsatz: Ein kurzer Code darf nie allein die dauerhafte Verschlüsselung tragen.

| Baustein | Umsetzung |
|---|---|
| **Tresor-Schlüssel** | 256 Bit echter Zufall je Tresor (nicht aus einem Code abgeleitet). Daten mit AES-GCM 256 verschlüsselt, an Tresor und Schlüsselversion gebunden. |
| **Tresor-Adresse und Zugang** | zufällige ID (128 Bit) und Token (256 Bit). Der Server speichert nur den Hash des Tokens. |
| **Ablage** | Schlüssel nur im Gerätespeicher; nie im Backup, nie auf dem Server, nie im Code (getestet). |
| **Neues Gerät koppeln** | Auf dem gekoppelten Gerät „Weiteres Gerät koppeln“ → 8-stelliger Einmal-Code (10 Minuten gültig, einmalig). Der Code findet nur den Kopplungsplatz. Die Schlüssel werden per **ECDH-Schlüsselvereinbarung (P-256)** übertragen; beide Geräte zeigen eine **6-stellige Prüfzahl**. Nur wenn sie übereinstimmt, bestätigst du auf dem gekoppelten Gerät. So kann weder der Server noch jemand mit dem Code mitlesen oder sich dazwischenschalten. |
| **Wiederherstellung** | Wiederherstellungsschlüssel (32 Zeichen, 160 Bit Zufall), einmalig angezeigt. Damit kommst du an deine Daten, wenn **alle** Geräte verloren sind. Neu erzeugen macht den alten ungültig. |
| **Gerät verloren / Verdacht** | „Schlüssel erneuern“: neuer Tresor mit neuem Schlüssel, alter Tresor gesperrt (Daten dort gelöscht). Das verlorene Gerät erhält nichts mehr; deine übrigen Geräte koppelst du einmal neu; neuer Wiederherstellungsschlüssel. |
| **Unbefugter Zugriff** | Fehlversuche je Absender begrenzt (30 je 10 Minuten); Kopplungsplätze laufen ab; Bestätigung nur auf einem gekoppelten Gerät; Berechtigung Stufe 2 und Aktionsprotokoll. |
| **Server verliert Daten** | Kein stilles Neuanlegen: Die App meldet den Fehler, alle Daten bleiben auf den Geräten. „Schlüssel erneuern“ legt den Tresor neu an. |

**Was bleibt:**
- Ein gestohlenes, **entsperrtes** Gerät kann die bis dahin vorhandenen Daten lesen. Dagegen schützt die Gerätesperre von iOS.
- Gehen alle Geräte **und** der Wiederherstellungsschlüssel verloren, sind die Daten nicht wiederherstellbar. Das ist bei echter Ende-zu-Ende-Verschlüsselung gewollt.
- Ein Angreifer könnte mit vielen Fehlversuchen die kostenlosen KV-Schreibvorgänge eines Tages aufbrauchen. Folge: die Synchronisierung ruht bis zum nächsten Tag, Daten gehen nicht verloren. Gegenmittel: die kostenlose Rate-Limit-Regel von Cloudflare.

## Ablauf
- **Zusammenführen:** gleiche Logik wie beim Backup, einschließlich Konflikterkennung („Mehr › Datenkonflikte“). Vor jeder Übernahme ein Rückgängig-Punkt.
- **Gleichzeitige Änderungen:** Schreiben zwei Geräte gleichzeitig, lehnt der Server den zweiten Schreibvorgang ab (Versionsnummer); das Gerät holt neu und führt zusammen (getestet).
- **Kein endloses Hin und Her:** inhaltlich gleiche Stände werden nicht erneut geschrieben (getestet). Gerätebezogenes (Akzentfarbe, Konfliktliste, Lerndaten) bleibt lokal.
- **Automatik:** beim Start und einige Sekunden nach jeder Änderung, wenn online. Offline arbeitet die App normal weiter.
- **Fehlerfall:** Unlesbare oder manipulierte Serverdaten führen zu keiner Änderung und werden protokolliert (getestet).
- **Geräteliste:** Jedes Gerät trägt sich (Name, letzter Kontakt) verschlüsselt ein.

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
4. iPhone: **Mehr › Synchronisierung › Synchronisierung einrichten** → Wiederherstellungsschlüssel sicher aufbewahren (ausgedruckt oder Passwort-Manager).
5. iPhone: **Weiteres Gerät koppeln** → iPad: Code eingeben → Prüfzahlen vergleichen → auf dem iPhone bestätigen.
6. Die Kostenlos-Grenzen von Cloudflare prüfen; optional die kostenlose Rate-Limit-Regel für den Worker aktivieren.
