# Klarwert – Session-Plan für einen zusammenhängenden Claude-Code-Durchlauf

Diese Datei zuerst lesen, dann die Prompts in dieser Reihenfolge einzeln abarbeiten. Nach jedem Prompt: committen, kurz die jeweilige "Definition of Done" durchgehen, dann **ohne auf Rückmeldung zu warten** mit dem nächsten Prompt fortfahren – Ziel ist ein einzelner, durchgehender Arbeitstag. Nur anhalten, wenn eine Definition-of-Done-Prüfung tatsächlich fehlschlägt und sich nicht im Rahmen der jeweiligen Leitplanken selbst lösen lässt; das dann im Abschlussbericht klar benennen, nicht stillschweigend übergehen.

Zwei Repos, zwei Arbeitsverzeichnisse:
- **App:** `https://github.com/Klarwert/Klarwert`
- **Website:** `https://github.com/Klarwert/klarwert.github.io`

## Kurz zur Architektur, bevor es losgeht

Kritische Durchsicht des bestehenden Schemas ergab: die Grundarchitektur (SQLite, deterministische Kategorisierungs-Pipeline, `template_key`-Slugs für idempotentes Reseeding, `external_id`/`fingerprint` für Duplikat-Erkennung, RAW-Sperre für importierte Kernfelder) ist bereits solide und muss **nicht** neu entworfen werden. Die zuletzt gemeldeten Probleme sind fast ausschließlich Lücken in der UI-Schicht bzw. fehlende Verdrahtung zwischen UI und bereits vorhandener Logik – nicht strukturelle Mängel. Die einzige echte Lücke: **automatisierte Tests**, die genau diese Klasse von "UI fertig, Verdrahtung fehlt"-Bug bisher nicht gefangen hat. Details in `klarwert-import-architektur-v2.md`.

## Reihenfolge – App-Repo (`Klarwert/Klarwert`)

| # | Prompt | Warum an dieser Stelle |
|---|---|---|
| 1 | `prompt-app-bugfixes.md` | Sechs gemeldete, echte Bugs – blockieren die tägliche Nutzung, gehen vor jedem weiteren Punkt. |
| 2 | `prompt-unit-tests.md` | Test-Infrastruktur + Tests für den bereits bestehenden, jetzt frisch bugfixten Stand – schützt alle folgenden, invasiveren Änderungen vor Regressionen. Ab hier gilt: jeder folgende Prompt liefert seine Tests im selben Schritt mit, siehe `prompt-unit-tests.md`, letzter Abschnitt. |
| 3 | `prompt-rechner-achsen-fix.md` | Kleiner, isolierter Bugfix ohne Abhängigkeiten. |
| 4 | `prompt-mehrkonto-import.md` | Liefert mit dem C24-Import drei echte, verlinkte eigene Konten – der beste verfügbare Realtest für die IBAN-Erkennung in Punkt 5. |
| 5 | `prompt-transfer-sparen-erkennung.md` | Baut auf Punkt 4 auf. Die Bugs aus Punkt 1.4 sind zu diesem Zeitpunkt bereits behoben. |
| 6 | `prompt-import-architektur-v2.md` | Baut auf dem minimalen Fix aus Punkt 1.5 auf: Importprofil-Bearbeitung, Custom-Spalten, gestufte Änderungserkennung. |

## Reihenfolge – Website-Repo (`Klarwert/klarwert.github.io`)

| # | Prompt | Hinweis |
|---|---|---|
| 7 | `prompt-website-redesign.md` (v6) | Falls noch nicht abgeschlossen: visuelle Basis (Design-System, Glass Cards, Hero, rotierendes Beispiel als CSS-Keyframes). |
| 8 | `prompt-website-content-v2.md` | Baut darauf auf: drei verifizierte Bugs (GitHub-Stats nur auf `/download` korrekt, veraltete Repo-Links, doppelter Inhalt zwischen `/download` und den OS-Einzelseiten), plus Content-/Positionierungs-Überarbeitung (Subhead, "Daten bleiben bei dir", Feature-Gruppierung, Für-wen, FAQ, neue Datenschutz-Seite). |

## Paralleler Track (anderes Tool, nicht Claude Code)

`prompt-community-datenbanken.md` (Community-Händler-DB + Bank-Format-Templates, an Google Antigravity vergeben) ändert `src/lib/pipeline.ts` an anderer Stelle als Punkt 5 oben (Stufen 5+6 statt Stufe 2). **Nicht gleichzeitig auf demselben `main`-Stand laufen lassen** – einen Branch fertigstellen und mergen, bevor der andere startet, sonst unnötiges Konfliktrisiko in derselben Datei. Reihenfolge-Empfehlung: Antigravity-Branch vor Punkt 1 oder nach Punkt 6 mergen, nicht mittendrin.

## Abschluss, wenn alle Punkte durch sind

- [ ] Vollständiger manueller Durchklick durch die App (Import, Kategorisierung, Verträge, Sparen, Rechner) – nicht nur `npm test` grün, sondern auch einmal wie ein echter Nutzer durchklicken.
- [ ] Website live auf `https://klarwert.github.io/` prüfen (nicht nur `localhost`) – insbesondere das rotierende Beispiel einen vollen Zyklus lang beobachten.
- [ ] Falls noch nicht vorhanden: erstes GitHub Release im App-Repo mit den drei Installern als Assets, damit die Download-Buttons auf der Website echte Dateien finden.
- [ ] Abschlussbericht: für jeden der sieben Prompts eine Zeile, ob die jeweilige Definition of Done erfüllt wurde – bei Abweichungen kurz warum.

## Status Backlog-Reprioritisierung (Referenz, Details in `klarwert-backlog-roadmap.md`)

- **Ins Backlog verschoben:** Demo-Modus, Mehrsprachigkeit (Vorbereitung/Scaffolding weiterhin erlaubt), Bank-APIs.
- **Ganz depriorisiert:** Mobile-Layout, PDF-Exporte, CAMT.053/054-Import, Split-Transaktionen-UI, Theme.
