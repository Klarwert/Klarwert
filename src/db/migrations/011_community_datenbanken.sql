-- klarwert - migration 011: community-datenbanken (händler-db & bankformat-templates)

create table if not exists merchants (
  id integer primary key
, canonical_name text not null unique
, display_name text not null
, default_category_id integer references categories(id) on delete set null
, source_version text
, is_builtin integer not null default 0
, is_active integer not null default 1
);

create table if not exists merchant_aliases (
  id integer primary key
, merchant_id integer not null references merchants(id) on delete cascade
, match_type text not null check (match_type in ('iban', 'name_exact', 'name_fuzzy', 'regex'))
, match_value text not null
, priority integer not null default 100
);
create index if not exists idx_merchant_aliases_value on merchant_aliases(match_value);

create table if not exists merchant_suppressions (
  id integer primary key
, merchant_id integer not null references merchants(id) on delete cascade
, suppressed_at text not null default (datetime('now'))
);

create table if not exists categorization_log (
  id integer primary key
, transaction_id integer not null references transactions(id) on delete cascade
, matched_by text not null check (matched_by in
    ('manual', 'user_rule', 'contract', 'transfer', 'merchant_iban', 'merchant_alias', 'similarity', 'none'))
, rule_id integer references rules(id) on delete set null
, merchant_id integer references merchants(id) on delete set null
, confidence real not null
, applied_at text not null default (datetime('now'))
);
create index if not exists idx_categorization_log_tx on categorization_log(transaction_id);

alter table import_profiles add column source_version text;
alter table transactions add column merchant_id integer references merchants(id) on delete set null;
alter table transactions add column categorization_confidence real;
