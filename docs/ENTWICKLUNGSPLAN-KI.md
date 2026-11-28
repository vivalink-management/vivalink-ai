# Entwicklungsplan: Vivalink Management AI als Unternehmensberater und technischer Assistent

Stand: 27.11.2026 · Grundlage: Version 2.12.1 · **Plan vom Gründer freigegeben.** Reihenfolge: 1 Unternehmensverständnis und Antwortqualität → 2 Gesprächsgedächtnis → 3 Datenverknüpfung → 4 Modellvergleich → 5 Eigenständigkeit. Phase 1 umgesetzt in 2.13.0 (Pull Request, nicht veröffentlicht).

Legende: ✅ existiert · 🔧 existiert, muss verbessert werden · 🆕 neu

---

## 1. Ausgangslage: Wie die KI heute arbeitet

**Ablauf einer Frage** (`js/chat.js` → `js/assistant.js` → Worker `vivalink-ki` → Workers AI):

1. Die App prüft riskante Anliegen (`RISKY`) und die Absicht (`userIntent`).
2. Die App baut die Nachrichten:
   - Systemanweisung (`KI_SYSTEM`, ca. 1.900 Zeichen)
   - die letzten 14 Nachrichten des Chats (frühere KI-Antworten bereinigt, Antworten des lokalen Assistenten
     ausgeblendet)
   - bei langen Chats Fragezeilen der Kurzfassung
   - die neue Frage
3. Das Modell (**Llama 3.3 70B**) kann acht Werkzeuge aufrufen:
   - Kennzahlen, Probleme, Maßnahmen, Aufgaben, Meetup, Instagram, Technik, Gedächtnis
   - Aufträge (Aufgabe anlegen, Merken) nur bei ausdrücklichem Auftrag
4. Höchstens drei Runden, danach antwortet das Modell; Aufträge prüft die App vor der Ausführung.
5. Grenzen: höchstens 800 Antwort-Token je Aufruf; 8.000 Neurons Tagesbudget im Worker; Temperatur 0,3.

**Gemessener Verbrauch (Live-Prüfung):** ca. 40–65 Neurons je Modellaufruf, ca. 100–150 je Frage mit Werkzeug.
Das Tagesbudget reicht damit für etwa 50–70 Fragen.

---

## 2. Schwachstellen und ihre Ursachen (aus dem Code und den Live-Tests)

