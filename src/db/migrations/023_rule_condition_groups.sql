-- migration 023 – Regel-Builder erweitern (siehe prompt-regelbuilder-erweiterung.md).
--
-- 1. rule_conditions bekommt `extra_field_key` (Bedingung bezieht sich auf einen dynamischen
--    extra_fields_json-Schlüssel aus dem Import, statt auf custom_field_id) sowie `value_to`
--    (für den neuen 'between'-Operator) und breitere Operatoren für Beträge.
-- 2. Zweistufige UND/ODER-Struktur: rule_condition_groups (Gruppen sind ODER-verknüpft),
--    rule_conditions hängt jetzt an einer Gruppe statt direkt an der Regel (Bedingungen INNERHALB
--    einer Gruppe bleiben UND-verknüpft). Bewusst nicht beliebig verschachtelt (siehe Konzept).
--
-- rule_conditions hat KEINE eingehenden Fremdschlüssel von anderen Tabellen (nur rule_id/
-- custom_field_id ZEIGEN darauf raus) – der Rebuild ist deshalb unproblematisch bzgl. der an
-- anderer Stelle gefundenen legacy_alter_table-Problematik (betrifft nur Tabellen, auf die von
-- AUSSEN verwiesen wird).

pragma foreign_keys = off;

create table rule_condition_groups (
  id integer primary key
, rule_id integer not null references rules(id) on delete cascade
, group_order integer not null default 0
);
create index if not exists idx_rule_condition_groups_rule on rule_condition_groups(rule_id);

drop table if exists rule_conditions_group_migration_old;
alter table rule_conditions rename to rule_conditions_group_migration_old;

create table rule_conditions (
  id integer primary key
, group_id integer not null references rule_condition_groups(id) on delete cascade
, field text not null check (field in ('purpose', 'counterparty', 'amount', 'asset', 'custom', 'extra_field'))
, custom_field_id integer references custom_fields(id) on delete cascade
, extra_field_key text
, operator text not null check (operator in ('contains', 'equals', 'approx', 'greater_than', 'less_than', 'between'))
, value text not null
, value_to text
, check (custom_field_id is null or extra_field_key is null)
);

-- Jede bestehende Regel bekommt genau eine Gruppe (group_order=0), ihre bisherigen Bedingungen
-- wandern unverändert (weiterhin UND-verknüpft) in diese eine Gruppe – 100% gleiches Verhalten wie
-- vorher, ein zweiter Regel-Aufruf mit ODER-Verknüpfung ist danach optional möglich.
insert into rule_condition_groups (id, rule_id, group_order)
select distinct rule_id, rule_id, 0 from rule_conditions_group_migration_old;

insert into rule_conditions (id, group_id, field, custom_field_id, extra_field_key, operator, value, value_to)
select id, rule_id, field, custom_field_id, null, operator, value, null
from rule_conditions_group_migration_old;

drop table rule_conditions_group_migration_old;

pragma foreign_keys = on;
pragma foreign_key_check;
