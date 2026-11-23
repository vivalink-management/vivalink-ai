# Architektur und Ausbaupfad der Vivalink Management AI

Ziel: schrittweise ein weitgehend selbstständiger Management-Assistent. **Geschäftliche und strategische Entscheidungen trifft immer der Gründer.**

## Heute (Version 2.2)

```
iPhone / iPad (PWA, offline, Daten nur auf dem Gerät)
 ├─ Daten (IndexedDB): Gedächtnis · Aufgaben · Kennzahlen · Meetup · Studio (Beiträge, Markenprofil, Rhythmus)
 ├─ Regelmotor: erkennt Handlungsbedarf (auch Instagram: Freigabe fällig, Plan fehlt, Meetup ohne Ankündigung …)
 ├─ Instagram-Studio: Planung → KI-Auftrag → Prüfung → Grafiken → Freigabe → Teilen → Auswertung → Lernen
 ├─ Sicherungen: tägliche Sicherungspunkte (7 Tage) · Sicherheitskopie vor jedem Datenversions-Update · Rückgängig vor Importen
 └─ Diagnose: Speichertest, Integrität, technisches Protokoll (ohne Inhalte)
```

## Bausteine, die spätere Stufen unverändert weiterverwenden

| Baustein | Heute | Später |
|---|---|---|
| Datensätze mit `id`, `updatedAt`, `revs`, Löschvermerk `deleted` | Zusammenführen von Backups mit Konflikterkennung | **Synchronisierung** iPhone ↔ iPad: dieselbe Logik (`mergeInto`) auf verschlüsselte Datenpakete |
| `values`-Import (`{"values":[{key,date,value,source}]}`) | Kennzahlen per Einfügen | **Anbindung Rork/Supabase**: die lesende Kennzahlen-Schnittstelle liefert dieses Format |
| Studio-Austauschformat (`STUDIO-FORMAT.md`) | KI-Antwort per Kopieren und Einfügen | **geplante Claude-Aufgabe** schreibt Entwürfe im selben Format |
| `studioFacts` / `factCheck` | Schutz vor erfundenen Angaben | gleiche Prüfung für automatisch erzeugte Entwürfe |
| Status `entwurf → freigegeben → veroeffentlicht` | manuelles Teilen | **automatische Veröffentlichung** freigegebener Beiträge über die Instagram-Schnittstelle |
| `metrics` je Beitrag, `learn()` | Ergebnisse eintragen | automatisch aus Instagram Insights |
| Regelmotor `findings()` | in der App | zusätzlich zeitgesteuert im Hintergrund |
| Diagnosebericht / technisches Protokoll | kopierbar | Grundlage für automatische Fehlererkennung und Reparaturvorschläge (Pull Request) |

## Nächste Stufen (jeweils mit Freigabe des Gründers; Kosten vorher offengelegt)

1. **Synchronisierung und Sicherung außerhalb der Geräte**
   - Ende-zu-Ende verschlüsselt: Der Server sieht nur verschlüsselte Daten.
   - Kostenloser Speicher: Supabase Free oder Cloudflare Workers + D1. Die Entscheidung trifft der Gründer.
   - Ersetzt manuelle Backups.
2. **Kennzahlen aus Rork/Supabase**
   - über die lesende, aggregierte Schnittstelle aus dem Rork-Auftrag, mit Geräte-Kopplung per Einmalcode
   - keine Personendaten
3. **Geplante Claude-Code-Aufgaben** (Pro-Abo, siehe unten): wöchentlicher Monats- oder Wochenplan, Analysen und Berichte, als Entwürfe zur Freigabe.
4. **Automatische Veröffentlichung und Auswertung** über die Instagram-Schnittstelle von Meta (kostenlos)
   - Voraussetzung: Business-Konto, verknüpfte Facebook-Seite, Meta-App
   - Zugangsschlüssel nur auf dem Server, nie im Browser
   - Kategorien, die der Gründer einmal freigegeben hat, dürfen automatisch laufen.
5. **Technische Selbstüberwachung**
   - Diagnose und Protokoll werden zentral ausgewertet.
   - Ungefährliches repariert sich automatisch (Freigabestufen in `PROJEKT.md`), alles andere wird als Pull Request vorgeschlagen.

## Geplante Claude-Code-Aufgaben im Pro-Abo: Bewertung
- **Möglich ohne Zusatzkosten**
  - Claude Code kann zeitgesteuert eine eigene Cloud-Sitzung starten (frühestens stündlich, z. B. montags 7 Uhr).
  - Die Sitzungen zählen gegen die Nutzungsgrenzen des Pro-Abos. Ein garantierter Betrieb ist das nicht: Ist das Kontingent erschöpft, fällt ein Lauf aus. Wichtiges darf daher nicht allein davon abhängen; der Regelmotor in der App bleibt die Rückfallebene.
- **Einschränkung 1: Datenzugang.** Die Daten auf iPhone und iPad erreicht eine Cloud-Sitzung nicht. Sie braucht einen **privaten** Ablageort zum Lesen der Fakten und zum Ablegen der Entwürfe. Das ist der Synchronisierungsspeicher aus Stufe 1.
- **Einschränkung 2: kein öffentliches Repository.** Entwürfe vor der Freigabe wären dort öffentlich. Das öffentliche Repository wird dafür nie genutzt.
- **Zugangsdaten** (z. B. zum Synchronisierungsspeicher) werden als Umgebungs-Geheimnis hinterlegt, nie im Code.
- **Folgerung:** Synchronisierung zuerst, dann geplante Aufgaben. Bis dahin ersetzt ein Kopieren und Einfügen pro Monat die automatische Planung.

## Datenschutz und Sicherheit (gilt für alle Stufen)
- Keine Unternehmenszahlen, Orte, Personen oder Zugangsdaten im öffentlichen Code. Das prüft `scripts/check-sensitive.mjs` automatisch.
- Logo, Markenfarben und Schrift sind öffentliches Markenmaterial und liegen in `brand/`.
- Die Content-Security-Policy erlaubt keine fremden Skripte und keine fremden Server.
- Die Testversion („VL Test“) hat einen eigenen Speicher und arbeitet nur mit künstlichen Daten.
