# Klarwert – Bugfix-Runde 2

## 1. `error from database: code 1. No such table: main.rules_rebuild_old`

Klassischer SQLite-Rebuild-Migrationsfehler (dieselbe Fehlerklasse, vor der `klarwert-schema.sql` beim `contracts`/`rules`-Verhältnis bereits warnt). Zu prüfen:
- Läuft die Migration, die `rules` umbaut (vermutlich die für die neue Regel-Vorlagen-Pipelinestufe bzw. deren Ablösung, siehe `prompt-haendler-regel-vereinigung.md`), idempotent? Vor dem Neuanlegen der Rebuild-Zwischentabelle immer `drop table if exists rules_rebuild_old` voranstellen.
- Existiert bereits eine Leiche von einem vorherigen, abgebrochenen Migrationslauf? Falls ja: einmaliges Aufräum-Skript für bereits betroffene lokale Installationen (nicht nur die Migration selbst reparieren, sonst bleiben bestehende Nutzer mit kaputter DB zurück).
- `PRAGMA foreign_keys` während des Rebuilds korrekt aus- und wieder eingeschaltet? Ein Rebuild mit aktiven Fremdschlüsseln auf eine Tabelle mit eingehenden Referenzen (`rule_conditions.rule_id`, ggf. `transactions.applied_rule_id`) schlägt sonst mitten im Vorgang fehl und hinterlässt genau so eine Zwischentabelle.

Diesen Fix **vor** `prompt-haendler-regel-vereinigung.md` einordnen, da dieser Auftrag `rules` erneut anfasst – auf kaputter Basis nicht sinnvoll.

## 2. Transfer-Erkennung über Alias – unabhängig neu verifizieren

Vorheriger Bericht: "war bereits korrekt implementiert". Aktuelle Rückmeldung: funktioniert weiterhin nicht. Nicht dem vorherigen Bericht vertrauen, neu und konkret testen:
- Eine Person mit mindestens zwei Namensvarianten in den Einstellungen anlegen.
- Eine synthetische Buchung mit einer dieser Varianten als Empfänger einspielen, die sonst keinem eigenen Konto per IBAN zuzuordnen ist.
- Prüfen: kommt tatsächlich ein Vorschlag/Hinweis? Falls nein: prüfen, ob die Pipeline-Stufe die Alias-Tabelle überhaupt abfragt (Verdacht aus der letzten Runde: UI speichert korrekt, Matching-Code liest die Tabelle nicht).

## 3. Transfer-Darstellung vereinfachen

Aktuell: gelbes "Transfer?" in der Empfänger-Spalte, nach Bestätigung grünes "Transfer". Vereinfachen: der bestehende `transfer_status` steuert stattdessen die Darstellung der **Kategorie-Zelle** (die technischen Felder `is_transfer`/`transfer_pair_id`/`is_saving` bleiben bestehen, siehe Begründung unten) –
- Vorgeschlagen (`transfer_status='suggested'`): Kategorie-Badge "Kontentransfer" gestrichelt/gedimmt dargestellt, mit Bestätigen-Aktion.
- Bestätigt: normales, volles Kategorie-Badge "Kontentransfer".
- Bei Zielkonto vom Typ Tagesgeld/Depot: Badge zeigt "Sparen" (bzw. den konkreten Sparzweck) statt "Kontentransfer" – das ist bereits die bestehende Unterscheidung, macht sie aber sichtbar statt nur intern.

Keine separate Empfänger-Spalten-Markierung mehr nötig – die Kategorie-Spalte allein trägt die Information, konsistent mit jeder anderen Buchung.

**Warum `is_transfer`/`transfer_pair_id` als Felder bleiben, nicht nur die Kategorie:** die Verknüpfung zweier Buchungen als Paar wird für korrekte Auswertungen gebraucht (sonst zählt eine Umbuchung ggf. doppelt), das leistet eine reine Kategorie-Zuweisung nicht. Nur die *Darstellung* wird vereinfacht, nicht die zugrundeliegende Struktur.