| # | Beobachtung | Ursache im Code |
|---|---|---|
| S1 | Die KI kennt Vivalink kaum: Geschäftsmodell, Zielgruppe, Strategie und frühere Entscheidungen fehlen in den Antworten. | Die Systemanweisung enthält nur einen Satz über Vivalink. Das Wissen im Gedächtnis kommt nur an, wenn das Modell das Werkzeug `gedaechtnis` mit einem passenden **Stichwort** aufruft (Suche nach Wortteilen, höchstens 5 Treffer). In den Live-Tests hat Llama es nie aufgerufen. Außerdem ist der Bereich „Gedächtnis“ in den KI-Einstellungen standardmäßig nicht freigegeben. |
| S2 | Allgemeine Empfehlungen; bei „Welche Maßnahme zuerst?“ nannte die KI eine überfällige Testaufgabe. | Die Werkzeuge liefern vor allem **Regelhinweise der App** (`findings()`/`enrich()` mit festen Maßnahmen-Texten). Das Modell übernimmt sie, weil es keine eigene Wissensbasis über Community- und Event-Marketing und kein Unternehmensprofil hat. Es fehlt eine Antwortstruktur für Beratungsfragen (Optionen, Abwägung, Empfehlung). |
| S3 | Wiederholungen derselben Kennzahlen. | Die Anweisung „nicht wiederholen“ ist vorhanden, wird vom Modell aber nur teilweise befolgt. Die App prüft die Antwort nicht auf Wiederholungen. Das Modell ruft `kennzahlen` erneut auf, obwohl die Zahlen schon im Verlauf stehen. |
| S4 | Kein Gedächtnis über einzelne Chats hinaus. | Verlauf nur innerhalb eines Chats (14 Nachrichten). Die Kurzfassung `summarize()` arbeitet ohne KI und übernimmt nur Fragen und erste Antwortzeilen. Entscheidungen aus Gesprächen bleiben nur erhalten, wenn du „Merken“ tippst. |
| S5 | Daten werden nicht verknüpft. | Jedes Werkzeug liefert eine Momentaufnahme. Die Kennzahlen kommen nur mit 7- und 30-Tage-Veränderung, ohne Verlauf und ohne Trichter (Reichweite → Registrierung → Anmeldung → Teilnahme). Beitrags-Ergebnisse, Maßnahmen-Wirkung (`measure.checkAt/outcome`) und Meetup-Teilnahme gehen nicht gemeinsam an die KI. `S.meetup` kennt nur das **nächste** Meetup, keine Historie. |
| S6 | Kennzeichnung teils falsch (z. B. „[Fakt]“ an einer Einschätzung). | Llama 3.3 setzt Kennzeichnungen unzuverlässig. Die App prüft sie nicht. |
| S7 | Werkzeugschleifen und Doppelaufrufe (z. B. Aufgabe zweimal angelegt). | Bekannte Schwäche von Llama 3.3 beim Werkzeuggebrauch. Die App fängt das inzwischen ab (2.12), die Ursache bleibt. |
| S8 | Eigenständigkeit nur in festen Bahnen. | Vorhanden: Selbstreparatur, Zyklus, Entwürfe, Berechtigungen, geplante Claude-Aufgaben. Es fehlen Entscheidungsvorlagen, ein tägliches Briefing und Selbstheilung über Datenfehler hinaus. |

---

## 3. Bestandsaufnahme: existiert / verbessern / neu

| Bereich | ✅ existiert | 🔧 verbessern | 🆕 neu |
|---|---|---|---|
| Unternehmenswissen | Gedächtnis mit Bereichen (Ziele, Geschäftsmodell, Entscheidung …), Lückenhinweis (`GAPS`), vertrauliche Einträge geschützt | Gedächtnis-Werkzeug: bessere Suche, standardmäßig sinnvolle Auswahl | **Unternehmensprofil** (von dir bestätigt, immer im Kontext) |
| Antwortqualität | Systemanweisung (2.12), Kennzeichnung, Absichtsprüfung | Beratungsstruktur, Wiederholungsprüfung, Kennzeichnungsprüfung | **Antwortmodi**, **Vivalink-Playbook** (Fachwissen), **Qualitäts-Testset** |
| Gedächtnis | Chatverlauf, lokale Kurzfassung, „Merken“ per Tippen | Kurzfassung mit KI | **Gesprächsnotizen über Chats hinweg**, **Entscheidungs-Erkennung** (Vorschlag) |
| Daten | Kennzahlen mit Verlauf, Befunde, Maßnahmen mit Prüftermin, Beitrags-Ergebnisse, Wochenbericht | Werkzeuge liefern Zusammenhänge statt Einzelwerte | **Analyse-Werkzeug** (Trichter, 8-Wochen-Verlauf, Maßnahmen-Wirkung, Meetup-Historie) |
| Eigenständigkeit | Freigabestufen 0–3, Berechtigungen, Selbstreparatur, Zyklus, geplante Claude-Aufgaben (Wochenanalyse, Wartung) | Selbstheilung (Sync, Verwaltung, KI) | **Morgen-Briefing**, **Entscheidungsvorlagen**, **wöchentliche Strategie-Notiz** |
| Modell | Llama 3.3 70B + Ausweichmodell Gemma 4 26B, Budget, Fehlercodes | – | **Modellvergleich mit eigenem Testset**, ggf. **Modellwahl je Aufgabe** |

