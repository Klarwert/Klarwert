# Mitwirken bei Klarwert

Danke für dein Interesse! Es gibt mehrere Wege, ohne dass alle davon Programmierkenntnisse brauchen.

## In 5 Minuten lauffähig

### Voraussetzungen

| Tool | Mindestversion | Installationshinweis |
|------|---------------|----------------------|
| Node.js | ≥24 | <https://nodejs.org> |
| Rust | stabil (≥ 1.77) | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh` |
| Tauri CLI | (via npm) | wird automatisch installiert |

### Schritte

```bash
# 1. Repo klonen
git clone https://github.com/OWNER/Klarwert.git
cd Klarwert

# 2. Abhängigkeiten installieren
npm install

# 3. App im Entwicklungsmodus starten (Vite + Tauri)
npm run tauri dev
```

Die App öffnet sich als natives Fenster. Beim ersten Start wird die Datenbank automatisch angelegt und mit Beispiel-Daten befüllt.

### Lokale Datenbank zurücksetzen

Die SQLite-Datenbank liegt unter:
- **macOS**: `~/Library/Application Support/com.klarwert.app/klarwert.db`
- **Linux**: `~/.local/share/com.klarwert.app/klarwert.db`
- **Windows**: `%APPDATA%\com.klarwert.app\klarwert.db`

Zum Zurücksetzen einfach die `.db`-Datei löschen und die App neu starten. Alternativ: in der App unter Einstellungen → Daten → „Datenbank zurücksetzen".

### Tests ausführen

```bash
# 1. Unit-Tests (Vitest inkl. Integrationstests gegen node:sqlite)
npm test

# 2. Linter (ESLint)
npm run lint

# 3. TypeScript Type-Check
npx tsc --noEmit

# 4. Vollständiger Build (Tauri + React)
npm run build
```

---

## Ohne Programmierkenntnisse

- **Händler-Datenbank ergänzen** (welche Kategorie zu welchem Händler gehört, z. B. „REWE → Lebensmittel"): direkt in der App unter Kategorien → Händler-Datenbank → „Vorschläge teilen". Es werden dabei **niemals** Beträge, Daten oder Kontodaten geteilt – ausschließlich die Zuordnung Händler→Kategorie.
- **Fehler melden / Feature vorschlagen**: über [GitHub Issues](../../issues).
- **Übersetzungen/Formulierungen prüfen**: die App ist bewusst auf Deutsch; Hinweise zu unklaren Texten sind willkommen.

## Mit Programmierkenntnissen

1. Repo forken, Branch anlegen.
2. [`context/CLAUDE.md`](context/CLAUDE.md) lesen – enthält Tech-Stack, Projektstruktur, Konventionen und die verbindlichen Invarianten (z. B. Transaktions-Disziplin bei der Datenbank).
3. Für Produktentscheidungen ist [`context/klarwert-product-specification.md`](context/klarwert-product-specification.md) maßgeblich – bitte keine abweichenden UI-/Verhaltens-Entscheidungen ohne Rücksprache (Issue eröffnen).
4. Pull Request mit klarer Beschreibung, was geändert wurde und warum.
   Vor dem PR bitte sicherstellen, dass die gesamte Test-Pipeline durchläuft:
   `npm test`, `npm run lint`, `npx tsc --noEmit` und `npm run build`.

## Bekannte Einschränkungen (WIP Features)

Damit neue Contributor nicht überrascht werden – folgende Funktionen sind bewusst noch unvollständig:
- **Kirchensteuer:** Das Feld existiert im Profil, hat aber noch keine Wirkung auf die Berechnungen in den Rechnern.
- **Depot:** Kurskorrekturen haben aktuell noch keinen Audit-Trail (`history_log`/`operations`).
- **Bank-Profile:** Die Community-Datenbank (Klarwert-Community-Rules) stellt formatierte Bank-Profile zur Verfügung. Die App lädt diese aktuell noch nicht automatisch herunter (nur Händler-Updates sind live), dies ist für einen künftigen Meilenstein geplant.

## Drei-Repo-Struktur

Klarwert besteht aus drei GitHub-Repositories:
1. **[Klarwert](https://github.com/Klarwert/Klarwert)**: Die Tauri-App selbst (dieses Repo).
2. **[Klarwert-Community-Rules](https://github.com/Klarwert/Klarwert-Community-Rules)**: Die separat versionierte Community-Datenbank für Händler-Zuordnungen und Bankprofile.
3. **[klarwert.github.io](https://github.com/Klarwert/klarwert.github.io)**: Die Website / Landingpage.

Prioritäten für künftige KI-Coding-Sitzungen sind in [`NEXT_STEPS.md`](NEXT_STEPS.md) gepflegt.

## Neue Bankformat-Parser beitragen

Ein neues Bankformat wird als eigenes Parser-Modul beigetragen (kein Laufzeit-Plugin-System – siehe [`context/CLAUDE.md`](context/CLAUDE.md), Abschnitt „Bewusst nicht geplant"). Orientiere dich an den bestehenden Profilen in [`context/klarwert-seed-data.md`](context/klarwert-seed-data.md), Abschnitt 5.

## Guter erster Beitrag (`good first issue`)

Kein Einstieg zu klein! Folgende Aufgaben sind bewusst als Einstiegspunkte ausgewählt und erfordern keine tiefe Kenntnis der gesamten Codebasis:

- **Händler-Alias ergänzen**: In [`src/db/repositories/merchants.ts`](src/db/repositories/merchants.ts) Funktion `seedDefaultMerchants()` – einen Händler hinzufügen oder einen bestehenden Alias verbessern. Kein Risiko, keine Datenbankänderung nötig.
- **Bankformat-Profil beitragen**: Ein Import-Profil für eine bisher nicht unterstützte deutsche Bank beisteuern (siehe `context/klarwert-seed-data.md`, Abschnitt 5 für das Format). Nur JSON-ähnliche Konfigurationsdaten.
- **Kategorien-Baum vervollständigen**: Fehlende Unterkategorien in `src/db/migrations/002_seed.sql` ergänzen (z. B. Sport → Fitness, Sport → Outdoor).
- **Dokumentation verbessern**: Unklare oder veraltete Stellen in `context/` melden oder per PR beheben.

Schau dir die offenen Issues mit dem Label `good first issue` an – dort sind konkrete Aufgaben beschrieben.

## Verhaltenskodex

Sei freundlich und konstruktiv. Klarwert ist ein Projekt, das mit echten, teils sensiblen Finanzdaten arbeitet – entsprechend sorgfältig sollten Beiträge sein, die diese Daten verarbeiten.
