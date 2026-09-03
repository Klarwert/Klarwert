# Changelog

Alle relevanten Änderungen an Klarwert werden in dieser Datei dokumentiert.
Format nach [Keep a Changelog](https://keepachangelog.com/de/1.0.0/), Versionsschema nach [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] – 2026-09-03

### Hinzugefügt
- **Depot-Log:** Kurskorrekturen werden als `auto` (Provider-Abruf) oder `manual` (Nutzer-Eingabe) gekennzeichnet und im Audit-Trail geführt.
- **Kirchensteuer verdrahtet:** Der Kirchensteuer-Schalter in den Einstellungen beeinflusst jetzt den voreingestellten Steuersatz in FIRE-, Zinseszins- und Entnahme-Rechner. Kirchensteuer-Einstellungen werden nur in der deutschen Oberfläche angezeigt.
- **Alpaca-API-Keys in der Keychain:** API Key und Secret für Alpaca Markets werden jetzt im macOS-Schlüsselbund statt unverschlüsselt in der App-Datenbank gespeichert. Bestehende Schlüssel werden beim ersten Start automatisch migriert.

### Geändert
- `rule_templates`-Tabelle wurde endgültig entfernt (war seit Migration 022 nicht mehr in Verwendung).
- Dokumentation (ARCHITECTURE.md, CONTRIBUTING.md) enthält keine veralteten Versions- oder Migrationszahlen mehr.
- Abhängigkeiten: browserslist und fast-uri aktualisiert (Security-Fixes).

### Behoben
- Release-Workflow: Race Condition bei gleichzeitiger Release-Erstellung aus mehreren Plattform-Jobs behoben.
- Rechner: Betragseingabe nutzt jetzt `money.ts`-Parser statt einer eigenen Implementierung.
- Sprache und Datumsformat sind jetzt unabhängig einstellbar; Währungseinstellung wirkt app-weit reaktiv.
- Mehrere Übersetzungslücken in Rechner, Kursdaten, Übersicht und Benachrichtigungen geschlossen.

## [0.1.0] – 2026-08-05

Erste öffentliche Vorschau-Version.

### Hinzugefügt
- Import von Banktransaktionen (DKB, C24 und weitere) via CSV
- Automatische Kategorisierung (Regeln, Händler-DB, Fuzzy-Matching)
- Vermögensübersicht mit Verlauf und Vergleichszeitraum
- Depot-Verwaltung mit automatischem Kursabruf (Yahoo Finance, Alpaca Markets)
- FIRE-, Zinseszins- und Entnahme-Rechner
- Verträge und Abonnements
- Steuer-Themen und Budgets
- Datenschutz by Design: alle Daten verbleiben lokal in SQLite
- macOS (Apple Silicon & Intel), Windows und Linux (AppImage/deb)

[0.1.1]: https://github.com/Klarwert/Klarwert/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Klarwert/Klarwert/releases/tag/v0.1.0
