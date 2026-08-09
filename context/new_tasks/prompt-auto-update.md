# Klarwert – Auto-Update-Funktion

War bereits als Backlog-Punkt ("Phase 5b") vorgemerkt, jetzt aktiv. Getrennt von Code-Signing (separates Thema, betrifft OS-Vertrauenswarnungen, nicht die Update-Prüfung selbst).

## Ansatz

Tauris offizielles Updater-Plugin (`@tauri-apps/plugin-updater` + `@tauri-apps/plugin-process` zum Neustarten nach Update) statt einer Eigenbau-Lösung – Industriestandard für Tauri-Apps, bereits auf Signaturprüfung ausgelegt.

## Aufgabe

- [ ] 1. **Schlüsselpaar erzeugen** (`tauri signer generate`), privaten Schlüssel als GitHub-Actions-Secret im App-Repo hinterlegen (niemals ins Repo committen), öffentlichen Schlüssel in `tauri.conf.json` (`plugin.updater.pubkey`) eintragen.
- [ ] 2. **Release-Workflow erweitern:** bei jedem Release zusätzlich zu den Installern eine signierte `latest.json` (Version, Veröffentlichungsdatum, Download-URLs je Plattform, Signatur) als Release-Asset erzeugen und hochladen – das ist der Endpunkt, den die App zur Update-Prüfung abfragt.
- [ ] 3. **In der App:** Einstellungen-Bereich "Nach Updates suchen" (manueller Button) + optionaler Toggle "Automatisch beim Start prüfen" (Default: aus, da lokale Datenanfrage an GitHub – Nutzer soll das bewusst aktivieren, passt zum Prinzip "nichts passiert ungefragt im Hintergrund"). Bei gefundenem Update: Versionsnummer + Release-Notes anzeigen, Download+Installation nach Bestätigung, App-Neustart über `plugin-process`.
- [ ] 4. Fehlerfall (kein Internet, GitHub nicht erreichbar): stiller, klar formulierter Hinweis, keine Fehlermeldung, die wie ein App-Fehler aussieht – Update-Prüfung ist ein optionaler Zusatzdienst, kein Kernfeature.

## Definition of Done

- [ ] Ein Test-Release mit künstlich niedrigerer Versionsnummer als die installierte Version zeigt korrekt "kein Update verfügbar".
- [ ] Signaturprüfung tatsächlich aktiv (nicht nur konfiguriert) – mit einer absichtlich falsch signierten Test-`latest.json` verifizieren, dass die App das Update ablehnt.
