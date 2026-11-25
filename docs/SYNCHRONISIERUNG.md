# Synchronisierung iPhone ↔ iPad: Entscheidungsvorlage und Technik

**Stand (2.5):** Technik fertig. Getestet mit simulierten Geräten und **gegen den echten Cloudflare Worker in der Cloudflare-Laufzeit** (`tests/worker.spec.mjs`, bei jeder Änderung in GitHub Actions). **Entscheidung des Gründers: Cloudflare, kostenloser Tarif.** Speicher: Cloudflare D1 (atomare Versionsprüfung, 100.000 Schreibvorgänge pro Tag kostenlos).
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

## Einrichtung (Cloudflare, kostenlos)
**Gründer (einmalig, ca. 10 Minuten):**
1. Kostenloses Konto: https://dash.cloudflare.com/sign-up (E-Mail bestätigen; für den kostenlosen Tarif keine Zahlungsdaten eingeben).
2. **Workers & Pages** öffnen. Wird eine workers.dev-Subdomain verlangt, einen neutralen Namen wählen (ohne Personennamen).
3. **Profil (oben rechts) → API Tokens → Create Token → Vorlage „Edit Cloudflare Workers“ → Use template**:
   - zusätzlich **„+ Add more“ → Account · D1 · Edit**
   - bei „Account Resources“ das eigene Konto
   - **Continue to summary → Create Token** → Token kopieren
4. Das Token **nur** in das sichere Formular in Claude einfügen (nicht in den Chat). Claude sieht den Wert nie; er gilt nur für Anfragen an api.cloudflare.com.

**Claude (selbstständig):**
- D1-Datenbank `vivalink-sync` anlegen und `database_id` in `server/wrangler.toml` eintragen (keine Geheimnisse).
- `wrangler deploy` aus `server/` ausführen, Erreichbarkeit und Herkunftsprüfung testen.
- Worker-Adresse in `js/config.js` (`VL_SYNC_URL`) und in die CSP (`connect-src`) eintragen.
- Zuerst die Testversion, danach Pull Request.
- Veröffentlichung der App nur nach Freigabe.

**Danach auf den Geräten:**
1. iPhone: **Mehr › Synchronisierung › Synchronisierung einrichten** → Wiederherstellungsschlüssel sicher aufbewahren.
2. **Weiteres Gerät koppeln** → iPad: Code eingeben → Prüfzahlen vergleichen → auf dem iPhone bestätigen.

**Kosten:** Der kostenlose Tarif reicht deutlich (Bedarf: wenige hundert Anfragen und Schreibvorgänge pro Tag). Bei Überschreitung lehnt Cloudflare Anfragen ab, es entstehen keine Kosten ohne Tarifwechsel.