## 4. Eigene Konten automatisch vorschlagen

Neue, leichte Heuristik zusätzlich zur expliziten IBAN-Hinterlegung: taucht dieselbe Empfänger-IBAN auffällig oft (Schwelle z. B. ≥ 5 Buchungen) als Gegenpartei auf, ohne einem eigenen Konto zuzuordnen zu sein → einmaliger, dismissable Hinweis ("Diese IBAN taucht in 12 Buchungen auf – gehört sie zu einem deiner Konten?"). Nie automatisch anlegen, nur vorschlagen.

Zur Sparkonto-Zuordnung selbst: das existiert vermutlich bereits über `assets.account_type` (Tagesgeld/Depot → automatisch `is_saving`), macht aber laut Rückmeldung den Eindruck, nicht offensichtlich genug zu sein. In der Konto-Bearbeiten-Ansicht diesen Zusammenhang klarer machen (z. B. eine einfache Checkbox "Das ist ein Sparkonto" statt eines technischen Typ-Dropdowns, die im Hintergrund denselben `account_type` setzt). Das "ausgehende gegenrechnen" (Entnahme vom Sparkonto zurück aufs Girokonto reduziert den Sparstand) sollte über die bereits vorzeichenbehaftete Betragslogik automatisch funktionieren – gezielt mit einem echten Testfall verifizieren, nicht nur annehmen.

## 5. Sankey-Diagramm: Standardansicht, Vollbild, Export

- Standardansicht darf nicht rechtsseitig abgeschnitten sein – vermutlich eine feste Breitenannahme statt dynamischer Skalierung auf die Anzahl der Knoten/Container-Breite. Container-Breite beim Rendern tatsächlich messen und die Darstellung entsprechend skalieren, statt eine Scroll-Notwendigkeit zu erzeugen.
- Vollbild-Umschaltung: bestehendes Diagramm in ein Modal/Overlay auf voller Fensterhöhe/-breite vergrößern.
- Als Bild herunterladen: ECharts bringt dafür bereits eine eingebaute Funktion mit (`chart.getDataURL()` bzw. das Toolbox-Feature `toolbox.feature.saveAsImage`) – diese aktivieren statt eine eigene Canvas-Export-Lösung zu bauen.

## 6. Kategorie-Icon-Farben stärker abgrenzen

Aktuelle Markenfarben (Petrol/Charcoal/Brick/Sage/Gold/Slate) sind als semantische Statusfarben gedacht (positiv/negativ/neutral), nicht als Kategorien-Palette für potenziell ein Dutzend+ Kategorien. Da Unterkategorien laut Schema-Kommentar ohnehin die Farbe der Oberkategorie erben, wird nur eine Palette für die **Oberkategorien** gebraucht (überschaubare Anzahl). Eine erweiterte, aber weiterhin warme/gedeckte Zusatzpalette (6–10 zusätzliche, klar unterscheidbare Töne in derselben Familie) speziell für Kategorie-Icons definieren, getrennt von den 6 semantischen Kernfarben, die für Status/Vorzeichen reserviert bleiben.

## 7. Fehler-Toasts: Text nicht markierbar

`user-select: none` vermutlich irgendwo vererbt oder explizit gesetzt auf dem Toast-Container – entfernen für Toast-Textinhalte. Zusätzlich, robuster als reine Textmarkierung: kleiner Kopieren-Button direkt im Fehler-Toast (kopiert die vollständige Fehlermeldung in die Zwischenablage) – nützlich gerade weil Toasts oft automatisch verschwinden, bevor man in Ruhe markieren kann.

## Definition of Done

Für jeden Punkt manuell in der laufenden App nachvollzogen, nicht nur im Code gelesen – siehe Begründung zu Punkt 2 oben.
