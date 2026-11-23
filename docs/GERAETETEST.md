# Gerätetest vor der Veröffentlichung (iPhone und iPad)

Dauer: ca. 15 Minuten pro Gerät. Bitte erst durchführen, wenn der Pull Request zur Prüfung bereitsteht.

## A. Test ohne Risiko für deine Daten (Vorschau-Adresse)

> Die bisherige App auf deinem Home-Bildschirm bleibt dabei unverändert.

Die Vorschau läuft unter einer anderen Adresse und hat deshalb einen eigenen, leeren Speicher. Wie du die Vorschau öffnest, steht im Pull Request.

1. Vorschau in Safari öffnen → **Teilen → Zum Home-Bildschirm**. Die App startet ohne Safari-Leiste.
2. **Mehr → Backup einfügen**: Füge dein Backup aus der Notiz ein (iPhone: das iPhone-Backup) → **Backup prüfen**.
   - Erwartet: „Älteres Backup-Format …“, die richtige Anzahl an Einträgen und keine Fehlermeldung.
3. **Zusammenführen → Jetzt zusammenführen**.
   - Vergleiche die vier Zahlen auf der Startseite mit den Zahlen in deiner Notiz.
4. Füge dann das **Artefakt-Backup** ein → prüfen → zusammenführen.
   - Erwartet: Kennzahlen und Meetup erscheinen. Konflikte sind nicht zu erwarten, weil die Einträge auf unterschiedlichen Geräten angelegt wurden.
5. Auf dem iPad: dasselbe mit dem iPad-Backup.
6. **Mehr → Backup kopieren** → in eine neue gesperrte Notiz einfügen.
   - Danach dieselbe Notiz zurückkopieren → **Backup prüfen**.
   - Erwartet: „✅ Prüfsumme korrekt“.
7. **Mehr → Als Datei sichern** → in der Dateien-App speichern.
8. **Mehr → Diagnose öffnen**.
   - Erwartet: Anzeige „Home-Bildschirm-App“, Speichertest „OK“, Service Worker „aktiv“ (eventuell erst nach einem Neustart der App).
9. **Flugmodus an** → App schließen und neu öffnen. Die App startet, die Daten sind sichtbar. Flugmodus wieder aus.
10. Je eine Aufgabe und einen Gedächtnis-Eintrag anlegen, ändern und erledigen. Einen Arbeitsauftrag kopieren und in Claude einfügen.

## B. Rückmeldung an Claude Code

Bitte nur melden, **keine Inhalte**:
- Schritt 1–10: jeweils „ok“ oder was abweicht, gern mit Bildschirmfoto ohne vertrauliche Inhalte
- Diagnosebericht kopieren (enthält keine Inhalte) und einfügen

## C. Nach deiner Freigabe

Erst nach deiner ausdrücklichen Zustimmung wird der Pull Request in `main` übernommen. Ab dann liefert GitHub Pages die neue Version an deine installierte App:
1. Vorher auf jedem Gerät ein frisches Backup in der bisherigen App erstellen.
2. App öffnen. Die vorhandenen Daten werden automatisch übernommen, eine geprüfte Sicherheitskopie wird angelegt.
3. Das Artefakt-Backup auf dem iPhone einmalig zusammenführen.
4. Stichprobe: Zahlen auf der Startseite und **Mehr → Diagnose**.

**Rückbau:** Der Merge wird rückgängig gemacht, dann liefert GitHub Pages wieder die alte Version. Die Daten bleiben erhalten. Zusätzlich gibt es **Mehr → Stand vor dem Update wiederherstellen**.
