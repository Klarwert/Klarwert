-- migration 016 – dauerhafte Selbstheilungs-Regression beheben
--
-- rules.source_contract_id zeigte durch eine frühere Table-Rebuild-Migration dauerhaft auf die
-- Textreferenz "contracts_old" statt "contracts". Der frühere generische Korruptions-Scan in
-- migrate.ts (`sql like '%_old%'` über alle Tabellen) hat das bei JEDEM App-Start fälschlich als
-- Korruption erkannt und daraufhin den alten (Vor-Migration-012-)contracts-Rebuild aus
-- fixAllForeignKeys009 erneut eingespielt – das hat merchant_id/confidence/amount_tolerance_percent
-- auf contracts bei jedem Neustart wieder entfernt (Ursache von "no such column: merchant_id" beim
-- Import). Diese Migration baut contracts und rules einmalig und endgültig korrekt neu auf und räumt
-- Leftover-Tabellen aus vorherigen abgebrochenen Rebuild-Läufen auf. Der fehlerhafte Scan selbst wurde
-- aus migrate.ts entfernt.

pragma foreign_keys = off;
-- siehe migration 012: ohne dieses pragma schreibt sqlite bei "alter table ... rename" automatisch
-- fremdschlüssel-referenzen in ANDEREN tabellen (hier: transactions.contract_id, rule_conditions.rule_id,
-- transactions.applied_rule_id) auf den temporären zwischennamen um – das ist der eigentliche, bisher
-- nicht behobene grund für "no such table: main.contracts_old"/"main.rules_rebuild_old".
pragma legacy_alter_table = on;

-- Leftover-Tabellen aus vorherigen (abgebrochenen) Rebuild-Läufen entfernen
drop table if exists contracts_clean_temp;
drop table if exists contracts_fix_temp;
drop table if exists transactions_clean_temp;
drop table if exists transactions_fix_temp;
drop table if exists rules_clean_temp;
drop table if exists rule_conditions_clean_temp;
drop table if exists category_aliases_clean_temp;
drop table if exists transaction_custom_values_clean_temp;
drop table if exists transaction_splits_clean_temp;
drop table if exists transaction_tags_clean_temp;
drop table if exists collection_transactions_clean_temp;
drop table if exists budgets_clean_temp;
drop table if exists steuer_thema_categories_clean_temp;

-- contracts final neu aufbauen (robust gegenüber dem aktuellen, evtl. zurückgesetzten Zwischenstand –
-- übernimmt nur Spalten, die garantiert existieren, alles andere startet sauber bei Default/NULL)
drop table if exists contracts_rebuild_old;
alter table contracts rename to contracts_rebuild_old;

create table contracts (
  id integer primary key
, name text not null
, current_amount_cents integer not null
, previous_amount_cents integer
, amount_tolerance_percent real not null default 5
, interval text not null check (interval in ('monthly', 'quarterly', 'yearly', 'irregular'))
, status text not null check (status in ('detected', 'confirmed', 'price_changed', 'paused', 'ended'))
, category_id integer references categories(id) on delete set null
, merchant_id integer references merchants(id) on delete set null
, detection_method text
, is_manual integer not null default 0
, confidence real
, detected_at text not null default (datetime('now'))
, is_dismissed integer not null default 0
, is_deleted integer not null default 0
);

insert into contracts (
  id, name, current_amount_cents, previous_amount_cents, interval, status,
  category_id, detection_method, is_manual, detected_at, is_dismissed, is_deleted
)
select
  id, name, current_amount_cents, previous_amount_cents, interval, status,
  category_id, detection_method, coalesce(is_manual, 0),
  coalesce(detected_at, datetime('now')), coalesce(is_dismissed, 0), coalesce(is_deleted, 0)
from contracts_rebuild_old;

drop table contracts_rebuild_old;
create index if not exists idx_contracts_merchant on contracts(merchant_id);

-- rules final neu aufbauen – FK zeigt jetzt wieder korrekt auf contracts, nicht contracts_old
drop table if exists rules_rebuild_old;
alter table rules rename to rules_rebuild_old;

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
from rules_rebuild_old;

drop table rules_rebuild_old;

pragma legacy_alter_table = off;
pragma foreign_keys = on;
pragma foreign_key_check;
