# Klarwert – Session-Plan, Runde 3

Reihenfolge einzeln abarbeiten, nach jedem Prompt committen, kurz die jeweilige Definition of Done prüfen, dann ohne auf Rückmeldung zu warten weitermachen. Nur anhalten, wenn eine Definition-of-Done-Prüfung tatsächlich fehlschlägt.

## Was aus Runde 2 bereits erledigt ist (zur Einordnung, nicht erneut abarbeiten)

Sechs App-Bugs, Test-Infrastruktur (51 Tests), Rechner-Achsenbeschriftung, Mehrkonto-Import, Vermögen-Saldo-Korrektur, Vertrags-Speichern-Hänger, Aufräum-Modus-Fehler, Bank-Vorlagen-Verwaltung (Basis), dynamische Spaltenauswahl, Erkennungs-Checkliste im Import, gestufte Änderungserkennung. Bewusst ausgelassen und noch offen: DB-Integrationstests mit echten Fixtures (Golden-CSV, Idempotenz) – hätten Mocking der Tauri-SQL-Schicht gebraucht, siehe Punkt 2 unten.

## Reihenfolge – App-Repo (`Klarwert/Klarwert`)

| # | Prompt | Warum an dieser Stelle |
|---|---|---|
| 1 | `prompt-app-bugfixes-2.md` | Enthält den `rules_rebuild_old`-Migrationsfehler – muss vor Punkt 3 behoben sein, da dieser Auftrag `rules` erneut anfasst. Restliche Punkte (Transfer-Darstellung, Sankey, Toasts, Kategoriefarben) sind unabhängig, aber klein genug, um zuerst abzuräumen. |
| 2 | Offene DB-Integrationstests nachholen | Aus Runde 2 bewusst ausgelassen (Tauri-SQL-Mocking). Falls im aktuellen Environment weiterhin nicht lösbar: klar im Abschlussbericht vermerken statt stillschweigend zu überspringen, und eine In-Memory-SQLite-Alternative (ohne Tauri-Bindung, nur für Testzwecke) als Zwischenlösung prüfen. |
| 3 | `prompt-haendler-regel-vereinigung.md` | Größter Einzelauftrag – Regel-Vorlagen und Händler zusammenführen, siehe `klarwert-haendler-regel-konzept-v2.md`. Braucht eine funktionierende `rules`-Tabelle aus Punkt 1. |
| 4 | `prompt-regelbuilder-erweiterung.md` | Baut auf der vereinheitlichten Regel-Struktur aus Punkt 3 auf (Felder, Operatoren, UND/ODER, Werte-Picker). |
| 5 | `prompt-auto-update.md` | Unabhängig von 1–4, kann auch vorgezogen werden, wenn die Reihenfolge aus Kapazitätsgründen angepasst werden muss. |

## Reihenfolge – Website-Repo (`Klarwert/klarwert.github.io`)

Keine neuen Website-Punkte in dieser Runde (auf Nutzerwunsch ausgeklammert) – `prompt-website-redesign.md` (v6) bleibt der aktuelle Stand, falls noch nicht vollständig umgesetzt.

## Paralleler Track (anderes Tool, nicht Claude Code)

`prompt-community-datenbanken.md` (Google Antigravity) – nach Abschluss von Punkt 3 oben (Händler/Regel-Vereinigung) ist der Konzeptbezug dort veraltet ("Regel-Vorlage teilen" = "Händler teilen", siehe `klarwert-haendler-regel-konzept-v2.md` Abschnitt 4). Vor dem nächsten Antigravity-Lauf kurz gegenlesen, ob eine Aktualisierung nötig ist.

## Für den "context"-Ordner – was rein soll, was raus kann

**Stabile Referenz (bleibt dauerhaft liegen):** `CLAUDE.md`, `klarwert-schema.sql`, `klarwert-domain-model.md`, `klarwert-product-specification.md`, `klarwert-component-library.md`, `klarwert-backlog-roadmap.md`.

**`new_tasks`-Unterordner, für diese Runde:** `klarwert-roadmap-claude-code.md` (diese Datei, zuerst lesen), `prompt-app-bugfixes-2.md`, `klarwert-haendler-regel-konzept-v2.md`, `prompt-haendler-regel-vereinigung.md`, `prompt-regelbuilder-erweiterung.md`, `prompt-auto-update.md`.

**Aus `new_tasks` entfernen, weil erledigt (wichtig – ein wachsender Ordner mit längst erledigten Prompts kostet nur Kontext/Tokens und kann veraltete Anweisungen erneut auslösen):** `prompt-app-bugfixes.md`, `prompt-rechner-achsen-fix.md`, `prompt-mehrkonto-import.md`, `prompt-transfer-sparen-erkennung.md`, `prompt-import-architektur-v2.md`, `prompt-unit-tests.md`. Falls du eine Historie behalten willst: eigener Unterordner `new_tasks/erledigt/`, nicht im aktiven Kontext.

**Nicht in den App-Kontext (gehören ins Website-Repo, falls dort ein eigener Context-Ordner existiert):** `prompt-website-redesign.md`, `klarwert-website-content.md`, `klarwert-component-library.md` nur als Farbreferenz relevant, sonst App-spezifisch.

## Abschluss, wenn alle Punkte durch sind

- [ ] Manueller Durchklick durch die App, insbesondere die neuen/geänderten Bereiche (Händler-Verwaltung, Regel-Builder, Auto-Update-Prüfung) – nicht nur Tests grün.
- [ ] Abschlussbericht: für jeden der fünf App-Prompts eine Zeile zur Definition of Done, bei Abweichungen kurz warum.
