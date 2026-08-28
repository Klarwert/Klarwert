-- 024_pipeline_finalisierung.sql

-- A2: Add 'suggested_ended' to contracts status CHECK constraint
-- (table rebuild wegen SQLite-Einschränkung: CHECK-Constraints können nicht nachträglich geändert werden)

CREATE TABLE contracts_new (
  id integer primary key
, name text not null
, current_amount_cents integer not null
, previous_amount_cents integer -- gesetzt bei preisaenderung
, amount_tolerance_percent real not null default 5 -- betragstoleranz; strom/gas ~10-15 %, feste abos 0
, interval text not null check (interval in ('monthly', 'quarterly', 'yearly', 'irregular'))
, status text not null check (status in ('detected', 'confirmed', 'price_changed', 'paused', 'ended', 'suggested_ended'))
, category_id integer references categories(id) on delete set null
, merchant_id integer references merchants(id) on delete set null -- optionaler haendler-anker
, detection_method text -- null bei manueller anlage
, is_manual integer not null default 0 -- 1 = komplett manuell angelegt statt automatisch erkannt
, confidence real -- 0-1, aus wiederholungsanzahl + betragsvarianz + intervall-regelmaessigkeit
, detected_at text not null default (datetime('now'))
, is_dismissed integer not null default 0 -- getrennt: muster wird nicht erneut vorgeschlagen
, is_deleted integer not null default 0
);

INSERT INTO contracts_new (id, name, current_amount_cents, previous_amount_cents, amount_tolerance_percent, interval, status, category_id, merchant_id, detection_method, is_manual, confidence, detected_at, is_dismissed, is_deleted)
SELECT id, name, current_amount_cents, previous_amount_cents, amount_tolerance_percent, interval, status, category_id, merchant_id, detection_method, is_manual, confidence, detected_at, is_dismissed, is_deleted
FROM contracts;

DROP TABLE contracts;
ALTER TABLE contracts_new RENAME TO contracts;

-- B1: Add match_field to merchant_aliases
ALTER TABLE merchant_aliases
ADD COLUMN match_field text not null default 'counterparty'
CHECK (match_field in ('counterparty', 'purpose', 'any'));
