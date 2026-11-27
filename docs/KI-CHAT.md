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

## Robustheit des Sprachmodus (ab 2.11.1)

- Keine endlosen Wiederholungen: Geräte-Erkennung höchstens drei Neustarts; Server-Erkennung höchstens ein
  Wiederholversuch bei Fehlern und drei leere Ergebnisse. Danach Ende mit verständlichem Hinweis.
- Zeitgrenzen für jede Phase: Mikrofon 15 s, Aufnahme 30 s, Server-Erkennung 30 s, Antwort 75 s, Vorlesen je Satz;
  60 s ohne Eingabe beenden den Sprachmodus.
- „Beenden“ wirkt jederzeit, auch während „denke nach“. Danach wirkt kein alter Rückruf mehr.
- „Fertig gesprochen“ beendet die Aufnahme sofort (wichtig, wenn iOS die Pegelmessung nicht freigibt).
- Installierte App unter iOS/iPadOS: Mit freigegebener KI wird die Server-Erkennung genutzt, sonst die
  Geräte-Erkennung mit Begrenzung und danach der Diktiermodus.
- Kosten: Server-Erkennung nutzt das kostenlose Tageskontingent (ca. 47 Neurons je Minute Sprache). Stille wird nicht
  gesendet.

## Gesprächsfluss und sichere Aufträge (ab 2.12)

**Sprachmodus**
- Ablauf: Du sprichst → Pause erkannt → Antwort im Chat → vorgelesen (kurz) → die App hört wieder zu.
- Bildschirm: bleibt während des Sprachmodus an (Screen Wake Lock; in der installierten App ab iOS/iPadOS 18.4).
- Ende nur durch:
  - „Beenden“
  - 2 Minuten ohne verständliche Eingabe (20 s vorher Countdown mit „Weiter zuhören“)
  - App im Hintergrund oder gesperrter Bildschirm
  - dauerhafte technische Störung: Mikrofon verweigert; Spracherkennung dreimal hintereinander gestört; acht Aufnahmen
    hintereinander nur mit Geräuschen (Kostenschutz)
- Jedes dieser Enden steht mit Grund und „Erneut starten“ im Chat.
- Langsame Antworten, einzelne Fehlschläge, Geräusche und Fehlerkennungen beenden nichts.
- Vorlesen:
  - Vorher werden Aufnahme bzw. Erkennung beendet und kurz gewartet.
  - Startet die Ausgabe nicht, folgt ein zweiter Versuch; danach erscheint ein Hinweis, und das Gespräch geht weiter.
  - 🔊 an jeder Antwort liest per Tippen vor.
- Protokoll ohne Inhalte: KI-Einstellungen › Sprachmodus-Protokoll. Bei Problemen auf dem Gerät „Protokoll kopieren“
  und mir schicken. Es enthält keine Fragen oder Antworten, nur Ereignisse und Zeiten.

**Automatisches Vorlesen auf iPhone/iPad (ab 2.12.1)**
- iOS erlaubt die Sprachausgabe einer Web-App erst nach einer Bedienung. Beim Tippen auf „Sprechen“ sagt die App
  deshalb kurz „Ich höre zu.“ – damit ist das Vorlesen für das Gespräch freigeschaltet.
- Vor jeder Antwort wird eine hängende Warteschlange geleert. Gilt nur ein echtes Start-Ereignis als Start, wird
  höchstens einmal wiederholt.
- Sollte iPadOS das automatische Vorlesen trotzdem nicht erlauben, erscheint nach wenigen Sekunden ein großer Knopf
  „🔊 Antwort vorlesen“. Die App hört weiter zu; nach dem Tippen geht es automatisch weiter.
