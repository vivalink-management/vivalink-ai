# Austauschformat Instagram-Studio (`vivalink-studio-plan`, Version 1)

Dieses Format liefert eine KI zurück, wenn sie den Arbeitsauftrag „Monatsplan erstellen“ bearbeitet. Heute kommt die Antwort aus Claude oder ChatGPT per Kopieren und Einfügen. Später soll sie automatisch von einer geplanten Claude-Code-Aufgabe kommen. Dafür bleibt das Format gleich; geändert wird nur der Übertragungsweg.

```json
{
  "format": "vivalink-studio-plan",
  "version": 1,
  "posts": [
    {
      "date": "2026-03-04",
      "time": "18:00",
      "pillar": "meetup | tipps | orte | sofunktionierts | rueckblick | community",
      "kind": "ankuendigung | erinnerung | info | tipps | ideen | frage | rueckblick",
      "angle": "Blickwinkel aus dem Auftrag",
      "type": "einzelbild | karussell | reel | story",
      "title": "interner Kurztitel",
      "hook": "erster Satz",
      "slides": [{ "template": "cover | tipp | info | frage | ankuendigung | erinnerung | rueckblick | abschluss | foto", "title": "…", "text": "…", "details": "…" }],
      "caption": "…",
      "hashtags": ["#…"],
      "facts": ["F1", "F3"],
      "reel": { "script": "…", "shots": ["…"] },
      "story": "kurzer Story-Text"
    }
  ]
}
```

## Prüfungen beim Übernehmen (`importPlan` in `js/studio.js`)

**Grundsätze**
- Übernommene Beiträge sind immer **Entwürfe**. Nichts wird ohne Freigabe veröffentlicht.
- Es wird nichts ersetzt oder gelöscht.

**Bereinigung**
- Ungültige Werte werden bereinigt: unbekannte Vorlage → `cover`, unbekannter Bereich → `community`, ungültiges Datum → ohne Datum.
- Hashtags: höchstens 8, eindeutig, nur Buchstaben, Ziffern und `_`, mindestens ein Buchstabe.
- Dieselbe Antwort zweimal eingefügt: bereits vorhandene Beiträge (gleicher Termin, Bereich, Einstieg und Caption) werden übersprungen.
- Gestaltung: ohne Angabe wählt die App automatisch eine der 4 Gestaltungen, nie dieselbe wie beim vorherigen Beitrag.
- Karussell: Die erste Folie wird zur Titelfolie, die letzte zur Abschlussfolie.

**Faktenprüfung** (`factCheck`) markiert einen Beitrag mit **Prüfhinweis** bei:
- Zahlen oder Daten, die nicht in den Fakten stehen. Alle üblichen Datumsschreibweisen der erlaubten Daten werden erkannt.
- Hinweisen auf App-Store, Download oder „App herunterladen“, sofern nicht in den Fakten bestätigt.
- nicht ausgefüllten Platzhaltern `[BITTE ERGÄNZEN: …]` (fehlende Angaben werden nie erfunden, sondern so markiert).
- Angaben zur Zahl von Mitgliedern oder Teilnehmenden ohne belegte Daten.
- Rückblicken, deren Angaben der Gründer nicht als geprüft markiert hat.
- Beträgen oder Preisen, die nicht genau so in den Fakten stehen, sowie „kostenlos“, wenn das nicht in den Fakten steht.
- möglichen Erfahrungsberichten oder Zitaten
- Superlativen und Versprechen
- Links, die nicht aus den Fakten stammen
- Meetup-Beiträgen ohne bestätigtes Meetup
- Ähnlichkeit zu vorhandenen Beiträgen (Dubletten)

**Freigabe:** Beiträge mit Prüfhinweis werden bei der **Wochenfreigabe nicht** mit freigegeben. Sie brauchen eine bewusste Einzelfreigabe.

## Welche Fakten die KI bekommt (`studioFacts`)
- Markenprofil: Name, Website, Region, Anmeldeweg, Instagram-Konto.
- Das nächste Meetup (Datum, Ort), wenn es bestätigt ist und in der Zukunft liegt.
- Gedächtnis-Einträge der Kategorien App, Webseite, Meetup und Geschäftsmodell, nur **bestätigt** und **nicht vertraulich**. Geschäftsmodell-Einträge sind als „intern – nur sinngemäß“ gekennzeichnet.
- **Nie enthalten:** Kennzahlen, Finanzen, Entscheidungen, Probleme, vertrauliche Einträge.
