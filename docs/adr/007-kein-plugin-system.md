# ADR-007: Kein Laufzeit-Plugin-System

**Status:** Akzeptiert  
**Datum:** 2026-08-20

## Kontext

Einige Desktop-Apps erlauben Plugins (Erweiterungen zur Laufzeit). Das ermöglicht Community-Erweiterungen ohne Code-Änderung, schafft aber erhebliche Komplexität bei Sicherheit, Versionierung und Testing.

## Entscheidung

Klarwert hat **kein Laufzeit-Plugin-System**. Erweiterungen erfolgen durch:

1. **Kuratierte Community-Inhalte** (Händler-DB, Bankformat-Profile, Regelvorlagen) – als Datendateien, kein ausführbarer Code
2. **Open Source-Beiträge** (Pull Requests gegen das Haupt-Repository)
3. **Konfiguration** (Einstellungen, Regeln, Kategorien im UI)

## Konsequenzen

- Keine Angriffsfläche durch fremden Code, der zur Laufzeit geladen wird.
- Alle Features sind vollständig testbar und versioniert.
- Community-Beiträge für Inhalte (Händler, Bankprofile) sind weiterhin möglich – nur ohne ausführbaren Code.
- Bei zukünftigem echtem Bedarf an Plugins müsste ein sandboxed Execution-Modell evaluiert werden (z. B. WASM-isolierter Kontext).