---

## 4. Lösungen im Einzelnen

### 4.1 Unternehmensverständnis (Frage 1)

**🆕 Unternehmensprofil („So versteht dich die KI“)**
- Kompaktes, von dir bestätigtes Profil von höchstens ca. 1.500 Zeichen:
  - Geschäftsmodell und Angebot
  - Zielgruppe und ihre Hürden
  - Positionierung und Ton
  - aktuelle Quartalsziele
  - Rahmenbedingungen (Budget, Zeit, Team)
  - die 5 wichtigsten Entscheidungen der letzten Monate
  - Dinge, die die KI nie empfehlen soll
- **Entsteht automatisch** aus bestätigten, nicht vertraulichen Gedächtniseinträgen (Bereiche Ziele, Geschäftsmodell,
  Entscheidung, Marketing, Meetup).
- Du siehst es in den KI-Einstellungen, bearbeitest es und **gibst es frei**. Erst dann geht es an das Modell.
- Es geht bei jeder Frage mit (ca. +400 Token ≈ +11 Neurons je Aufruf).
- Änderungsvorschläge der KI erscheinen nur als Vorschlag („Profil aktualisieren?“).
- **Lücken-Assistent:** Fehlt ein Bereich, stellt die KI gezielt 1–2 Fragen („Wer ist eure wichtigste Zielgruppe?“). Deine
  Antwort wird nach Bestätigung zum Gedächtniseintrag. Die bestehende Lückenerkennung `GAPS` wird dafür genutzt.
- **Datenschutz:** Vertrauliche Einträge kommen nie ins Profil; das Profil enthält keine Personendaten.

**Erwartung:** deutlich passgenauere Empfehlungen ab der ersten Frage. **Risiko:** gering. **Aufwand:** mittel (App).

### 4.2 Intelligentere Antworten (Frage 2)

**🆕 Antwortmodi (technisch erkannt, wie die Absichtsprüfung)**
- *Kurzfrage* („Wie viele Anmeldungen?“): 1–3 Sätze, nur die Zahl mit Stand.
- *Analyse* („Wie entwickelt sich …?“): Lage, Trend, Ursache (Annahme), Bedeutung.
- *Beratung* („Was würdest du tun?“, „Welche Maßnahme zuerst?“): feste Struktur:
  - Lage (Fakten mit Stand)
  - 2–3 **Optionen** mit Aufwand, Wirkung, Risiko
  - **Empfehlung mit Begründung**
  - erster konkreter Schritt
  - woran man den Erfolg nach 2–4 Wochen misst
  - welche Information die Empfehlung ändern würde
- *Technik*: Zustand, Ursache, was die App selbst beheben kann, was du tun musst.
- *Sprachmodus*: wie heute kurz; bei Beratung nur Empfehlung und erster Schritt, Details im Chat.

**🆕 Vivalink-Playbook (Fachwissen ohne erfundene Fakten)**
- Kuratierte, geprüfte Wissensbasis (ca. 2–3 Seiten) mit Methoden für Community- und Event-Geschäfte:
  - Trichter und Kennzahlen
  - Wiederkehr und Empfehlungen
  - Erfolgsfaktoren von Erstbesuchs-Meetups
  - Instagram-Formate für Vertrauen
  - Kooperationen mit Cafés und Vereinen
  - typische Fehler
- Steht als Werkzeug `wissen` (nur auf Anfrage) bereit, nicht in jeder Frage.
- Inhalte sind als **allgemeine Erfahrungswerte (Annahme)** gekennzeichnet, nie als Vivalink-Fakt.
- Ich entwerfe es, du prüfst und gibst es frei.

**🔧 Werkzeuge liefern Rohstoff statt fertiger Regeltexte**
- `massnahmen` liefert Befunde mit Daten; die feste Maßnahmen-Liste ist nur noch ein Hinweis.
- Die KI muss eigene Optionen entwickeln (die Anweisung ist seit 2.12 da, die Werkzeuge widersprechen ihr noch).

