-- migration 025 – Architektur-Finalisierung Phase A
-- Alle Änderungen additiv mit Defaults, damit bestehende Daten unverändert bleiben.

-- ============================================================
-- 1.1: Währung pro Konto und Transaktion
-- ============================================================
ALTER TABLE assets ADD COLUMN currency text NOT NULL DEFAULT 'EUR';
ALTER TABLE transactions ADD COLUMN currency text NOT NULL DEFAULT 'EUR';

-- ============================================================
-- 1.2: Länderkennzeichnung für Händler und Import-Profile
-- ============================================================
ALTER TABLE merchants ADD COLUMN country text NOT NULL DEFAULT 'DE';
ALTER TABLE import_profiles ADD COLUMN country text NOT NULL DEFAULT 'DE';

-- Einstellung 'country' wird über das Settings-System gespeichert (kein DDL nötig)

-- ============================================================
-- 1.3: Kontoidentifikator generalisieren (IBAN-Annahme auflösen)
-- Vorher: assets.iban (text)
-- Nachher: assets.account_identifier + assets.account_identifier_type
-- Bestehende IBAN-Werte werden per INSERT INTO...SELECT übernommen
-- (SQLite erlaubt kein ALTER COLUMN RENAME/MODIFY)
-- ============================================================

-- Neue Spalten hinzufügen
ALTER TABLE assets ADD COLUMN account_identifier text;
ALTER TABLE assets ADD COLUMN account_identifier_type text
  NOT NULL DEFAULT 'iban'
  CHECK (account_identifier_type IN ('iban', 'us_routing_account', 'other'));

-- Bestehende IBAN-Werte übernehmen
UPDATE assets SET
  account_identifier = iban,
  account_identifier_type = 'iban'
WHERE iban IS NOT NULL;

-- Hinweis: assets.iban bleibt als Kompatibilitätsspalte für alte App-Versionen bestehen.
-- Sie wird vom Code ab dieser Version nicht mehr geschrieben (nur noch account_identifier).
-- Die Spalte wird in einer späteren Migration entfernt, sobald keine alten Versionen mehr
-- in Umlauf sind.

-- merchant_aliases: match_type 'iban' → 'account_identifier' (Alias-Bezeichnung generalisieren)
-- Alle bestehenden 'iban'-Match-Typen bleiben inhaltlich gültig, erhalten nur neutralen Namen.
-- Hinweis: merchant_aliases.match_type wurde in Migration 011 als TEXT ohne CHECK angelegt –
-- die Umbenennung ist ein einfaches UPDATE.
UPDATE merchant_aliases SET match_type = 'account_identifier' WHERE match_type = 'iban';
