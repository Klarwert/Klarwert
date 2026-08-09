# Klarwert – Regel-Builder erweitern

Betrifft sowohl einzelne Regeln (Kategorien-Einstellungen) als auch Regeln, die über Händler entstehen (`prompt-haendler-regel-vereinigung.md`) – eine gemeinsame Komponente, nicht zwei.

## 1. Warum nur 5 Felder, was ist "Zusatzfeld"?

`rule_conditions.field` ist aktuell auf `purpose`/`counterparty`/`amount`/`asset`/`custom` beschränkt, `custom` verweist über `custom_field_id` auf genau eine Tabelle strukturierter Zusatzfelder – das ist **nicht** dasselbe wie die dynamischen `extra_fields_json`-Schlüssel aus dem CSV-Import (Buchungs-ID, Mandatsreferenz usw. – siehe `klarwert-import-architektur-v2.md` Abschnitt 2.2). Deshalb tauchen Custom-Spalten aus dem Import in der Regel-Bedingungsauswahl nicht auf.

**Fix:** `rule_conditions` bekommt eine zusätzliche, nullable Spalte `extra_field_key text` – gesetzt, wenn eine Bedingung sich auf einen `extra_fields_json`-Schlüssel bezieht, statt auf `custom_field_id`. Genau eines von `custom_field_id` / `extra_field_key` ist gesetzt, nie beide (Check Constraint). Die Feldauswahl im Builder zeigt dann: die Kernfelder + alle über die zuletzt importierten Buchungen tatsächlich vorkommenden `extra_fields_json`-Schlüssel.

## 2. Operatoren für Beträge

`rule_conditions` bekommt `operator text check (operator in ('equals', 'contains', 'greater_than', 'less_than', 'between'))` (falls noch nicht vorhanden) + `value text` + optional `value_to text` (für `between`). Für `amount`: `greater_than`/`less_than`/`equals`/`between` sinnvoll; für Textfelder (`purpose`/`counterparty`/`extra_field_key`): `equals`/`contains`.

## 3. UND/ODER-Bedingungen, zweistufig (bewusst nicht beliebig verschachtelt für v1)

**Bewusste Vereinfachung gegenüber "auch verschachtelt":** ein voll rekursiver Bedingungsbaum ist deutlich aufwändiger zu bauen, zu testen und für Nutzer zu verstehen, als der Alltagsnutzen es aktuell rechtfertigt. Stattdessen zweistufig, deckt praktisch alle realistischen Fälle ab:

- Eine Regel hat mehrere **Bedingungsgruppen**, Gruppen sind über **ODER** verknüpft.
- Innerhalb einer Gruppe sind Bedingungen über **UND** verknüpft.

Schema-Erweiterung: neue Tabelle `rule_condition_groups(id, rule_id, group_order)`, `rule_conditions` bekommt `group_id integer references rule_condition_groups(id) on delete cascade` statt direkt an `rule_id` zu hängen. Deckt z. B. "(Empfänger enthält 'Amazon' UND Betrag > 50) ODER (Verwendungszweck enthält 'Prime')" ab. Falls sich in der Praxis zeigt, dass echte Verschachtelung (Gruppen von Gruppen) gebraucht wird: als separater, späterer Auftrag, nicht vorab bauen.

## 4. Durchsuchbarer Werte-Picker aus echten Transaktionsdaten

Neben dem gewählten Feld (z. B. "Empfänger") ein durchsuchbares Dropdown, befüllt mit `SELECT DISTINCT counterparty FROM transactions WHERE is_deleted=0 ORDER BY count(*) DESC LIMIT 200` (analog für andere Textfelder) – Tippen filtert, Klick übernimmt den exakten Wert als Bedingungswert. Verhindert Tippfehler, macht Regeln robuster, genau wie gewünscht.

## 5. Vorschau: durchsuchbare Trefferliste statt nur Anzahl

Die bestehende Vorschau beim Regel-Erstellen zeigt aktuell vermutlich nur eine Trefferzahl. Erweitern zu einer echten, durchsuchbaren/scrollbaren Liste der tatsächlich betroffenen Buchungen (bestehende Transaktionstabellen-Komponente wiederverwenden, gefiltert nach dem aktuellen Regel-Entwurf, live bei jeder Änderung der Bedingungen neu berechnet).

## Definition of Done

- [ ] Eine Regel mit zwei UND-Bedingungen in einer Gruppe und einer zweiten Gruppe (ODER-verknüpft) funktioniert nachweislich an einem Testfall mit drei synthetischen Buchungen (zwei sollen treffen, eine nicht).
- [ ] Ein `extra_fields_json`-Schlüssel aus einem echten Import taucht in der Feldauswahl auf und lässt sich als Bedingung verwenden.
- [ ] Der Werte-Picker zeigt echte, in der Datenbank vorkommende Werte, keine Platzhalter.
