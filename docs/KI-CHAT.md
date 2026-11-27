# KI-Chat und Sprachmodus (ab Version 2.11)

Ein Assistent, ein Gesprächsverlauf: Schreiben und Sprechen landen im selben Chat. Der Bereich heißt „KI-Chat“
(Navigation). Die bisherigen „Aufträge an ChatGPT/Claude“ sind oben über die Umschaltung erreichbar.

## Was heute ohne Zusatzkosten funktioniert (getestet)

| Bereich | Stand |
|---|---|
| Chats | beliebig viele, automatisch benannt, umbenennen, früheren Chat fortsetzen, löschen (zweimal tippen), Nachrichten kopieren, Verlauf bleibt nach Neustart |
| Antworten | **lokaler Assistent ohne KI-Modell**: versteht feste Anliegen zu deinen Vivalink-Daten, keine freie Unterhaltung. Jede Aussage ist gekennzeichnet: Fakt, Testdaten (getrennt), Annahme, Empfehlung |
| Daten | Kennzahlen nur verifiziert (Testkonten ausgeschlossen); Befunde, Maßnahmen, Aufgaben, Meetup, Instagram-Planung, technischer Zustand und Gedächtnis aus den vorhandenen Funktionen. Vertrauliche Gedächtniseinträge erscheinen nie im Chat |
| Aufträge | über die bestehende Freigabelogik: Aufgaben anlegen/abhaken, Instagram-**Entwürfe** nach dem vorhandenen Rhythmus, Datenreparatur – selbstständig mit „Rückgängig“. Ins Gedächtnis übernehmen und Löschen nur durch Tippen. Veröffentlichen, Zahlungen, Preise und Produktivsysteme: nie |
| Gedächtnis | nichts wird automatisch zur Erinnerung; Übernahme nur nach Bestätigung. Lange Chats: Kurzfassung (ohne KI erstellt) als Kontext, Nachrichten bleiben erhalten |
| Sprachmodus | Spracherkennung und Stimme des Geräts: zuhören → Sprechpause erkannt → Antwort im Chat → vorlesen → wieder zuhören, ohne Tastendruck je Satz. Unterbrechen per Taste; per Stimme nur experimentell. Rote Anzeige, solange aktiv; Ende per Taste, bei Verlassen der App oder nach 60 s Stille |
| Synchronisierung | über die vorhandene Ende-zu-Ende-verschlüsselte Synchronisierung. Je Chat die neuesten 80 Nachrichten, insgesamt höchstens ca. 1,5 MB Text; Älteres bleibt auf dem Gerät |
| Offline | lokaler Assistent funktioniert ohne Internet |

## Ehrliche Einschränkungen

- **Kein Sprachmodell aktiv.** Ohne KI-Modell ist es kein „ChatGPT“: freie Fragen, Diskussionen und Texte schreiben
  kann der lokale Assistent nicht. Er sagt das ausdrücklich.
- **Spracherkennung in der installierten iPhone-/iPad-App:** Laut WebKit-Fehlerberichten und Entwicklerforen fehlt
  Safaris Spracherkennung in Web-Apps, die auf dem Home-Bildschirm installiert sind. Dann zeigt die App den
  **Diktiermodus** an: Diktat über die Tastatur, Antworten werden vorgelesen. Das ist ausdrücklich kein Sprachmodus.
  Im Safari-Tab funktioniert die Spracherkennung. Mit der vorbereiteten KI-Gegenstelle geht es auch in der
  installierten App (Aufnahme und Spracherkennung über den Server).
- **Kein Echtzeit-Sprachmodus.** Zuhören und Antworten wechseln sich ab. Unterbrechen während der Antwort per Stimme
  ist unsicher (die App kann ihre eigene Stimme hören) und deshalb standardmäßig aus.
- Gerätetest nötig: Mikrofonfreigabe, Stimmenqualität (unter iOS „Einstellungen › Bedienungshilfen › Gesprochene
  Inhalte › Stimmen › Deutsch“ eine „erweiterte“ Stimme laden) und das Verhalten der installierten App lassen sich
  nur auf echten Geräten prüfen.

## Vorbereitet: echtes KI-Modell ohne Zusatzkosten (braucht deine Freigabe)