**🆕 Prüfungen der App nach jeder Antwort** (ohne Modell, ohne Kosten)
- *Wiederholung*:
  - Die App vergleicht die neue Antwort mit den letzten 3 Antworten (Wortgruppen-Überlappung).
  - Ist die Überlappung hoch, gibt es **einen** zweiten Versuch mit dem Hinweis, was schon gesagt wurde.
  - Bereits genannte Zahlen gehen als kurze Liste mit („bereits genannt: Registrierungen 9/Woche, Stand …“).
- *Kennzeichnung*:
  - „[Fakt]“ nur, wenn Zahl oder Aussage in einem Werkzeugergebnis vorkommt.
  - Sonst kennzeichnet die App automatisch zu „[Annahme]“ um.
- *Konkretheit* (nur Beratung): Fehlt ein erster Schritt oder eine Erfolgsmessung, erfolgt **ein** Nachfass-Aufruf.

**🆕 Qualitäts-Testset**
- 25 künstliche Fragen in typischen Gesprächsfolgen mit automatischer Bewertung:
  - konkret?
  - begründet?
  - Optionen genannt?
  - keine Wiederholung?
  - richtige Kennzeichnung?
  - keine unbeauftragte Aktion?
  - Länge im Sprachmodus
- Läuft offline mit Attrappe in jeder Testreihe und live (künstliche Daten, ca. 2.000–3.000 kostenlose Neurons) vor jeder
  Veröffentlichung, die die KI betrifft. So wird Verbesserung **messbar**.

**Erwartung:** spürbar konkretere, begründete und abwechslungsreichere Antworten. **Risiko:** zusätzliche Aufrufe
(Nachfass-Aufrufe begrenzt auf 1 je Frage, im Tagesbudget). **Aufwand:** mittel bis hoch.

### 4.3 Gesprächsgedächtnis (Frage 3)

**🆕 Gesprächsnotizen**
- Ist ein Chat 30 Minuten ruhig oder endet der Sprachmodus, erstellt die KI **eine** kurze Notiz (höchstens ca. 600 Zeichen):
  - Themen
  - Erkenntnisse
  - offene Fragen
  - Vorschläge
  - **Entscheidungs-Kandidaten**
- Notizen werden synchronisiert (klein) und sind im Chat sichtbar. Kosten: 1 Aufruf je Gespräch.
- **Entscheidungen:** Kandidaten erscheinen als „Ins Gedächtnis übernehmen?“. Nach deinem Tippen werden sie zur bestätigten
  Entscheidung und fließen ins Unternehmensprofil. Nichts wird automatisch gespeichert.

**🆕 Sparsame Auswahl (Retrieval)**
- Zu jeder Frage wählt die App lokal die 3 passendsten Notizen und Gedächtniseinträge aus. Bewertung:
  - Stichwort-Übereinstimmung
  - Bereich
  - Aktualität
  - Bestätigungsstatus
- Höchstens ca. 1.500 Zeichen zusätzlicher Kontext.
- Kein Modell nötig, keine Kosten, keine zusätzliche Datenübertragung über das Ausgewählte hinaus.
- Freigaben je Bereich gelten weiter.
- *Später, optional:* Bedeutungssuche mit dem mehrsprachigen Einbettungsmodell von Workers AI (z. B. bge-m3; sehr geringer
  Verbrauch). Braucht eine Worker-Erweiterung und kommt nur, wenn die Stichwortsuche nicht reicht.

**🔧 Kurzfassung langer Chats** mit KI statt nur lokal (gleiche Notiz-Technik).

**Erwartung:** Die KI kennt frühere Gespräche und Entscheidungen. Je Frage gehen trotzdem nur wenige hundert Zeichen
zusätzlich an das Modell. **Risiko:** Notizen könnten Fehler enthalten. Deshalb sind sie sichtbar und korrigierbar, und
Entscheidungen nur nach Bestätigung. **Aufwand:** mittel.

