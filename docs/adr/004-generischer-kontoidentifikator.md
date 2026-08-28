# ADR-004: Generischer Kontoidentifikator statt IBAN

**Status:** Akzeptiert  
**Datum:** 2026-08-20

## Kontext

Die Transfer- und Eigenkonto-Erkennung stützt sich auf IBAN. In den USA existiert keine IBAN (dort: Routing Number + Account Number), ebenso in weiteren Ländern (Kanada, Australien, …). Mit einem IBAN-Pflichtfeld fällt der beste Erkennungsmechanismus für diese Märkte komplett aus.

## Entscheidung

`assets.iban` wird **generalisiert** zu:
- `assets.account_identifier TEXT` – der eigentliche Identifikator-Wert
- `assets.account_identifier_type TEXT CHECK IN ('iban', 'us_routing_account', 'other')` – der Typ

Migration 025 übernimmt bestehende IBAN-Werte nach `account_identifier` mit Typ `'iban'`. Die alte `iban`-Spalte bleibt als Kompatibilitätsspalte bestehen, wird aber vom Code nicht mehr beschrieben.

Die **Vergleichslogik** normalisiert formatunabhängig (Leerzeichen entfernen, Großschreibung) und arbeitet damit für alle Identifikatortypen gleich.

`merchant_aliases.match_type = 'iban'` → `'account_identifier'` (Bezeichnung länderneutral, Wert unverändert).

## Konsequenzen

- US-Nutzer können eigene Konten über ihre Routing+Account-Nummer erkennen lassen.
- Bestehende DE-Nutzer merken nichts: IBAN-Werte werden lautlos migriert.
- Code muss konsequent `account_identifier` lesen (nicht `iban`); `iban` nur noch für Rückwärtskompatibilität bei Queries, die vor Migration 025 angelegte Daten berücksichtigen müssen.