- **Cloudflare-Alternative geprüft (nicht umgesetzt):**
  - Laut Cloudflare-Unterlagen (Suche am 27.11.2026; die Modellseiten selbst waren aus der Arbeitsumgebung nicht
    abrufbar) gibt es keine kostenlose deutsche Sprachausgabe in Workers AI.
  - MeloTTS ist mit Englisch, Französisch u. a. dokumentiert, Deutsch ist nicht belegt, und das Modell ist zur
    Abschaltung vorgesehen.
  - Deepgram Aura-2 gibt es für Englisch und Spanisch.
  - Inworld TTS (Partner-Modell) kostet je Zeichen; eine Antwort von 400 Zeichen läge bei weit über 1.000 Neurons, das
    Tageskontingent reichte nur für wenige Antworten.
  - Außerdem bräuchte auch abgespieltes Audio auf iOS dieselbe Freischaltung. Deshalb keine Umstellung; die Geräte-Stimme
    bleibt kostenlos.

**Aufträge: nur, was du ausdrücklich verlangst**
- Die App prüft vor jeder schreibenden Aktion technisch, ob deine Nachricht ein ausdrücklicher Auftrag war. Das
  geschieht unabhängig vom Sprachmodell.
  - „Was empfiehlst du?“, „Welche Maßnahme würdest du umsetzen?“: nichts wird geändert; höchstens ein Vorschlag mit
    „Ausführen“/„Verwerfen“.
  - „Sollten wir …?“, „Wir brauchen mehr Marketing.“: unklar, also Vorschlag bzw. Rückfrage („Soll ich daraus eine
    Aufgabe machen?“).
  - „Leg keine Aufgabe an …“: nichts.
  - „Lege eine Aufgabe an: …“, „Erstelle eine Aufgabe für …“, „Kannst du mir eine Aufgabe … anlegen?“,
    „X ist erledigt“, „Bereite drei Instagram-Beiträge vor“, „Behebe die Fehler“: ausgeführt nach den bestehenden
    Freigabestufen, mit „Rückgängig“.
- Gedächtnis und Löschen brauchen weiterhin dein Tippen; Riskantes (Veröffentlichen, Zahlungen, Preise, Produktivsysteme)
  geschieht nie.
- Dubletten: Gleiches wird je Antwort zusammengefasst; eine ähnliche offene Aufgabe wird nicht erneut angelegt;
  Doppeltippen und doppeltes Senden führen nichts doppelt aus.

**Gerätetest (nur auf dem iPad/iPhone prüfbar), ca. 5 Minuten**
1. Installierte App öffnen, KI-Chat › 🎙️ Sprechen. Drei Fragen hintereinander stellen, ohne zu tippen.
   Erwartet: Jede Antwort wird vorgelesen, danach hört die App wieder zu; der Bildschirm bleibt an.
2. Einmal 30 Sekunden nichts sagen: Der Sprachmodus läuft weiter. Nach etwa 1:40 erscheint der Countdown;
   „Weiter zuhören“ tippen.
3. Während einer Antwort „Unterbrechen“, dann neue Frage. Am Ende „Beenden“.
4. Falls etwas nicht klappt: KI-Einstellungen › Sprachmodus-Protokoll › „Protokoll kopieren“.

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

## Echtes KI-Modell ohne Zusatzkosten (Worker `vivalink-ki`, bereitgestellt am 27.11.2026)

**Cloudflare Workers AI im vorhandenen Cloudflare-Konto**, eigener kleiner Worker `vivalink-ki`
(`server/ki-worker.js`, `server/ki-core.mjs`, `server/ki-wrangler.toml`).

**Werkzeugrunden:** Die App sendet Werkzeugergebnisse als Klartext-Nachricht (nicht als `tool_calls`/role `tool`, das lehnt Workers AI ab; Ursache des 503 in 2.11.0). Der letzte von drei Schritten erfolgt ohne Werkzeuge. Fehler meldet der Worker nur mit grobem Code (`modell_eingabe`, `modell_fehler`, `modell_nicht_verfuegbar`).

