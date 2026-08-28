-- migration 009 – fix foreign key definitions corrupted by SQLite ALTER TABLE RENAME
-- behebt: error returned from database: (code: 1) no such table: main.contracts_old

pragma foreign_keys = off;
pragma legacy_alter_table = on;

-- 1. transactions
drop table if exists transactions_clean_temp;
alter table transactions rename to transactions_clean_temp;

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
from transactions_clean_temp;

drop table transactions_clean_temp;

create index if not exists idx_tx_asset_date on transactions(asset_id, booking_date);
create index if not exists idx_tx_category on transactions(category_id);
create index if not exists idx_tx_fingerprint on transactions(asset_id, fingerprint);
create index if not exists idx_tx_external on transactions(asset_id, external_id);

-- 2. contracts
drop table if exists contracts_clean_temp;
alter table contracts rename to contracts_clean_temp;

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
from contracts_clean_temp;

drop table contracts_clean_temp;

-- 3. recurring_payments
drop table if exists recurring_payments_clean_temp;
alter table recurring_payments rename to recurring_payments_clean_temp;

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
from recurring_payments_clean_temp;

drop table recurring_payments_clean_temp;

-- 4. rules
drop table if exists rules_clean_temp;
alter table rules rename to rules_clean_temp;

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
from rules_clean_temp;

drop table rules_clean_temp;

-- 5. rule_conditions
drop table if exists rule_conditions_clean_temp;
alter table rule_conditions rename to rule_conditions_clean_temp;

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
from rule_conditions_clean_temp;

drop table rule_conditions_clean_temp;

-- 6. category_aliases
drop table if exists category_aliases_clean_temp;
alter table category_aliases rename to category_aliases_clean_temp;

create table category_aliases (
  id integer primary key
, category_id integer not null references categories(id) on delete cascade
, alias text not null
);

insert into category_aliases (id, category_id, alias)
select id, category_id, alias
from category_aliases_clean_temp;

drop table category_aliases_clean_temp;
create index if not exists idx_category_aliases on category_aliases(category_id);

-- 7. transaction_custom_values
drop table if exists transaction_custom_values_clean_temp;
alter table transaction_custom_values rename to transaction_custom_values_clean_temp;

create table transaction_custom_values (
  transaction_id integer not null references transactions(id) on delete cascade
, custom_field_id integer not null references custom_fields(id) on delete cascade
, value text not null
, primary key (transaction_id, custom_field_id)
);

insert into transaction_custom_values (transaction_id, custom_field_id, value)
select transaction_id, custom_field_id, value
from transaction_custom_values_clean_temp;

drop table transaction_custom_values_clean_temp;

-- 8. transaction_splits
drop table if exists transaction_splits_clean_temp;
alter table transaction_splits rename to transaction_splits_clean_temp;

create table transaction_splits (
  id integer primary key
, transaction_id integer not null references transactions(id) on delete cascade
, amount_cents integer not null check (amount_cents != 0)
, category_id integer not null references categories(id) on delete restrict
, note text
);

insert into transaction_splits (id, transaction_id, amount_cents, category_id, note)
select id, transaction_id, amount_cents, category_id, note
from transaction_splits_clean_temp;

drop table transaction_splits_clean_temp;

-- 9. transaction_tags
drop table if exists transaction_tags_clean_temp;
alter table transaction_tags rename to transaction_tags_clean_temp;

create table transaction_tags (
  transaction_id integer not null references transactions(id) on delete cascade
, tag_id integer not null references tags(id) on delete cascade
, primary key (transaction_id, tag_id)
);

insert into transaction_tags (transaction_id, tag_id)
select transaction_id, tag_id
from transaction_tags_clean_temp;

drop table transaction_tags_clean_temp;

-- 10. collection_transactions
drop table if exists collection_transactions_clean_temp;
alter table collection_transactions rename to collection_transactions_clean_temp;

create table collection_transactions (
  collection_id integer not null references collections(id) on delete cascade
, transaction_id integer not null references transactions(id) on delete cascade
, primary key (collection_id, transaction_id)
);

insert into collection_transactions (collection_id, transaction_id)
select collection_id, transaction_id
from collection_transactions_clean_temp;

drop table collection_transactions_clean_temp;

-- 11. budgets
drop table if exists budgets_clean_temp;
alter table budgets rename to budgets_clean_temp;

create table budgets (
  id integer primary key
, category_id integer not null unique references categories(id) on delete cascade
, limit_cents integer not null check (limit_cents > 0)
, period_type text not null check (period_type in ('week', 'month', 'quarter', 'year'))
, is_deleted integer not null default 0
);

insert into budgets (id, category_id, limit_cents, period_type, is_deleted)
select id, category_id, limit_cents, period_type, coalesce(is_deleted, 0)
from budgets_clean_temp;

drop table budgets_clean_temp;

-- 12. steuer_thema_categories
drop table if exists steuer_thema_categories_clean_temp;
alter table steuer_thema_categories rename to steuer_thema_categories_clean_temp;

create table steuer_thema_categories (
  thema_id integer not null references steuer_themen(id) on delete cascade
, category_id integer not null references categories(id) on delete cascade
, primary key (thema_id, category_id)
);

insert into steuer_thema_categories (thema_id, category_id)
select thema_id, category_id
from steuer_thema_categories_clean_temp;

drop table steuer_thema_categories_clean_temp;

pragma legacy_alter_table = off;
pragma foreign_keys = on;

