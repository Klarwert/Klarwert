# ADR-006: Keine eigene Domain-Schicht

**Status:** Akzeptiert  
**Datum:** 2026-08-20

## Kontext

In klassischen DDD-Architekturen gibt es eine eigene Domain-Schicht mit Aggregaten, Entities und Value Objects. Für eine Desktop-App dieser Größe wäre das ein erheblicher Overhead.

## Entscheidung

Klarwert verzichtet auf eine explizite Domain-Schicht. Die Architektur ist:

```
UI (React) → lib/ (Geschäftslogik) → Repositories (Datenzugang) → SQLite
```

`lib/` enthält reine Funktionen (kein State, keine Klassen-Hierarchien). Repositories geben einfache Datenobjekte zurück (`src/db/types.ts`).

## Konsequenzen

- Weniger Boilerplate, direkter Datenzugang.
- Passt zum Offline-First-Modell ohne komplexen Domain-State.
- Bei erheblichem Wachstum (z. B. echte Mehrbenutzerfähigkeit) muss die Architektur neu bewertet werden – dann wäre eine explizite Domain-Schicht sinnvoll.
