-- migration 012 – zirkuläre foreign key zwischen contracts und rules auflösen
-- contracts.generated_rule_id -> rules(id) und rules.source_contract_id -> contracts(id) bildeten
-- einen zyklus, der bei table-rebuild-migrationen zu "no such table: main.contracts_old" führen
-- kann. die verknüpfung läuft ab jetzt ausschließlich über rules.source_contract_id (rückverknüpfung),
-- generated_rule_id entfällt. gleichzeitig werden die im ziel-schema vorgesehenen contracts-spalten
-- amount_tolerance_percent/merchant_id/confidence ergänzt.

pragma foreign_keys = off;
-- ohne dieses pragma schreibt sqlite bei "alter table contracts rename" automatisch die FK-referenz
-- in transactions.contract_id (und jeder anderen tabelle mit "references contracts(...)") auf den
-- temporären namen "contracts_old" um – nach dem drop unten bleibt diese referenz dauerhaft
-- kaputt ("no such table: main.contracts_old" bei jedem folgenden zugriff). siehe migration 009,
-- die das für ihre eigenen renames bereits richtig macht; hier fehlte es bisher.
pragma legacy_alter_table = on;

drop table if exists contracts_old;
alter table contracts rename to contracts_old;

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
  id, name, current_amount_cents, previous_amount_cents, amount_tolerance_percent, interval, status,
  category_id, detection_method, is_manual, detected_at, is_dismissed, is_deleted
)
select
  id, name, current_amount_cents, previous_amount_cents, 5, interval, status,
  category_id, detection_method, coalesce(is_manual, 0),
  coalesce(detected_at, datetime('now')), coalesce(is_dismissed, 0), coalesce(is_deleted, 0)
from contracts_old;

drop table contracts_old;

create index if not exists idx_contracts_merchant on contracts(merchant_id);

pragma legacy_alter_table = off;
pragma foreign_keys = on;
pragma foreign_key_check;
