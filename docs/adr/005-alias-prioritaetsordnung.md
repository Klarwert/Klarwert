# ADR-005: Deterministische Alias-Prioritätsordnung

**Status:** Akzeptiert  
**Datum:** 2026-08-20

## Kontext

Transaktionen können mehreren Händlern oder Regeln entsprechen. Ohne feste Prioritätsreihenfolge ist die Kategorisierung nicht reproduzierbar – dieselbe Transaktion könnte bei zwei Läufen unterschiedliche Kategorien erhalten.

## Entscheidung

Die Kategorisierungs-Pipeline wendet Regeln und Aliases in **deterministischer Prioritätsreihenfolge** an:

1. Manuell gesetzte Kategorisierung (höchste Priorität)
2. Benutzerregeln (nach `priority`-Spalte, aufsteigend = höhere Priorität)
3. Händler-Alias-Matching (nach `match_type`: `account_identifier` > `name_exact` > `name_fuzzy` > `regex`)
4. Transfer-/Sparen-Erkennung
5. Vertragserkennung
6. Similarity-Matching (niedrigste Priorität)

Bei Gleichstand gewinnt die Regel mit der niedrigeren `id` (Einfügungsreihenfolge).

## Konsequenzen

- Kategorisierungs-Ergebnisse sind reproduzierbar und testbar.
- `pipeline.integration.test.ts` belegt die Reihenfolge mit konkreten Fixtures.
- Neue Matching-Mechanismen müssen explizit in die Prioritätsreihe eingeordnet werden.