- **Modelle:** zuerst Llama 3.3 70B. Ist es nicht verfügbar (außer Betrieb genommen oder nur im kostenpflichtigen
  Tarif), weicht der Worker automatisch auf Gemma 4 26B aus; laut Cloudflare ist es im kostenlosen Tarif nutzbar.
  Spracherkennung: Whisper large v3 turbo.
  - Stand der Prüfung (27.11.2026): Llama-Modelle stehen nicht auf der Liste der Modelle, die seit Juli 2026 den
    kostenpflichtigen Tarif verlangen.
  - Unter den am 20.11.2026 abgeschalteten Sprachmodellen ist „whisper-tiny-en“, nicht das hier genutzte Modell.
  - Der Modellkatalog ließ sich mit dem vorhandenen Zugang nicht direkt abfragen. Deshalb gibt es das Ausweichen und
    nach der Bereitstellung eine Live-Prüfung.
- **Kosten:** Das kostenlose Kontingent beträgt 10.000 „Neurons“ pro Tag (Rücksetzung 0 Uhr UTC).
  - **Im kostenlosen Workers-Tarif** schlagen Anfragen über dem Kontingent fehl. Es kann dann nichts berechnet werden.
  - **Im kostenpflichtigen Workers-Tarif** (5 $/Monat) würde zusätzlicher Verbrauch berechnet. Dagegen begrenzt
    der Worker selbst auf **8.000** Neurons pro Tag:
    - Er bucht die geschätzten Kosten vor jedem Aufruf.
    - Er schätzt Modelle ohne bekannten Preis vorsichtig.
    - Er lehnt ab, bevor das Budget überschritten würde.
    - 2.000 Neurons Abstand fangen Schätzfehler und gleichzeitige Anfragen ab.
  - Grenzen dieser Sicherung: Andere Nutzung von Workers AI im selben Konto kennt der Worker nicht.
  - **Bitte einmal im Cloudflare-Dashboard prüfen, dass der kostenlose Workers-Tarif aktiv ist.** Dann ist eine
    Berechnung ausgeschlossen.
  - Grob reicht das Kontingent für etwa 20–25 Fragen am Tag (eine Frage mit Werkzeugaufruf ca. 300–400 Neurons).
    Spracherkennung kostet etwa 47 Neurons je Minute.
- **Zugang:**
  - nur gekoppelte Geräte, mit demselben Tresor-Zugang wie die Synchronisierung (256 Bit, nur als Hash geprüft)
  - gesperrte Tresore abgewiesen
  - Fehlversuche je Absender begrenzt, 120 Anfragen je Gerät und Stunde
  - nur die eigene App-Adresse
  - kein API-Schlüssel im Browser (Workers AI ist eine Bindung des Workers)
  - keine Speicherung oder Protokollierung von Inhalten
- **Datensparsam:**
  - Das Modell erhält deine Fragen und nur die Daten, die es über ein Werkzeug ausdrücklich anfordert.
  - Das gilt nur in Bereichen, die du in den KI-Einstellungen freigegeben hast (alle zunächst aus).
  - Frühere Antworten des lokalen Assistenten, die App-Daten enthalten, werden nicht übertragen.
  - Vertrauliche Gedächtniseinträge nie.
  - Laut Cloudflare werden Inhalte nicht zum Training verwendet.
- **Sicherheit:**
  - Riskante Anliegen werden vor jedem Modell abgelehnt.
  - Aufträge des Modells laufen über dieselbe Freigabelogik.
  - Bei Ausfall oder erreichtem Tageskontingent antwortet der lokale Assistent mit Hinweis.

**Einrichtung nach deiner Freigabe (in 2.11.0 bereits vorbereitet):**
1. Ich stelle den Worker bereit (`cd server && npx -y wrangler@4.168.0 deploy -c ki-wrangler.toml`). Der
   Cloudflare-Zugang liegt geschützt in der Claude-Umgebung.
2. Ich starte die „Live-Prüfung KI“ (ohne KI-Aufruf).
3. Du tippst in der App „KI-Chat › KI-Einstellungen › Verbindung prüfen“, schaltest das KI-Modell ein und hakst die
   Bereiche an, die es nutzen darf.

Adresse und Sicherheitsrichtlinie sind in 2.11.0 schon eingetragen. Bis zum Einschalten sendet die App nichts dorthin.
Für den Zugang muss die Synchronisierung eingerichtet sein (ist sie).

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
