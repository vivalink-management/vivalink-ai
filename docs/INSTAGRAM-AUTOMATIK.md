# Automatische Instagram-Veröffentlichung: Voraussetzungen und vorbereiteter Aufbau

**Stand:** Vorbereitet, nicht aktiv. Es wurden keine Zugänge angefordert und nichts veröffentlicht.

## Voraussetzungen (Meta, kostenlos)
- **Konto:** Instagram-**Business**- oder Creator-Konto (laut Gründer vorgesehen: Business).
- **Anmeldeweg:** Zwei Wege sind möglich.
  - **Instagram API with Instagram Login** (neuer Weg): ohne Facebook-Seite. Berechtigungen `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights`.
  - **Facebook Login:** braucht eine verknüpfte Facebook-Seite. Berechtigungen `instagram_content_publish`, `instagram_basic`, `instagram_manage_insights`.
- **Meta-Entwickler-App:** kostenlos anzulegen. Für das **eigene** Konto genügt sie im Entwicklungsmodus mit dem Konto als Tester. Eine App-Prüfung durch Meta wäre erst nötig, wenn fremde Konten angebunden würden.
- **Zugangs-Token:** langlebig (ca. 60 Tage), regelmäßig erneuerbar. Wird **nur im Worker** als geschütztes Geheimnis gespeichert, nie in der App oder im Repository.

## Was die Schnittstelle kann
- **Formate:** Einzelbild, Karussell (bis 10 Bilder), Reels, Stories.
- **Bilder:**
  - müssen als **JPEG unter einer öffentlich erreichbaren Adresse** vorliegen
  - Der Worker stellt sie kurzzeitig unter einer zufälligen Adresse bereit und löscht sie nach der Veröffentlichung.
  - Der JPEG-Export ist in der App bereits umgesetzt.
- **Ablauf:** Container anlegen → Status prüfen → veröffentlichen. Container verfallen nach 24 Stunden.
- **Kontingent:** Meta nennt widersprüchlich 50 bzw. 100 Veröffentlichungen pro 24 Stunden. Bei 3 Beiträgen pro Woche ist das irrelevant. Der Worker prüft vorher `content_publishing_limit`.
- **Statistiken:** Reichweite, Interaktionen, Speicherungen, Profilaufrufe je Beitrag. Sie fließen in die vorhandene Auswertung (`metrics`) und Lernlogik (`learn`).
- **Kosten:** keine.

## Vorbereiteter Aufbau (fertig und getestet)
- **Nur Freigegebenes:** Nur Beiträge mit Status „freigegeben“ und **seit der Freigabe unverändertem Inhalt** dürfen veröffentlicht werden (`canPublish`, Fingerabdruck `approvedHash`).
- **Einmalig:** `claimPublish` → `finishPublish` mit Zustand `laeuft`, `erledigt` oder `fehler`.
  - Doppelte oder parallele Veröffentlichung wird verhindert.
  - Nach einem Fehler ist ein neuer Versuch möglich.
  - Der Schlüssel ist die Beitrags-ID.
- **Freigabestufe:** „Veröffentlichen“ ist Stufe 2. Das Veröffentlichen nicht freigegebener Beiträge ist Stufe 3 und wird immer abgelehnt.
- **Protokoll:** jede Veröffentlichung im Aktionsprotokoll.
- **Bereits geplant:** freigegebene Beiträge mit Datum und Uhrzeit (Status „Geplant“ bzw. „Fällig“).

## Ablauf nach Freigabe (geplant)
1. Der Worker (`server/sync-worker.js` wird erweitert) prüft zeitgesteuert (Cron Trigger, kostenlos), welche freigegebenen Beiträge fällig sind.
   - Zugang dazu: wie bei den geplanten Claude-Aufgaben über die Faktenliste bzw. einen Veröffentlichungsauftrag, den die App beim Freigeben verschlüsselt ablegt.
2. Ablauf im Worker: Bilder als JPEG → kurzzeitig bereitstellen → Container → veröffentlichen.
3. Status und Instagram-Link werden zurückgemeldet. Statistiken folgen nach 24 bis 48 Stunden automatisch.

## Was du später entscheiden bzw. tun musst
1. Instagram auf **Business** stellen (falls noch nicht geschehen).
2. Anmeldeweg wählen. Empfehlung: Instagram Login, ohne Facebook-Seite.
3. Meta-Entwickler-Konto und App anlegen. Claude führt Schritt für Schritt durch; Zugangsdaten nie im Chat einfügen.
4. Festlegen, welche Kategorien nach deiner Freigabe **automatisch zum geplanten Zeitpunkt** veröffentlicht werden.
