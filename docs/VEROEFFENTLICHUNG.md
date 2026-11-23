# Veröffentlichung von Version 2.1: Schritt-für-Schritt

Dauer insgesamt etwa 30 Minuten. Bitte in Ruhe und in dieser Reihenfolge.
**Die Veröffentlichung (Schritt 2) passiert erst nach deiner ausdrücklichen Freigabe.**

---

## Schritt 1: Abschließende Sicherung deiner echten Daten (vorher, ca. 10 Minuten)

Das machst du in der **bisherigen** App auf dem Home-Bildschirm. Das Symbol heißt „Vivalink“, **nicht** „VL Test“.

### 1a. iPhone
1. „Vivalink“ öffnen → **Mehr** → **Backup kopieren**.
   Erwartet: „Backup kopiert. Jetzt in eine Notiz einfügen.“
2. Notizen-App öffnen → **neue Notiz** → einfügen.
   - Titel in die erste Zeile: `Backup iPhone vor 2.1 – <heutiges Datum>`.
3. Notiz **sperren**: Teilen-Menü oder „…“ → **Sperren**.
4. **Kontrolle:** Text in der Notiz komplett markieren und kopieren.
   - In „Vivalink“: **Mehr** → Text in das Feld „Backup einfügen“ einfügen → **Zusammenführen**.
   - Erwartet: **„0 Einträge übernommen“**.
   - Erscheint „Das ist kein gültiges Backup“, war der Text unvollständig. Dann Schritt 1–4 wiederholen.
5. Die vier Zahlen oben auf der **Startseite** in die Notiz schreiben: *offen, überfällig, Wissen, Entscheidungen*.

### 1b. iPad
Genau wie 1a. Titel: `Backup iPad vor 2.1 – <Datum>`.

### 1c. Claude-Artefakt (nur iPhone)
Nur nötig, wenn du dort seit deinem letzten Artefakt-Backup noch etwas eingetragen hast.
- Artefakt öffnen → **Mehr** → **Backup kopieren** → neue gesperrte Notiz `Backup Artefakt vor 2.1 – <Datum>`.
- Die Kontrolle „0 Einträge übernommen“ nur **im Artefakt selbst** machen.

✅ Danach liegen 2 oder 3 gesperrte Notizen mit Backups und Zahlen vor.

---

## Schritt 2: Freigabe und Veröffentlichung (ca. 2 Minuten)
1. Du schreibst Claude: **„Ich gebe Version 2.1 zur Veröffentlichung frei.“**
2. Claude prüft noch einmal den Stand und den Testlauf des Pull Requests und fasst ihn zusammen.
3. **Du** klickst den Merge auf GitHub (Pull Request #1 → **Merge pull request** → **Confirm merge**).
   - Oder du beauftragst Claude ausdrücklich damit.
4. GitHub Pages veröffentlicht innerhalb von etwa 1 bis 2 Minuten.

---

## Schritt 3: Aktualisierung auf den Geräten (ca. 10 Minuten)

**Wichtig:** Nach der Veröffentlichung **mindestens 10 Minuten warten**. Bis dahin kann iOS noch die alte Version anzeigen. Das ist harmlos.

### Auf iPhone und iPad, jeweils:
1. WLAN oder Mobilfunk an. „Vivalink“ **vollständig schließen**: im App-Umschalter nach oben wischen. Dann neu öffnen.
2. **Mehr** → ganz unten muss **„Version 2.1.0 · Datenversion 3“** stehen.
   - Steht dort nichts oder eine andere Version: App schließen, 5 Minuten warten, erneut öffnen.
3. **Startseite:** Die vier Zahlen müssen mit deiner Notiz übereinstimmen. Gedächtnis und Aufgaben stichprobenartig ansehen.
4. **Mehr → Sicherheitskopie:** „Automatische Kopie vom Stand vor dem Update …“ muss vorhanden sein.
5. **Mehr → Diagnose öffnen:**
   - Speichertest „OK“, Datenversion „3 (gespeichert: 3)“
   - Integritätsprüfung ohne rote Einträge
   - Service Worker „aktiv“, eventuell erst nach erneutem Öffnen
6. **Nur iPhone:**
   - Die Artefakt-Notiz kopieren → **Mehr** → einfügen → **Backup prüfen** → **Zusammenführen** → **Jetzt zusammenführen**.
   - Erwartet: Kennzahlen und „Nächstes Meetup“ erscheinen.
   - Konflikte sind nicht zu erwarten. Falls doch: **Mehr → Datenkonflikte** und je Konflikt entscheiden.
7. Sofort ein neues Backup im **neuen Format** anlegen:
   - **Mehr → Backup kopieren** → neue gesperrte Notiz `Backup <Gerät> 2.1 – <Datum>`.
   - Zusätzlich **Als Datei sichern** → In Dateien sichern.
8. **Offline-Test:** Flugmodus an → App schließen → öffnen → Daten da → Flugmodus aus.

Optional: Damit iPhone und iPad denselben Stand haben, das neue iPad-Backup auf dem iPhone zusammenführen und umgekehrt. Die automatische Synchronisierung folgt in einer späteren Stufe.

---

## Schritt 4: Wenn etwas nicht stimmt: Rückweg ohne Datenverlust

| Problem | Lösung |
|---|---|
| Zahlen stimmen nicht oder Einträge fehlen | **Mehr → Stand vor dem Update wiederherstellen** (zweimal tippen). Das stellt den unveränderten Stand von Version 1 her, vorher wird ein Rückgängig-Punkt angelegt. Danach Claude Bescheid geben. |
| Ein Import hat etwas Unerwünschtes übernommen | **Mehr → Letzten Import rückgängig machen** (zweimal tippen) |
| Die App funktioniert grundsätzlich nicht richtig | Claude Bescheid geben mit Diagnosebericht und Bildschirmfoto. **Rückbau auf Version 1:** Auf GitHub im Pull Request #1 auf **Revert** klicken → den neuen Pull Request mergen. Nach etwa 10 Minuten liefert GitHub Pages wieder Version 1. |
| Alles verloren (sehr unwahrscheinlich) | Notiz-Backup → **Mehr → Backup einfügen → Zusammenführen**. Das funktioniert in Version 1 und in Version 2.1. |

**Warum der Rückbau sicher ist:**
- Version 1 lässt die neuen Daten von 2.1 (Kennzahlen, Meetup, Konflikte) unangetastet und speichert sie unverändert mit.
- Beim erneuten Update ist alles wieder da.
- Das wurde automatisch mit dem originalen Code von Version 1 getestet: Update, Rückbau, erneutes Update, Offline-Betrieb und Übernahme von Version-1-Backups.

---

## Nach erfolgreicher Umstellung
- Das Symbol „VL Test“ kann gelöscht werden (gedrückt halten → App entfernen).
- Das Claude-Artefakt wird nicht mehr benötigt. Bitte nicht mehr parallel nutzen, sonst entstehen wieder getrennte Datenstände.