**Cloudflare Workers AI im vorhandenen Cloudflare-Konto**, eigener kleiner Worker `vivalink-ki`
(`server/ki-worker.js`, `server/ki-core.mjs`, `server/ki-wrangler.toml`), nicht bereitgestellt.

- **Modell:** Llama 3.3 70B (Werkzeugaufrufe auf deine App-Funktionen). Spracherkennung: Whisper large v3 turbo.
- **Kosten:** kostenloses Kontingent von 10.000 „Neurons“ pro Tag. Der Worker begrenzt selbst auf 9.000 und lehnt
  darüber ab. So entstehen auch im kostenpflichtigen Workers-Tarif keine Kosten.
  - Grob: eine Chatfrage mit Werkzeugaufruf kostet etwa 300 Neurons → ca. 25–30 Fragen am Tag.
  - Spracherkennung kostet etwa 47 Neurons je Minute.
  - Bitte im Cloudflare-Konto prüfen, ob der kostenlose oder der kostenpflichtige Workers-Tarif aktiv ist.
- **Zugang:** nur gekoppelte Geräte, mit demselben Tresor-Zugang wie die Synchronisierung. Kein API-Schlüssel im
  Browser, Begrenzung je Gerät und Stunde, keine Speicherung oder Protokollierung von Inhalten.
- **Datenschutz:** Laut Cloudflare werden Inhalte nicht zum Training verwendet. In den KI-Einstellungen gibst du
  einzeln frei, welche Bereiche an das Modell gehen dürfen:
  - Kennzahlen
  - Aufgaben
  - Meetup
  - Instagram
  - Gedächtnis ohne vertrauliche Einträge
  - Technik

  Ohne Freigabe sagt der Assistent, dass ihm die Daten fehlen.
- **Sicherheit:** Riskante Anliegen werden vor jedem Modell abgelehnt. Aufträge des Modells laufen über dieselbe
  Freigabelogik. Fällt das Modell aus oder ist das Tageskontingent erreicht, antwortet der lokale Assistent mit Hinweis.

**Einrichtung nach Freigabe:**
1. Den Worker bereitstellen.
2. Seine Adresse in `js/config.js` (`VL_KI_URL`) und in die Sicherheitsrichtlinie eintragen.
3. Neue App-Version veröffentlichen (mit Freigabe).
4. In der App unter KI-Einstellungen einschalten und die Datenbereiche freigeben.

Für den Zugang muss die Synchronisierung eingerichtet sein.

## Kostenpflichtige Alternative: Echtzeit-Sprachmodus (nur zur Information, nichts aktiviert)

ChatGPT Plus und Claude Pro enthalten **keine** API-Nutzung für eigene Apps.

- **Anbieter:** Ein echter Echtzeit-Sprachmodus wie in ChatGPT (gleichzeitig zuhören und sprechen, natürliches
  Unterbrechen, sehr natürliche Stimme) bräuchte z. B. die **OpenAI Realtime API**. Die Verbindung liefe über einen
  eigenen Worker, damit kein Schlüssel im Browser steht.
- **Preise laut OpenAI:**
  - `gpt-realtime`: Audio 32 $ je 1 Mio. Eingabe-Tokens, 64 $ je 1 Mio. Ausgabe-Tokens.
  - `gpt-realtime-mini`: etwa 10 $ / 20 $.
- **Grobe Schätzung pro Stunde** bei 600 Tokens je Minute Zuhören und 1.200 je Minute Sprechen, halb/halb:
  - `gpt-realtime`: ca. 3–6 $ je Stunde Gespräch.
  - `mini`: ca. 1–2 $ je Stunde.
  - Der Gesprächskontext kommt hinzu. Die Werte sind Schätzungen; vor einer Entscheidung am Preisrechner prüfen.
- **Regelmäßige Nutzung** (20 Minuten täglich, ca. 10 Stunden im Monat): etwa 30–60 $ im Monat (`gpt-realtime`)
  bzw. 10–20 $ (`mini`).
- **Ausgabenlimits:** OpenAI rechnet über vorausbezahltes Guthaben ab; ohne automatische Aufladung endet die Nutzung,
  wenn es verbraucht ist. Zusätzlich gibt es Budgets je Projekt. Auch ein eigenes Tageslimit im Worker ist möglich
  (wie bei `vivalink-ki`).

Nichts davon ist eingerichtet. Kein Schlüssel und kein kostenpflichtiger Dienst wurden angelegt.
