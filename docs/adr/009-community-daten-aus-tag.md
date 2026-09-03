# ADR-009: Community-Daten aus getaggtem Release, nicht aus `main`

**Status:** Akzeptiert
**Datum:** 2026-09-04

## Kontext

Die App lädt Händler-Kategorien (`dist/haendler.json`) und Bankprofile (`dist/bankprofile.json`) aus
dem separaten `Klarwert-Community-Rules`-Repository über `raw.githubusercontent.com` (siehe
`src/features/kategorien/components/MerchantUpdateCheckDialog.tsx` und
`src/features/profil/components/CommunityUpdateChecker.tsx`). Bisher zeigten beide URLs auf den
`main`-Branch.

Ein fehlerhafter Merge in `Klarwert-Community-Rules` (z. B. ein kaputtes JSON, ein versehentlich
gelöschter Händler, eine ungültige Regex trotz `validate.mjs`) würde damit **sofort** und **für
alle Nutzer gleichzeitig** ausgeliefert – es gibt keinen Rückfallpunkt, und ein Rollback bedeutet
`git revert` + neuen Build, während der fehlerhafte Stand bereits produktiv ist.

## Entscheidung

Die App lädt Community-Daten ab sofort aus einem **getaggten Release** des
`Klarwert-Community-Rules`-Repos, niemals aus `main`:

```
https://raw.githubusercontent.com/Klarwert/Klarwert-Community-Rules/<TAG>/dist/haendler.json
https://raw.githubusercontent.com/Klarwert/Klarwert-Community-Rules/<TAG>/dist/bankprofile.json
```

`main` bleibt der Ort, an dem Beiträge landen und validiert werden (CI: `validate.mjs` + Tests bei
jedem PR, `publish-dist` aktualisiert `dist/` bei jedem Merge). Ein Tag wird erst gesetzt, wenn der
Stand auf `main` als veröffentlichungswürdig gilt – das ist der Rückfallpunkt: ein fehlerhafter
Merge auf `main` erreicht keinen Nutzer, bis jemand bewusst einen neuen Tag setzt.

Tag-Format: `vJJJJ-MM-TT` (z. B. `v2026-09-04`), analog zu Klarwerts eigenem `vX.Y.Z`-Schema, aber
datumsbasiert, weil die Community-Daten kein Semver-Konzept haben (kein Breaking-Change-Begriff für
eine reine Datendatei) – ein Datum beantwortet direkt "wie aktuell ist mein Stand", was für ein sich
laufend erweiterndes Datenkorpus die relevantere Frage ist.

## Prozess für einen neuen Community-Rules-Tag

1. Beiträge werden wie bisher per PR gegen `main` gemerged (CI validiert automatisch).
2. Wenn der Stand auf `main` freigegeben werden soll:
   ```bash
   git tag v2026-09-04
   git push origin v2026-09-04
   ```
3. In der App die beiden `raw.githubusercontent.com`-URLs (s. o.) auf den neuen Tag umstellen und
   committen.

Schritt 2 und 3 sind bewusst manuell (kein automatischer "letzter Tag gewinnt"-Mechanismus): genau
das ist der Rückfallpunkt – niemand außer einem expliziten App-Commit entscheidet, welcher Stand
tatsächlich ausgeliefert wird.

## Konsequenzen

- Ein fehlerhafter Community-Rules-Merge betrifft niemanden, bis der nächste Tag gezogen und die App
  entsprechend aktualisiert wird.
- Ein Rollback bedeutet: App-seitig auf den vorherigen Tag zurückstellen (ein Einzeiler-Commit),
  nicht "im Community-Rules-Repo etwas rückgängig machen und hoffen, dass CI/CD schnell genug ist".
- Nutzer sehen neue Community-Daten nicht sofort nach einem Merge, sondern erst nach dem nächsten
  Tag-Zyklus - ein bewusster Kompromiss zwischen "immer aktuell" und "nie kaputt".
- Die beiden Fetch-URLs müssen bei jedem neuen Tag an zwei Stellen synchron aktualisiert werden
  (`MerchantUpdateCheckDialog.tsx`, `CommunityUpdateChecker.tsx`) - ein Refactoring auf eine
  gemeinsame Konstante (analog `APP_REPO` in der Website) ist ein sinnvoller kleiner Folge-Schritt.
