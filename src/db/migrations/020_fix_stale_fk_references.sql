-- migration 020 – endgültige Reparatur der "no such table: main.contracts_old"/"main.rules_rebuild_old"-
-- Klasse von Fehlern für bereits betroffene, bestehende Installationen.
--
-- Root Cause (erst jetzt vollständig verstanden, durch echte Integrationstests gegen eine reale
-- SQLite-Engine aufgedeckt): Migration 012 und 016 benennen `contracts`/`rules` per
-- `alter table ... rename to ..._old` um, OHNE vorher `pragma legacy_alter_table = on` zu setzen
-- (Migration 009 macht das für ihre eigenen Renames bereits richtig, 012/016 nicht). Ohne dieses
-- Pragma schreibt SQLite bei einem Rename automatisch die Fremdschlüssel-Definition in JEDER
-- anderen Tabelle, die auf die umbenannte Tabelle verweist, auf den temporären Zwischennamen um.
-- Nach dem Löschen der Zwischentabelle bleibt diese Referenz dauerhaft kaputt. Betroffen:
-- transactions.contract_id / transactions.applied_rule_id, rule_conditions.rule_id,
-- categorization_log.rule_id. 012/016 selbst sind jetzt korrigiert (siehe deren Dateien), diese
-- Migration heilt einmalig den Bestand bei allen Installationen, die die kaputte Version schon
-- durchlaufen haben.
--
-- Zweiter, unabhängiger Fund beim selben Rebuild: der categorization_source-check erlaubte seit
-- Migration 001 nie 'merchant'/'similarity', obwohl pipeline.ts genau diese Werte für Händler-DB-
-- und Ähnlichkeits-Treffer setzt (maßgeblich laut klarwert-schema.sql, das beide Werte vorsieht) –
-- jeder echte Treffer über diese beiden Pipeline-Stufen hätte mit einem CHECK-constraint-Fehler
-- abbrechen müssen. Wird hier im selben Rebuild korrigiert.

pragma foreign_keys = off;
pragma legacy_alter_table = on;

drop table if exists transactions_fk_repair_old;
alter table transactions rename to transactions_fk_repair_old;

create table transactions (
  id integer primary key
, asset_id integer not null references assets(id) on delete cascade
, booking_date text not null
, value_date text
, counterparty text not null
, purpose text
, amount_cents integer not null
, source text not null check (source in ('import', 'manual'))
, external_id text
, extra_fields_json text
, fingerprint text not null
, import_id integer references imports(id) on delete set null
, category_id integer references categories(id) on delete set null
, categorization_source text not null default 'none' check (categorization_source in ('none', 'manual', 'rule', 'contract', 'merchant', 'similarity'))
, applied_rule_id integer references rules(id) on delete set null
, merchant_id integer references merchants(id) on delete set null
, categorization_confidence real
, is_reviewed integer not null default 1
, is_transfer integer not null default 0
, transfer_pair_id integer references transactions(id) on delete set null
, transfer_status text check (transfer_status in ('suggested', 'confirmed'))
, is_saving integer not null default 0
, sparzweck_id integer references sparzwecke(id) on delete set null
, exclude_from_stats integer not null default 0
, contract_id integer references contracts(id) on delete set null
, recurring_payment_id integer references recurring_payments(id) on delete set null
, is_deleted integer not null default 0
, created_at text not null default (datetime('now'))
, check (contract_id is null or recurring_payment_id is null)
);

insert into transactions (
  id, asset_id, booking_date, value_date, counterparty, purpose, amount_cents, source,
  external_id, extra_fields_json, fingerprint, import_id, category_id, categorization_source,
  applied_rule_id, merchant_id, categorization_confidence, is_reviewed, is_transfer, transfer_pair_id,
  transfer_status, is_saving, sparzweck_id, exclude_from_stats, contract_id, recurring_payment_id,
  is_deleted, created_at
)
select
  id, asset_id, booking_date, value_date, counterparty, purpose, amount_cents, source,
  external_id, extra_fields_json, fingerprint, import_id, category_id, coalesce(categorization_source, 'none'),
  applied_rule_id, merchant_id, categorization_confidence, coalesce(is_reviewed, 1), coalesce(is_transfer, 0), transfer_pair_id,
  transfer_status, coalesce(is_saving, 0), sparzweck_id, coalesce(exclude_from_stats, 0), contract_id, recurring_payment_id,
  coalesce(is_deleted, 0), coalesce(created_at, datetime('now'))
from transactions_fk_repair_old;

drop table transactions_fk_repair_old;

create index if not exists idx_tx_asset_date on transactions(asset_id, booking_date);
create index if not exists idx_tx_category on transactions(category_id);
create index if not exists idx_tx_fingerprint on transactions(asset_id, fingerprint);
create index if not exists idx_tx_external on transactions(asset_id, external_id);
create index if not exists idx_tx_contract on transactions(contract_id);

drop table if exists rule_conditions_fk_repair_old;
alter table rule_conditions rename to rule_conditions_fk_repair_old;

create table rule_conditions (
  id integer primary key
, rule_id integer not null references rules(id) on delete cascade
, field text not null check (field in ('purpose', 'counterparty', 'amount', 'asset', 'custom'))
, custom_field_id integer references custom_fields(id) on delete cascade
, operator text not null check (operator in ('contains', 'equals', 'approx'))
, value text not null
);

insert into rule_conditions (id, rule_id, field, custom_field_id, operator, value)
select id, rule_id, field, custom_field_id, operator, value
from rule_conditions_fk_repair_old;

drop table rule_conditions_fk_repair_old;

drop table if exists categorization_log_fk_repair_old;
alter table categorization_log rename to categorization_log_fk_repair_old;

create table categorization_log (
  id integer primary key
, transaction_id integer not null references transactions(id) on delete cascade
, matched_by text not null check (matched_by in
    ('manual', 'user_rule', 'contract', 'transfer', 'merchant_iban', 'merchant_alias', 'similarity', 'none'))
, rule_id integer references rules(id) on delete set null
, merchant_id integer references merchants(id) on delete set null
, confidence real not null
, applied_at text not null default (datetime('now'))
, alternatives_json text
);

insert into categorization_log (id, transaction_id, matched_by, rule_id, merchant_id, confidence, applied_at, alternatives_json)
select id, transaction_id, matched_by, rule_id, merchant_id, confidence, applied_at, alternatives_json
from categorization_log_fk_repair_old;

drop table categorization_log_fk_repair_old;
create index if not exists idx_categorization_log_tx on categorization_log(transaction_id);

pragma legacy_alter_table = off;
pragma foreign_keys = on;
pragma foreign_key_check;
