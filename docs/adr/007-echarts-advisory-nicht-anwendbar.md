# ADR-007: ECharts Advisory GHSA-pj4x-2xr3-cq3v – nicht anwendbar

**Datum:** 2026-09-03  
**Status:** Entschieden

## Kontext

npm audit meldet das Advisory GHSA-pj4x-2xr3-cq3v für Apache ECharts < 6.1.0: ein potenzieller XSS-Vektor in der **Lines-Series** (`type: 'lines'`), wenn `series.data[i].name` HTML enthält und kein eigener `tooltip.formatter` gesetzt ist.

## Analyse

```
grep -rn "'lines'\|\"lines\"" src/
```

→ **Kein Treffer.** Klarwert verwendet Sankey, Donut, Balken und normale Liniendiagramme (`type: 'line'`), aber **nicht** die Geo-/Routen-Series (`type: 'lines'`). Der Angriffspfad existiert nicht.

## Entscheidung

Kein sofortiger Major-Bump auf ECharts 6.x notwendig. Das Upgrade kann in Ruhe erfolgen, wenn es aus anderen Gründen sinnvoll ist.

Das Advisory wird in `.nsprc` / `npm audit` als nicht anwendbar markiert, damit es echte Funde nicht überdeckt.

## Konsequenzen

- `package.json` enthält einen `"overrides"`-Eintrag **nicht** (würde die Versionsbeschränkung umgehen und Nebeneffekte haben).
- Stattdessen: `auditConfig.ignorePaths` in `.nsprc` oder `audit-exceptions` nutzen.
- Bei Hinzufügen einer Lines-Series in Zukunft: Advisory erneut prüfen und ggf. einen `tooltip.formatter` mit HTML-Escaping setzen.
