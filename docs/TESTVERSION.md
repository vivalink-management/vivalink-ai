# Getrennte Testversion (kostenlos über GitHub Pages)

**Testadresse:** https://vivalink-management.github.io/vivalink-ai-test/
Sie wird erst erreichbar, wenn Teil A erledigt ist.

## Warum diese Lösung
- **Getrennt von deiner Vivalink AI:**
  - eigener Datenspeicher (`vivalink-test`) und eigener Offline-Speicher (`vivalink-test-…`)
  - eigenes Symbol „TEST“ und eigener Name „VL Test“
  - orangefarbener Hinweis „TESTVERSION“ auf jeder Seite
  - Die echte App und die Testversion löschen gegenseitig keine Offline-Speicher (automatisch getestet).
- **Keine echten Daten nötig:** Unter „Mehr › Testdaten“ gibt es künstliche Demodaten, ein künstliches altes Backup (Version 1) und ein künstliches Konflikt-Backup.
- **Vollständig:** Home-Bildschirm, Offline-Betrieb und alle Funktionen sind enthalten.
- **Kostenlos und ohne zusätzlichen Drittanbieter:** nur GitHub (öffentliches Repository, GitHub Pages).
- **Keine Zugangsdaten:** Die App enthält keine Schlüssel oder Tokens. Die Testversion übermittelt nichts an Server.

**Nicht genutzt: raw.githack.com.** Alle Projekte, die irgendjemand darüber ausliefert, teilen sich dieselbe Web-Adresse. Fremde Seiten dort könnten den Speicher der Testversion lesen, und der Anbieter sieht alle Aufrufe und könnte Inhalte verändern.

## A. Einmalige Einrichtung (ca. 5 Minuten, am Computer)

Das kann nur der Inhaber des GitHub-Kontos erledigen. Claude ändert keine Zugriffsrechte.

1. Auf GitHub ein **neues, leeres, öffentliches** Repository `vivalink-ai-test` in `vivalink-management` anlegen: ohne README, ohne Lizenz.
2. In den Einstellungen der Claude GitHub App dieses Repository zusätzlich freigeben: GitHub → Settings → Applications → Claude → Repository access.
3. Claude Bescheid geben. Claude lädt dann die Testversion in dieses Repository hoch, erzeugt aus dem Entwicklungszweig mit `node scripts/build-test.mjs`.
4. Im neuen Repository: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**.
5. Nach etwa 1 bis 2 Minuten ist die Testadresse erreichbar.

## B. Installation auf iPhone und iPad
1. Safari öffnen → Testadresse eingeben.
   - Oben steht „TESTVERSION · nur künstliche Testdaten“.
2. **Teilen-Symbol → Zum Home-Bildschirm → Hinzufügen**.
   - Das Symbol heißt „VL Test“ und hat einen orangen Streifen „TEST“.
   - Deine bisherige „Vivalink“ bleibt unverändert.
3. Die Testversion ab jetzt **über das Symbol „VL Test“** starten.

## C. Test (ca. 15 Minuten pro Gerät)