### 4.4 Unternehmensdaten verknüpfen (Frage 4)

**🆕 Werkzeug `analyse`** (lokal berechnet, keine KI-Kosten, liefert kompakte Ergebnisse statt Rohdaten):
- **Trichter**, soweit Daten vorhanden:
  - Instagram-Reichweite → Website-Besucher → Registrierungen → Anmeldungen → Teilnahme → Wiederkehr
  - mit Quoten und Veränderung
- **8-Wochen-Verlauf** der wichtigsten Kennzahlen als kurze Zahlenreihe (Trend, Ausreißer).
- **Maßnahmen-Wirkung:** vorher/nachher je Maßnahme, auf vorhandener `measureLine`/`measure.outcome` aufbauend.
- **Instagram ↔ Registrierungen:**
  - Registrierungen in den Tagen nach Beiträgen mit hoher Reichweite
  - ausdrücklich als **Hinweis (Annahme)**, nicht als Ursache
- **Meetup-Historie:** frühere Meetups mit Anmeldungen, Teilnahme, Nichterscheinen, Auslastung. Wird aus vorhandenen
  Kennzahl-Einträgen je Datum abgeleitet; zunächst ohne neues Datenformat.
- **Datenqualität:** fehlende oder veraltete Werte, die eine Aussage unsicher machen.

**🔧 `kennzahlen`** liefert zusätzlich die Ziel-Lücke („noch 6 bis zum Ziel“) und nur Werte, die noch nicht im Gespräch
stehen.

**Erwartung:** Die KI erkennt Zusammenhänge (z. B. „Reichweite steigt, Registrierungen nicht → Engpass auf der
Website“). **Risiko:** Scheinzusammenhänge. Gegenmittel: Kennzeichnung als Annahme, Mindestdatenmenge. **Aufwand:** mittel.

### 4.5 Eigenständigkeit (Frage 5)

**Darf selbstständig (Stufe 0/1, mit Protokoll und Rückgängig, wie heute geregelt):**
- ✅ Datenfehler reparieren, Entwürfe erstellen, Wochenbericht.
- 🆕 **Morgen-Briefing** (nur lesen):
  - 3–5 Punkte für heute: Fälliges, Auffälliges, nächster Meetup-Schritt
  - lokal erstellt; mit KI nur, wenn eingeschaltet
- 🆕 **Selbstheilung erweitert:**
  - Synchronisierung oder Verwaltungsanbindung gestört → begrenzt erneut versuchen, Ursache erklären, Lösungsschritt
    vorschlagen
  - KI-Fehlercodes und Sprachmodus-Protokoll auswerten
- 🆕 **Aufräumvorschläge:** doppelte oder veraltete Aufgaben erkennen. Zusammenführen nur als Vorschlag.
- 🆕 **Meetup-Vorbereitung:** Checkliste und Erinnerungen als Aufgaben-*Vorschläge* zum fälligen Zeitpunkt.

**Bleibt bei dir (Freigabe nötig):**
- Strategie, Preise, Budget, Kooperationen
- Veröffentlichungen (außer mit befristeter Berechtigung, wie heute)
- Zahlungen, Löschen, produktive Systeme (nie automatisch)

**🆕 Entscheidungsvorlagen:**
- Bei einer strategischen Frage kann die KI eine Vorlage anlegen: Frage, Optionen, Abwägung, Empfehlung, offene Punkte.
- Du entscheidest per Tippen („Option B“). Die Entscheidung wird mit Begründung ins Gedächtnis übernommen, eine Prüfung
  nach 4 Wochen wird vorgeschlagen.

