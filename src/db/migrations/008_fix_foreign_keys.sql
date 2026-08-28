-- migration 008 – fix foreign keys pointing to deleted _old tables
-- behebt sqlite-fehler: (code: 1) no such table: main.contracts_old

pragma foreign_keys = off;
pragma legacy_alter_table = on;

-- 1. transactions
drop table if exists transactions_fix_temp;
alter table transactions rename to transactions_fix_temp;

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
, categorization_source text not null default 'none' check (categorization_source in ('none', 'manual', 'rule', 'contract'))
, applied_rule_id integer references rules(id) on delete set null
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
  applied_rule_id, is_reviewed, is_transfer, transfer_pair_id, transfer_status, is_saving,
  sparzweck_id, exclude_from_stats, contract_id, recurring_payment_id, is_deleted, created_at
)
select 
  id, asset_id, booking_date,
  case when typeof(value_date) = 'text' then value_date else null end,
  coalesce(counterparty, ''),
  purpose, amount_cents, coalesce(source, 'import'),
  external_id, extra_fields_json, fingerprint, import_id, category_id,
  coalesce(categorization_source, 'none'),
  applied_rule_id,
  coalesce(is_reviewed, 1),
  coalesce(is_transfer, 0),
  transfer_pair_id, transfer_status,
  coalesce(is_saving, 0),
  sparzweck_id,
  coalesce(exclude_from_stats, 0),
  contract_id, recurring_payment_id,
  coalesce(is_deleted, 0),
  coalesce(created_at, datetime('now'))
from transactions_fix_temp;

drop table transactions_fix_temp;

create index if not exists idx_tx_asset_date on transactions(asset_id, booking_date);
create index if not exists idx_tx_category on transactions(category_id);
create index if not exists idx_tx_fingerprint on transactions(asset_id, fingerprint);
create index if not exists idx_tx_external on transactions(asset_id, external_id);

-- 2. contracts
drop table if exists contracts_fix_temp;
alter table contracts rename to contracts_fix_temp;

create table contracts (
  id integer primary key
, name text not null
, current_amount_cents integer not null
, previous_amount_cents integer
, interval text not null check (interval in ('monthly', 'quarterly', 'yearly', 'irregular'))
, status text not null check (status in ('detected', 'confirmed', 'price_changed', 'paused', 'ended'))
, category_id integer references categories(id) on delete set null
, detection_method text
, is_manual integer not null default 0
, generated_rule_id integer references rules(id) on delete set null
, detected_at text not null default (datetime('now'))
, is_dismissed integer not null default 0
, is_deleted integer not null default 0
);

insert into contracts (
  id, name, current_amount_cents, previous_amount_cents, interval, status,
  category_id, detection_method, is_manual, generated_rule_id, detected_at, is_dismissed, is_deleted
)
select 
  id, name, current_amount_cents, previous_amount_cents, interval, status,
  category_id, detection_method, coalesce(is_manual, 0), generated_rule_id,
  coalesce(detected_at, datetime('now')), coalesce(is_dismissed, 0), coalesce(is_deleted, 0)
from contracts_fix_temp;

drop table contracts_fix_temp;

-- 3. recurring_payments
drop table if exists recurring_payments_fix_temp;
alter table recurring_payments rename to recurring_payments_fix_temp;

create table recurring_payments (
  id integer primary key
, name text not null
, typical_amount_cents integer not null
, category_id integer references categories(id) on delete set null
, detected_at text not null default (datetime('now'))
, is_dismissed integer not null default 0
, is_deleted integer not null default 0
);

insert into recurring_payments (
  id, name, typical_amount_cents, category_id, detected_at, is_dismissed, is_deleted
)
select 
  id, name, typical_amount_cents, category_id,
  coalesce(detected_at, datetime('now')), coalesce(is_dismissed, 0), coalesce(is_deleted, 0)
from recurring_payments_fix_temp;

drop table recurring_payments_fix_temp;

-- 4. rules
drop table if exists rules_fix_temp;
alter table rules rename to rules_fix_temp;

create table rules (
  id integer primary key
, priority integer not null default 0
, category_id integer references categories(id) on delete cascade
, tag_id integer references tags(id) on delete set null
, mark_as_transfer integer not null default 0
, mark_as_saving integer not null default 0
, sparzweck_id integer references sparzwecke(id) on delete set null
, created_at text not null default (datetime('now'))
, created_from text not null default 'manual' check (created_from in ('manual', 'aufraeumen', 'vertrag'))
, source_contract_id integer references contracts(id) on delete set null
, is_deleted integer not null default 0
);

insert into rules (
  id, priority, category_id, tag_id, mark_as_transfer, mark_as_saving,
  sparzweck_id, created_at, created_from, source_contract_id, is_deleted
)
select 
  id, coalesce(priority, 0), category_id, tag_id, coalesce(mark_as_transfer, 0),
  coalesce(mark_as_saving, 0), sparzweck_id, coalesce(created_at, datetime('now')),
  coalesce(created_from, 'manual'), source_contract_id, coalesce(is_deleted, 0)
from rules_fix_temp;

drop table rules_fix_temp;

-- 5. rule_conditions
drop table if exists rule_conditions_fix_temp;
alter table rule_conditions rename to rule_conditions_fix_temp;

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
from rule_conditions_fix_temp;

drop table rule_conditions_fix_temp;

pragma legacy_alter_table = off;
pragma foreign_keys = on;

