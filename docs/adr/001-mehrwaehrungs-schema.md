# ADR-001: Mehrwährungs-Schema mit Einwährungs-UI

**Status:** Akzeptiert  
**Datum:** 2026-08-20

## Kontext

Klarwert richtet sich an Nutzer aus verschiedenen Ländern. Finanz-Apps werden häufig mit Konten in mehreren Währungen verwendet (z. B. EUR + CHF, EUR + USD). Eine spätere Nachrüstung des Währungsfelds wäre eine Migration über die zentralste Tabelle des Systems (`transactions`, zig Tausende Zeilen bei aktiven Nutzern).

## Entscheidung

Das Schema erhält **jetzt** Währungsspalten:
- `assets.currency TEXT NOT NULL DEFAULT 'EUR'`
- `transactions.currency TEXT NOT NULL DEFAULT 'EUR'`

Die UI bleibt vorerst **einwährungs-fähig**: Aggregationen (Nettovermögen, Kategorie-Summen, Budgets) rechnen nur innerhalb einer Währung. Wenn mehrere Währungen in den Daten vorkommen, weist die UI Summen **pro Währung getrennt** aus – sie addiert niemals stumm über Währungsgrenzen.

## Konsequenzen

- **Kein Breaking Change** für bestehende Nutzer: Default `'EUR'` sorgt dafür, dass bestehende Daten sich genauso verhalten wie vorher.
- **Keine automatische FX-Umrechnung** (→ ADR-002).
- Neue Features (Multi-Währungs-Dashboard, Wertpapier-Import in USD) können ohne Schema-Migration gebaut werden.
- Testpflicht: mindestens ein Test, der belegt, dass gemischte Währungen nicht stumm summiert werden (→ `src/lib/money.test.ts`).
