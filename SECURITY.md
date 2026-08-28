# Sicherheitsrichtlinie

Klarwert verarbeitet echte, teils sensible Finanzdaten (Kontostände, Transaktionen, Verwendungszwecke). Sicherheitslücken bitte **nicht** als öffentliches GitHub Issue melden, sondern:

- Über GitHubs privaten Meldeweg ("Report a vulnerability" im "Security"-Tab des Repos), falls aktiviert, oder
- Per E-Mail an die im Repo hinterlegte Kontaktadresse (siehe Profil des Maintainers).

Bitte gib nach Möglichkeit an: betroffene Version, Reproduktionsschritte, potenzielle Auswirkung (z. B. Datenverlust, Datenleck, Datenkorruption).

## Umfang

Relevant sind insbesondere:
- Schwachstellen, die lokale Daten (die SQLite-Datenbank, Backups) für andere Prozesse/Nutzer auf demselben Gerät zugänglich machen könnten
- Schwachstellen in der Auto-Update-Funktion (sobald implementiert), die manipulierte Updates ermöglichen könnten
- Schwachstellen, durch die die Händler-Datenbank-Synchronisation (Community-Feature) mehr als reine Kategorie-Zuordnungen preisgibt

Nicht im Fokus: Die App hat keinen Server und keine Cloud-Komponente – klassische Server-seitige Angriffsvektoren (SQL-Injection gegen einen Server, Auth-Bypass o. ä.) entfallen konzeptionell.

## Reaktionszeit

Dies ist ein Open-Source-Projekt eines Einzelentwicklers, keine kommerzielle Garantie auf Reaktionszeiten – ernsthafte Meldungen werden aber priorisiert behandelt.

## Code-Signing & Update Verification

Klarwert nutzt den Tauri Updater. Um sicherzustellen, dass heruntergeladene Updates nicht manipuliert wurden, nutzt der Updater asymmetrische Signaturen (Ed25519).

### Maintainer-Hinweis zur Einrichtung:
Damit Updates signiert werden und der Updater funktioniert, müssen folgende Umgebungsvariablen in den GitHub Actions Secrets (`release.yml`) hinterlegt werden:
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (falls der Key passwortgeschützt ist)

Der dazugehörige **Public Key** muss in `src-tauri/tauri.conf.json` unter `plugins.updater.pubkey` hinterlegt werden.

### macOS & Windows Code-Signing (Gatekeeper / SmartScreen)
Die App-Binaries (DMG/AppImage/MSI) sind derzeit **nicht** über ein offizielles Entwicklerzertifikat (z. B. Apple Developer Program oder Windows Authenticode) signiert. Daher zeigen Betriebssysteme beim ersten Start Warnungen an ("Nicht verifizierter Entwickler"). Die Integrität der nachfolgenden In-App-Updates wird jedoch durch den oben erwähnten Tauri Updater Key (Ed25519) sichergestellt.

## Bekannte (akzeptierte) Audit-Warnungen

- **ECharts XSS-Advisory (GHSA-fgmj-fm8m-jvvx)**: `echarts < 6.1.0` weist eine XSS-Lücke auf, falls von Nutzern generierte, unsichere Labels als HTML gerendert werden. In Klarwert werden keine Nutzerdaten als HTML-Labels verarbeitet; alle Labels sind fix in der UI kodiert oder auf sichere Text-Darstellung (Zahlen, Währungen) limitiert. Das Risiko wird daher als "Niedrig" eingestuft. Ein Update erfolgt, sobald eine entsprechend stabile Version ohne Breaking Changes verfügbar ist.
