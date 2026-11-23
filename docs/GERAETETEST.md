# Gerätetest vor der Veröffentlichung (iPhone und iPad)

## 1. Funktionstest in der getrennten Testversion (ohne echte Daten)
Anleitung, Testadresse und Checkliste: **[`TESTVERSION.md`](TESTVERSION.md)**.
Deine installierte Vivalink AI bleibt dabei unverändert.

## 2. Nach deiner Freigabe: Übernahme deiner echten Daten
Erst nach deiner ausdrücklichen Zustimmung wird der Pull Request in `main` übernommen. Dann liefert GitHub Pages die neue Version an deine installierte App:
1. Vorher auf jedem Gerät in der bisherigen App ein frisches Backup in eine gesperrte Notiz kopieren.
2. App öffnen.
   - Die vorhandenen Daten werden automatisch übernommen, vorher legt die App eine geprüfte Sicherheitskopie an.
   - Kontrolle: **Mehr → Version 2.1.0 · Datenversion 3**.
3. Vergleiche die vier Zahlen auf der Startseite mit denen aus deinen Backup-Notizen.
4. iPhone: das Artefakt-Backup einmalig über **Mehr → Backup einfügen → Backup prüfen → Zusammenführen** übernehmen.
5. **Mehr → Diagnose**: Speichertest „OK“, keine Auffälligkeiten.

**Rückbau:** Der Merge wird rückgängig gemacht, dann liefert GitHub Pages wieder die alte Version. Die Daten bleiben erhalten. Zusätzlich gibt es **Mehr → Stand vor dem Update wiederherstellen** sowie deine Backups.