**🔧 Wöchentliche Strategie-Notiz über die bestehende geplante Claude-Aufgabe**
- Läuft über dein vorhandenes Abonnement, keine neue API.
- Die vorhandene Wochenanalyse wird um Unternehmensprofil und Gesprächsnotizen ergänzt und liefert eine tiefere
  Einschätzung („Was hat sich verändert, was sollten wir überdenken?“) als Vorschlag.
- So bekommt die schnelle KI im Alltag einmal pro Woche Unterstützung von einem stärkeren Modell. Es werden keine
  zusätzlichen Kosten erwartet, die Nutzungsgrenzen des Abonnements gelten.

**Erwartung:** weniger Routinearbeit, bessere Vorbereitung von Entscheidungen. **Risiko:** zu viele Hinweise. Daher je
Tag begrenzt, wie schon bei den Hinweisen (2.8). **Aufwand:** mittel.

### 4.6 KI-Modell (Frage 6)

**Heute:**
- Llama 3.3 70B (fp8, schnell); Ausweichmodell Gemma 4 26B.
- In unseren Tests: solide auf Deutsch, aber oberflächlich bei Beratung, unzuverlässig bei Werkzeugen und Kennzeichnung.

**Recherche (27.11.2026):**
- Im kostenlosen Kontingent von Workers AI (10.000 Neurons/Tag) gibt es neuere Modelle, z. B. gpt-oss-120b
  (Denkmodell), Llama 4 Scout, Gemma 4, Qwen3 und Mistral Small.
- Einige Spitzenmodelle (u. a. Kimi, GLM, DeepSeek V4) sind laut Berichten nur mit Bezahlung nutzbar. **Diese kommen
  nicht infrage.**
- Für Deutsch mit Werkzeugaufrufen gibt es keine belastbaren öffentlichen Vergleiche. Eine Studie bescheinigt gpt-oss
  Stärken beim Programmieren, aber Schwächen bei Mehrsprachigkeit.
- Die Modellseiten von Cloudflare waren aus der Arbeitsumgebung nicht direkt abrufbar. Verfügbarkeit und Preise prüfe ich
  vor einer Umstellung im Modellkatalog.

**Empfehlung: nicht blind wechseln, sondern messen.**
1. 🆕 **Modellvergleich** mit dem Qualitäts-Testset (4.2):
   - 4–5 kostenlose Kandidaten
   - künstliche Daten
   - Messgrößen: Qualität, Werkzeugtreue, Deutsch, Länge, Antwortzeit, **Neurons je Frage**
   - einmalig ca. 3.000–5.000 kostenlose Neurons, verteilt auf 1–2 Tage
2. 🆕 **Modellwahl je Aufgabe**, falls sich das lohnt:
   - schnelles Modell für Sprachmodus und Kurzfragen
   - stärkeres Modell für Beratung und Entscheidungsvorlagen
   - Denkmodelle erzeugen viele interne Token, deshalb nur, wenn das Budget es trägt
3. **Braucht eine Worker-Änderung:**
   - Modellwahl aus einer festen Liste
   - Kostenwerte der neuen Modelle für das Tagesbudget
   - **Bereitstellung nur mit deiner Freigabe**
   - Tagesbudget und alle Schutzmechanismen bleiben

---

## 5. Priorisierter Plan

| Phase | Inhalt | Worker-Änderung? | Aufwand | Wirkung |
|---|---|---|---|---|
| **1** | Qualitäts-Testset (Basis zum Messen) · Unternehmensprofil mit Freigabe · Antwortmodi und Beratungsstruktur · Prüfungen nach der Antwort (Wiederholung, Kennzeichnung) · `massnahmen` liefert Rohstoff | nein | 2–3 Arbeitssitzungen | **hoch** |
| **2** | Analyse-Werkzeug (Trichter, Verlauf, Maßnahmen-Wirkung, Meetup-Historie) · Vivalink-Playbook (Entwurf → deine Freigabe) | nein | 2 Sitzungen | hoch |
| **3** | Gesprächsnotizen, Entscheidungs-Kandidaten, lokale Auswahl relevanter Notizen | nein | 2 Sitzungen | mittel–hoch |
| **4** | Modellvergleich · ggf. Modellwahl je Aufgabe | **ja** (mit Freigabe) | 1–2 Sitzungen | offen – hängt vom Messergebnis ab |
| **5** | Morgen-Briefing, Entscheidungsvorlagen, erweiterte Selbstheilung, Strategie-Notiz über die bestehende Claude-Aufgabe | nein (Claude-Aufgabe: Anpassung der Anweisung) | 2 Sitzungen | mittel |
| optional | Bedeutungssuche (Einbettungen) | ja | 1 Sitzung | nur falls Phase 3 nicht reicht |