| # | Schritt | Erwartet |
|---|---|---|
| 1 | **Mehr → Testdaten → Demodaten laden** (zweimal tippen) | Startseite zeigt Aufgaben, Kennzahlen, ein Meetup in 5 Tagen und mehrere Hinweise |
| 2 | Startseite: einen Hinweis „Als Aufgabe anlegen“, einen „Später“ | Aufgabe erscheint unter „Aufgaben“, der Hinweis verschwindet |
| 3 | Aufgabe anlegen, erledigen, wieder öffnen | funktioniert |
| 4 | Gedächtnis: Eintrag anlegen, „Ändern“ (Grund angeben), „Verlauf“ | alter und neuer Stand sichtbar |
| 5 | Kennzahl antippen → Wert eintragen, Ziel speichern | Vergleich 7/30 Tage wird angezeigt |
| 6 | Aufträge: „Instagram-Ideen“ → Kopieren → in Claude einfügen | Text kommt vollständig an. Die Demo-E-Mail ist nicht enthalten. |
| 7 | **Mehr → Altes Backup (V1) erzeugen → Backup prüfen → Zusammenführen → Jetzt zusammenführen** | „2 Einträge übernommen“ |
| 8 | **Mehr → Konflikt-Backup erzeugen → Zusammenführen → Jetzt zusammenführen** | „1 Konflikt(e) zu entscheiden“, rote Karte auf der Startseite. Unter „Mehr › Datenkonflikte“: „Andere Version übernehmen“ |
| 9 | **Mehr → Letzten Import rückgängig machen** (zweimal tippen) | Stand vor dem letzten Import ist wieder da |
| 10 | **Backup kopieren** → in eine neue Notiz einfügen → zurückkopieren → **Backup prüfen** | „✅ Prüfsumme korrekt“, „Alle Einträge … vorhanden“ |
| 11 | **Als Datei sichern** → „In Dateien sichern“ | Datei `vivalink-backup-….json` liegt in der Dateien-App |
| 12 | **Mehr → Diagnose öffnen** | Anzeige „Home-Bildschirm-App“, Speichertest „OK“, Service Worker „aktiv“ (eventuell erst nach einem Neustart der App) |
| 13 | **Flugmodus an** → App ganz schließen (nach oben wischen) → „VL Test“ öffnen | App startet, Daten sind da. Danach Flugmodus aus. |
| 14 | Deine echte „Vivalink“ öffnen | unverändert (alte Version, deine Daten) |

## C2. Instagram-Studio (Version 2.2, ca. 10 Minuten)

| # | Schritt | Erwartet |
|---|---|---|
| S1 | **Mehr → Testdaten → Studio-Demo laden** | Bereich „Studio“ öffnet sich mit Demo-Beiträgen und Vorschaubildern, nach Kalenderwochen |
| S2 | Einen Karussell-Beitrag öffnen, nach links und rechts wischen, auf **Story** umschalten | Grafiken mit Vivalink-Logo und -Farben, gut lesbar |
| S3 | Caption und einen Folientitel ändern → **Änderungen speichern** | Vorschau zeigt die Änderung |
| S4 | **Teilen (Instagram)** → Instagram wählen | Bilder kommen in Instagram an; die Caption lässt sich dort einfügen. Bitte **nicht veröffentlichen**, nur bis zur Vorschau gehen. |
| S5 | **Bilder speichern** | Bilder liegen in Fotos oder Dateien, Feed 4:5, Story 9:16 |
| S6 | Zurück → bei einer Woche **Woche freigeben** | Beiträge sind „Freigegeben“ |
| S7 | **Monatsplan erstellen → Auftrag kopieren** → in Claude einfügen → Antwort komplett kopieren → einfügen → **Beiträge übernehmen** | Neue Entwürfe mit Grafiken. Prüfhinweise erscheinen bei erfundenen Zahlen o. Ä. |
| S8 | **Markenprofil**: Farben ansehen | Pink, Violett und Orange wie im Logo |
| S9 | **Mehr → Sicherungspunkte anzeigen** | mindestens ein Sicherungspunkt von heute |
| S10 | Studio: Filter „Zu prüfen“ und „Geplant“, bei einem Beitrag **Gestaltung** auf „Hell“ stellen | Liste filtert, Grafik ändert sich |
| S11 | Freigegebenen Beitrag ändern und speichern | Hinweis „bitte erneut freigeben“, Status wieder Entwurf |
| S12 | **Start**: Empfehlung aufklappen („Details und Maßnahmen“) → **Maßnahme freigeben** | Aufgabe mit Prüftermin, bei Meetup-Maßnahmen ein Entwurf im Studio |
| S13 | **Mehr → Diagnose** → Aktionsprotokoll | Einträge zu Sicherungspunkt, Freigaben, Maßnahmen |

## D. Rückmeldung an Claude
Pro Gerät: Nummern 1–14 jeweils „ok“ oder was abweicht. Zusätzlich den **Diagnosebericht** (Mehr → Diagnose → kopieren). Er enthält keine Inhalte.
Bildschirmfotos nur von der Testversion.

## E. Aufräumen nach dem Test
- Symbol „VL Test“ gedrückt halten → App entfernen. Damit werden auch die Testdaten gelöscht.
- Das Repository `vivalink-ai-test` kann bleiben, für spätere Tests, oder gelöscht werden.
