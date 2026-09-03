-- 034_depot_prices_source.sql
-- Fügt depot_prices.source hinzu: 'manual' (Nutzer-Eingabe) vs. 'auto' (Provider-Fetch).
-- Bestehende Einträge bekommen 'manual' als Fallback – konservativ, da der Ursprung unbekannt ist.

alter table depot_prices add column source text not null default 'manual';
