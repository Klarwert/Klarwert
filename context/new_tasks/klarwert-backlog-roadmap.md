# Klarwert – Backlog & Roadmap

Zusammengetragen aus der gesamten Projekt-Historie. Ergänzt (nicht ersetzt) den Phasenplan in `CLAUDE.md`.

## Priorität jetzt – siehe `klarwert-roadmap-claude-code.md` für den vollständigen Session-Plan (Runde 3)

Runde 1+2 (Bugfixes, Tests, Rechner, Mehrkonto-Import, Transfer-Erkennung, Import-Architektur v2) sind laut Claude-Code-Bericht erledigt. Runde 3, für Claude Code in dieser Reihenfolge (App-Repo `Klarwert/Klarwert`):

1. **`prompt-app-bugfixes-2.md`** – u. a. `rules_rebuild_old`-Migrationsfehler, Transfer-Darstellung vereinfachen, Sankey-Vollbild/Export, Kategoriefarben.
2. Offene DB-Integrationstests nachholen (aus Runde 2 ausgelassen).
3. **`prompt-haendler-regel-vereinigung.md`** – Regel-Vorlagen und Händler zusammenführen, siehe `klarwert-haendler-regel-konzept-v2.md`.
4. **`prompt-regelbuilder-erweiterung.md`** – alle Felder inkl. Custom-Spalten, Operatoren, UND/ODER, Werte-Picker.
5. **`prompt-auto-update.md`** – Tauri-Auto-Updater.

Website-Repo (`Klarwert/klarwert.github.io`): keine neuen Punkte in dieser Runde.

## Stand: bereits erledigt / gebaut

Phase 1 (Fundament), Phase 2 (Ordnung), zwei Bugfix-Runden, Rechner (FIRE/Zinseszins/Entnahmeplan – Achsenbeschriftung noch offen, siehe oben). **Korrektur:** Die Händler-DB-Pipelinestufe (Ebene A) ist entgegen einer früheren Notiz hier **noch nicht** im Code umgesetzt (nur Vertrag/Transfer/Regeln existieren aktuell in `pipeline.ts`) – Fertigstellung läuft über `prompt-community-datenbanken.md` (Antigravity-Track).

## Bereits geplant: Phase 3 (läuft jetzt)

Siehe `prompt-phase-3.md`: Übersicht/Dashboard, Budgets, Steuer-Seite, Benachrichtigungs-Logik, Änderungsverlauf/Undo-System – plus Teil A (Händler-DB-Abschluss, Template-Kategorien-Bugfix, `contracts_old`-Fix, Kontostand-Parser-Fix, Sammlungen-Zuordnung).

## Bereits geplant: Phase 4 (aus CLAUDE.md-Phasenplan)

- Backup/Export (JSON mit Schema-Version) + CSV-Export
- Auto-Backup (Rotation, vor Migrationen)
- Profil-Feinschliff
- Packaging Windows + macOS (Tauri, Icon-Generierung, SmartScreen-/Gatekeeper-Hinweise)

## Phase 5 – Website & GitHub-Launch (jetzt konkret, nicht mehr nur Idee)

Ausgelöst durch den Wunsch, das Projekt öffentlich auf GitHub zu teilen. Umsetzung liegt jetzt als eigener Prompt vor: **`prompt-phase-5-launch.md`**. Bereits fertig mitgeliefert (nur noch zu platzieren/verwenden, nicht mehr zu konzipieren):

