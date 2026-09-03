# Klarwert – Architektur

## Schichtenmodell

```
┌─────────────────────────────────────────────┐
│  UI (React, feature-basierte Ordner)         │
│  features/{transaktionen,rechner,import,...}  │
├─────────────────────────────────────────────┤
│  Domänen-Logik  (src/lib/)                   │
│  money.ts · dates.ts · pipeline.ts           │
│  rechner/ · import/ · charts/               │
├─────────────────────────────────────────────┤
│  Repositories  (src/db/repositories/)        │
│  transactions · assets · rules · merchants   │
│  categories · contracts · settings · …      │
├─────────────────────────────────────────────┤
│  Datenbankschicht  (src/db/)                 │
│  migrate.ts · client.ts                     │
│  migrations/, fortlaufend numeriert         │
├─────────────────────────────────────────────┤
│  SQLite (Tauri plugin-sql, lokale Datei)     │
└─────────────────────────────────────────────┘
```

**Wo liegt Geschäftslogik?**
- Berechnungen (Steuer, FIRE, Zinseszins, Budgets): `src/lib/`
- Kategorisierungs-Pipeline: `src/lib/pipeline.ts`
- Importverarbeitung: `src/lib/import/`
- Repositories sind **nur Datenzugang** – kein Business-Logic darin

**Wo liegt sie nicht?**
- Nicht in React-Komponenten
- Nicht in Migrations-SQL (nur Schema, kein Logic)

---

## Datenfluss beim Import

```
Dateiauswahl (ImportWizard.tsx)
  → Profilerkennung (importProfiles.ts)
  → CSV/Excel-Parsing (csv.ts / read-excel-file)
  → Zod-Validierung (import/schema.ts)
  → runImport() – eine Transaktion
      ├── Zeilen schreiben (transactions)
      ├── Pipeline: pipeline.ts (Regeln → Merchant → Transfer → Verträge)
      └── Import-Log-Eintrag (importLogs)
```

**Transaktionsdisziplin (verbindlich):**
Jeder mehrschrittige Schreibvorgang nutzt `runInTransaction(fn)` aus `src/db/client.ts`.
Niemals manuelles `BEGIN`/`COMMIT` außerhalb dieser Funktion.

---

## i18n-Architektur

- **Framework:** `react-i18next` + `i18next`
- **Sprachen:** `de` (Default), `en`
- **Ressourcen:** `src/locales/{de,en}/{namespace}.json`
- **Namespaces:** je Feature (`rechner`, `transaktionen`, …); global: `app`
- **Typsicherheit:** `src/i18next.d.ts` mit `CustomTypeOptions`

**Trennlinie kuratiert/nutzereigen:**
- Einträge mit `is_builtin=1` (Kategorien, Händler) haben einen stabilen `template_key`
- Anzeigename wird zur Laufzeit über `t(template_key)` aufgelöst → übersetzbar
- Nutzereigene Einträge speichern den wörtlich eingegebenen Text, **werden nie übersetzt**
- Eigennamen (Rewe, Netflix, Amazon) bleiben unübersetzt – auch wenn kuratiert

Vollständiges Muster: `context/CLAUDE.md` → Abschnitt „i18n-Muster"

---

## Wichtige Architekturentscheidungen

→ Vollständige Begründungen: `docs/adr/`

| # | Entscheidung | Kurzfassung |
|---|---|---|
| 001 | Mehrwährungs-Schema, Einwährungs-UI | Schema jetzt, UI-Aggregation später |
| 002 | Keine FX-Umrechnung | Offline-Versprechen, keine Netzwerk-APIs |
| 003 | Kuratiert/Nutzereigen-Trennung bei Übersetzungen | Nutzerdaten sind unveränderlich |
| 004 | Generischer Kontoidentifikator | IBAN ist DE/EU-spezifisch |
| 005 | Deterministische Alias-Prioritätsordnung | Reproduzierbare Kategorisierung |
| 006 | Keine eigene Domain-Schicht | YAGNI; Repositories + lib/ reichen |
| 007 | Kein Laufzeit-Plugin-System | Offline-App, kein Extension-Punkt nötig |

---

## Schema-Freeze (ab Phase A)

Das Datenbankschema gilt durch die Migrationen unter `src/db/migrations/`, fortlaufend numeriert, als **stabil**.

Erlaubt:
- `ALTER TABLE … ADD COLUMN … DEFAULT …` (neue Spalten mit Default)
- neue Tabellen
- neue Indizes

Nicht ohne ausdrücklichen Anlass:
- Spalten umbenennen oder entfernen (Breaking Change für bestehende DBs)
- bestehende CHECK-Constraints ändern (erfordert Table-Rebuild)
- Tabellen-Rebuilds zentraler Tabellen (`transactions`, `assets`, `categories`)

---

## Speicherorte & Datenhoheit

Klarwert ist strikt lokal und verfolgt den Grundsatz der absoluten Datenhoheit für den Nutzer.