Jede Phase wird als eigene Version mit Pull Request geliefert:
- Tests in Chromium und WebKit (iPhone/iPad)
- Update- und Rückbau-Tests, falls sich das Datenformat ändert (voraussichtlich erst in Phase 3: Notizen je Chat)
- Messung mit dem Qualitäts-Testset vorher/nachher

Der Sprachmodus bleibt unverändert; er profitiert nur von besseren und kürzeren Antworten.

---

## 6. Kosten und Datenschutz

- **Keine zusätzlichen Kosten:**
  - Alles läuft im bestehenden kostenlosen Kontingent bzw. im vorhandenen Abonnement (geplante Claude-Aufgaben).
  - Der Worker begrenzt weiter auf 8.000 Neurons/Tag.
- **Mehrverbrauch je Frage (Schätzung):**
  - Profil: ca. +11 Neurons
  - Auswahl relevanter Notizen: ca. +10–20 Neurons
  - Nachfass-Aufruf (selten): ca. +50 Neurons
  - Gesprächsnotiz: ca. 60 Neurons je Gespräch
  - Reicht weiterhin für ca. 40–60 Fragen am Tag. Bei Erreichen der Grenze antwortet wie heute der lokale Assistent.
- **Datenschutz:**
  - Vertrauliche Einträge gehen nie an das Modell.
  - Freigaben je Bereich gelten weiter.
  - Unternehmensprofil und Playbook gehen erst nach deiner Freigabe an das Modell.
  - Notizen enthalten keine Personendaten.
  - Das Sprachmodus-Protokoll bleibt ohne Inhalte.

## 7. Risiken und realistische Einschätzung

- **Modellgrenze:** Die Qualität hängt am kostenlosen Modell. Die App-Maßnahmen verbessern das Ergebnis deutlich, ersetzen
  aber kein Spitzenmodell. Der Modellvergleich klärt, wie viel ein Wechsel bringt.
- **Mehr Kontext = mehr Verbrauch:** Alle Kontextteile haben feste Obergrenzen und werden gemessen.
- **Fehlerhafte Notizen oder Profile:** Sie sind sichtbar und korrigierbar; nichts Wichtiges wird ohne Bestätigung dauerhaft.
- **Hinweis-Flut:** tägliche Obergrenzen.
- **Gerätetests** bleiben für Sprachausgabe und Darstellung nötig; die Logik ist automatisch testbar.

## 8. Entscheidungen, die ich von dir brauche

1. Freigabe des Plans bzw. der Reihenfolge (Empfehlung: Phase 1 → 2 → 3, Modellvergleich parallel zu Phase 2).
2. Darf das Unternehmensprofil aus bestehenden, bestätigten Gedächtniseinträgen vorbefüllt werden (Entwurf, erst nach
   deiner Freigabe aktiv)?
3. Darf ich das Vivalink-Playbook als Entwurf schreiben (allgemeine Erfahrungswerte, als solche gekennzeichnet)?
4. Für Phase 4: grundsätzliches Einverständnis, später eine Worker-Änderung (Modellwahl) vorzubereiten. Die
   Bereitstellung erfolgt weiterhin nur nach deiner ausdrücklichen Freigabe.