- `LICENSE` (MIT), `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `.gitignore`
- `.github/workflows/deploy-website.yml` (GitHub Actions: baut die Astro-Website und deployt automatisch nach GitHub Pages bei jedem Push)
- `.github/ISSUE_TEMPLATE/bug_report.md` + `feature_request.md`
- `klarwert-website-content.md` (kompletter Text für Startseite + Windows-/macOS-/Linux-Unterseiten, inkl. OS-Erkennung für hervorgehobenen Download-Button, Feedback-Links im Footer)

**Wichtige Einschränkung, die im Prompt explizit steht:** Der eigentliche `git push` zu GitHub kann nicht von einer KI ausgeführt werden (braucht deine Zugangsdaten) – das ist der einzige manuelle Schritt, alles andere (Repo-Struktur, Astro-Website bauen, Commits) läuft autonom. Fertige Copy-Paste-Befehle dafür liegen im Prompt (Schritt 12).

**Noch offen, danach:** Code-Signing (Windows-Zertifikat/Apple-Developer-Account), Auto-Updater-Integration mit dem Release-Mechanismus, Community-Konsens-Pipeline für die Händler-Datenbank (GitHub Action, Regression-Set) – siehe unten, weiterhin Backlog.

## Phase 5b – weiteres Wachstum (nach dem Launch, noch nicht spezifiziert)

- **Auto-Updater** (`@tauri-apps/plugin-updater`): signierte Releases, Manifest-Check beim Start, kein Tracking. Voraussetzung: Code-Signing (siehe unten). Baut auf dem Release-Mechanismus auf, der in Phase 5 (Punkt 12 im Prompt) erstmals genutzt wird.
- **Linux-Build als `.deb`** zusätzlich zum AppImage (AppImage allein reicht fürs Erstrelease).
- **Community-Konsens-Infrastruktur für die Händler-Datenbank** (siehe `klarwert-community-haendler-db.md`, Abschnitt 7): GitHub-Action-Pipeline, die eingehende Vorschläge zählt und ab 3 unabhängigen Zustimmungen automatisch einen PR erzeugt; Regression-Set (50–100 anonymisierte Test-Transaktionen); optional ein Web-Formular (Tally o. ä.) als Alternative zum GitHub-Issue.
- **Code-Signing** – Windows-Zertifikat (~100–400 €/Jahr) und/oder Apple-Developer-Account (99 $/Jahr) – erst wenn tatsächlich mehrere fremde Nutzer installieren, nicht vorab.
- **Screenshots auf der Website ergänzen**, sobald die App einen vorzeigbaren Stand hat (bewusst als Platzhalter in `klarwert-website-content.md` markiert).

Echte, noch unspezifizierte Produktideen, die im Verlauf aufkamen, aber absichtlich zurückgestellt wurden:

| Feature | Kontext / warum zurückgestellt |
|---|---|
| **Wertpapiere-Modul** (Depot-Detailsicht: Positionen, Kurse, Performance) | Depot verhält sich bis dahin wie ein normales Konto (Klick → Transaktionen). Braucht eigene Datenmodellierung (Positionen, Stückzahlen, Kurshistorie). |
| **ETF-/Aktienkurse automatisch abrufen** (Yahoo Finance/Stooq, Tagesdaten) | Voraussetzung für ein sinnvolles Wertpapiere-Modul; ohne Kurse wäre die Positionsanzeige unvollständig. |
| **"Ziele"-Übersichtsseite** (aggregiert Sammlungs-/Budget-/Nettovermögens-Ziele) | Bewusst zurückgestellt, bis der Rechner tatsächlich gebaut ist – Rechner ist jetzt fertig, diese Seite kann also nachrücken. |
| **Crash-/DB-Reparatur-Pfad** | Erkennung "Datenbank scheint beschädigt" beim Start → Angebot, das letzte Auto-Backup wiederherzustellen. Baut auf dem Auto-Backup-Mechanismus aus Phase 4 auf. |
| **Konfigurierbare Backup-Häufigkeit** | Aktuell fix "bei jedem Beenden, Rotation 10". Vorgeschlagen, nicht bestätigt. |
| **Konfigurierbare Benachrichtigungs-Kanäle** | Aktuell nur In-App-Glocke. Vorgeschlagen, nicht bestätigt (z. B. System-Benachrichtigungen zusätzlich). |
| **Minimale Tests für reine Funktionen** (`money.ts`, `rechner/*`, `import/*`, Pipeline-Logik) | Empfehlung aus der Roadmap-Diskussion, keine eigene Phase – sollte laufend mitgezogen werden, sobald die jeweilige Funktion steht. |
| **Optionale lokale KI/LLM als Kategorisierungs-Fallback** | Explizit in der Pipeline-Architektur vorgesehene Einordnung (zwischen Ähnlichkeits-Fallback und Unkategorisiert), aber bewusst nicht in Phase 3 gebaut – "nie als Ersatz für die deterministische Kaskade, sonst wird die Zuordnung nicht mehr nachvollziehbar". |

Community-Bankformat-Templates sind nicht mehr Teil dieser Tabelle – konzeptioniert in `klarwert-community-bankformat-templates.md`, in Umsetzung über `prompt-community-datenbanken.md` (Antigravity-Track).

## Backlog (zurückgestellt, aber nicht verworfen – Positionswechsel gegenüber früherer Fassung)

- **Demo-Modus** (separate DB, Banner, Reset) – aus Phase 4 hierher verschoben, tritt hinter die drei Prioritäten oben zurück.
- **Mehrsprachigkeit über Deutsch hinaus** – Produktentscheidung bleibt "Deutschland-Fokus", aber die Vorbereitung (i18n-Scaffolding, Sprache-Select als funktionierendes Platzhalter-Element) darf schon jetzt mitgezogen werden, wenn ohnehin an der betroffenen Stelle gearbeitet wird.
- **Bank-APIs (PSD2/FinTS)** – frühere Einordnung war "bewusst nicht geplant"; jetzt bewusst wieder geöffnet als Backlog-Position, kein aktiver Auftrag.

## Ganz depriorisiert (für absehbare Zukunft zurückgestellt)

- **Mobile-Layout** – Desktop-only per Produktentscheidung.
- **PDF-Exporte** – CSV reicht für den Zweck (Steuerberater/Excel-Weiterverarbeitung).
- **CAMT.053/054-Import** (ISO-20022-XML) – eigener XML-Parser nötig, aktuell deckt CSV/Excel die relevanten deutschen Banken ab.
- **Split-Transaktionen-UI** – Datenmodell (`transaction_splits`) existiert bereits als Erweiterungspunkt, UI bewusst nicht in v1.
- **Theme (Hell/Dunkel/System)** – ⚠️ tauchte in der letzten Anweisung sowohl bei "Backlog" als auch bei "ganz depriorisieren" auf; hier als ganz depriorisiert eingeordnet (spezifischere/spätere Nennung), bitte kurz bestätigen oder korrigieren.

## Bewusst nicht geplant (aktive, architekturelle Entscheidungen, unverändert)

- **Laufzeit-Plugin-System für Import-Parser oder Kategorisierungslogik** – Sicherheitsrisiko bei einer Finanz-App mit echten Kontodaten. Erweiterung ausschließlich über Pull Requests in den Quellcode bzw. über die daten-only Community-Modelle (Händler-DB, Bankformat-Templates).
- **Generisches Flag-System** statt der drei einzelnen Transaktions-Booleans (Transfer/Ungeprüft/Aus Statistik entfernt) – Überengineering für drei Fälle, bei einem vierten ähnlichen Flag neu bewerten.
- **Editierbarkeit von Empfänger/Verwendungszweck/Betrag/Datum importierter Transaktionen** – bewusst gesperrt, schützt die Saldo-Prüfung vor Inkonsistenz.

## Offene Rückfragen an den Nutzer (aus der Historie, noch unbeantwortet)

- Theme: siehe ⚠️-Hinweis oben – Backlog oder ganz depriorisiert?
- Konfigurierbare Backup-Häufigkeit gewünscht oder reicht der feste Rhythmus?
- Konfigurierbare Benachrichtigungs-Kanäle gewünscht?