- **Aktive Datenbank:** Die SQLite-Datenbank (`klarwert.db`) liegt im betriebssystemspezifischen AppData-Verzeichnis (z. B. `~/Library/Application Support/com.aj.klarwert/` auf macOS). Dieses Verzeichnis wird von Tauri verwaltet und übersteht App-Updates.
- **Backups & Exporte:** Um die Datenhoheit praktikabel zu machen, sichert Klarwert automatische Backups in das benutzerzugängliche Dokumentenverzeichnis (`~/Documents/Klarwert/Backups`). Dieses Verzeichnis übersteht selbst eine Deinstallation der App und kann vom Nutzer in Cloud-Ordner verschoben werden.
- **Offene Formate:** Über die Einstellungen können jederzeit Exporte angestoßen werden:
  1. **SQLite (`.db`)**: Die vollständige Datenbank inkl. Struktur (als Backup in `~/Documents/Klarwert/Backups`).
  2. **JSON**: Ein Schema-versionierter hierarchischer Export.
  3. **CSV**: Einzelne CSV-Dateien pro Tabelle (`Alle Tabellen als CSV`).
  
Dadurch ist gewährleistet, dass Nutzerdaten niemals in Klarwert "eingesperrt" sind. Dritte (bzw. der Nutzer selbst mit Excel/Python/SQLite-Browser) können die Daten jederzeit und ohne die Klarwert-App weiterverwenden.

---

## Netzwerkzugriffe

Klarwert ist eine **offline-first** Anwendung. **Alle Kerndaten verbleiben ausschließlich auf dem Gerät des Nutzers.** Es gibt genau zwei optionale Netzwerkzugriffe:

### 1. In-App-Updates (Auto-Updater)
- Quelle: GitHub Releases (`github.com/Klarwert/Klarwert`)
- Protokoll: HTTPS, signiert mit Ed25519 (Tauri Updater)
- Aktiviert, wenn in den Einstellungen aktiviert (Standard: aktiv)
- Es werden **keinerlei Nutzdaten** übertragen – nur die Versionsnummer der aktuellen Releases wird abgefragt.

### 2. Kursdaten für Depot-Positionen (optional, standardmäßig deaktiviert)
- Quelle: Konfigurierbarer Datenanbieter (Yahoo Finance, Alpaca Markets oder manuell)
- Implementierung: `src/lib/quotes/` – `PriceProvider`-Interface mit austauschbaren Backends
- **Standardmäßig deaktiviert.** Beim ersten Aktivieren erscheint ein expliziter Datenschutzhinweis.
- Es werden ausschließlich **Wertpapier-Kennungen (ISIN / Ticker-Symbole)** übertragen – niemals Stückzahlen, Kaufpreise, Kontostände oder andere persönliche Finanzdaten.
- Abgerufene Kurse werden lokal in der Tabelle `depot_prices` gecacht (max. 1× pro Tag und ISIN).
- Dies ist der **einzige optionale Netzwerkzugriff** mit Bezug zu Nutzerinhalten.

### Community-Daten (pull-only, keine Kontodaten)
- Quelle: `raw.githubusercontent.com/Klarwert/Klarwert-Community-Rules`
- Wird nur auf expliziten Nutzer-Klick ausgeführt (kein Hintergrund-Sync)
- Übertragen werden ausschließlich kuratierte Händler- und Bankprofil-Daten aus dem öffentlichen Repo.
- Es werden keine Nutzerdaten hochgeladen (pull-only).

---

## Community-Rules-Architektur

Die App arbeitet mit einem separaten Repository (`Klarwert-Community-Rules`) zusammen, das gemeinsam gepflegte Händler-Zuordnungen und Bankprofile bereitstellt.

**Trust Model:**
Klarwert unterscheidet bei Händlern drei Vertrauensstufen (`source`):
1. **`system`**: Fest eingebaut, unveränderlich (höchstes Vertrauen).
2. **`community`**: Aus dem Community-Rules-Repo importiert. Diese können vom App-Code als veraltet markiert ("deprecated") werden.
3. **`user`**: Vom Nutzer selbst lokal angelegt. Eigene Änderungen (z. B. Umbenennungen, eigene Kategorie) haben immer Vorrang und setzen das Flag `is_modified=1`. Ein Community-Update überschreibt niemals lokale Nutzeranpassungen.

**Der `schema_version`-Vertrag:**
Beide Repos (App und Community-Rules) teilen sich einen festen Schema-Versions-Vertrag.
Die App erzwingt zur Laufzeit einen exakten Match der `schema_version` in den geladenen JSON-Dateien. Bricht die Struktur der Community-Daten, führt dies zu einer sauberen Ablehnung in der App, ohne dass diese abstürzt.

### Kein Tracking, keine Telemetrie
Klarwert enthält **keinerlei Telemetrie, Analytics, Crash-Reporter oder sonstige Datenerfassung**.
Es gibt keinen Server, keine Cloud-Komponente, kein User-Account.
