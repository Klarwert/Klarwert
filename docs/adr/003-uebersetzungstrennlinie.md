# ADR-003: Trennlinie kuratiert/nutzereigen bei Übersetzungen

**Status:** Akzeptiert  
**Datum:** 2026-08-20

## Kontext

Klarwert verwaltet zwei Arten von Inhalten: kuratierte Inhalte (Template-Kategorien, Händler-Stammdaten, Bankformat-Profile) und nutzereigene Inhalte (selbst angelegte Kategorien, eigene Regeln, Kontennamen).

Kuratierte Inhalte sollen in jeder Sprache korrekt erscheinen. Nutzereigene Inhalte sind Daten des Nutzers und müssen unberührt bleiben.

## Entscheidung

**Kuratierte Inhalte** (`is_builtin=1` bzw. `is_template=1`):
- Besitzen einen stabilen `template_key` (Slug, z. B. `category.lebensmittel`)
- Der Anzeigename wird zur Laufzeit über `i18n.t(template_key)` aufgelöst
- Die deutschsprachige Bezeichnung ist Ressourcendatei-Inhalt, nicht Datenbankinhalt
- Eigennamen (Rewe, Netflix, Amazon) bleiben unübersetzt – auch wenn kuratiert

**Nutzereigene Inhalte** (`is_builtin=0` / `is_template=0`):
- Speichern den wörtlich eingegebenen Text in der Datenbank
- Werden **niemals** automatisch übersetzt oder verändert
- Das sind die Daten des Nutzers, kein UI-Text

## Konsequenzen

- Eine neue Sprache erfordert nur neue Ressourcendateien, keine Daten-Migration.
- Nutzerdaten sind gegen unerwünschte Veränderung geschützt.
- `template_key` muss bei jedem neuen kuratierten Eintrag vergeben werden (kein Eintrag ohne Key im `is_builtin=1`-Kontext).
