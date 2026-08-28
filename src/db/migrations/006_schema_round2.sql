-- migration 006 – schema-erweiterungen für bugfix-runde-2
-- fügt fehlende felder aus klarwert-schema.sql (spec v2) nach

pragma foreign_keys = off;
pragma legacy_alter_table = on;

-- 1. categories: direction-spalte (einnahme/ausgabe), steuert combobox-sortierung
drop table if exists categories_old;
alter table categories rename to categories_old;

create table categories (
  id integer primary key
, name text not null
, parent_id integer references categories(id) on delete restrict
, color text not null default '#000000'
, icon text
, direction text not null default 'ausgabe' check (direction in ('ausgabe', 'einnahme'))
, sort_order integer not null default 0
, is_template integer not null default 0
, is_deleted integer not null default 0
, unique(name, parent_id)
);

insert into categories (id, name, parent_id, color, icon, sort_order, is_template, is_deleted)
  select id, name, parent_id, color, icon, sort_order, is_template, is_deleted from categories_old;

drop table categories_old;

-- direction für die 'einnahmen'-oberkategorie setzen
update categories set direction = 'einnahme'
  where name = 'Einnahmen' and parent_id is null and is_template = 1;

-- 2. rules: herkunft und quelle
alter table rules add column created_from text not null default 'manual'
  check (created_from in ('manual', 'aufraeumen', 'vertrag'));
alter table rules add column source_contract_id integer references contracts(id) on delete set null;

-- 3. rule_conditions: custom-field-unterstützung
-- feld-typ 'custom' wird durch neues constraint erlaubt
-- sqlite erlaubt kein alter table zum ändern von check-constraints → neue tabelle nötig
-- strategie: tabelle umbenennen, neu anlegen, daten kopieren, alte löschen
drop table if exists rule_conditions_old;
alter table rule_conditions rename to rule_conditions_old;

create table rule_conditions (
  id integer primary key
, rule_id integer not null references rules(id) on delete cascade
, field text not null check (field in ('purpose', 'counterparty', 'amount', 'asset', 'custom'))
, custom_field_id integer references custom_fields(id) on delete cascade -- nur gesetzt wenn field='custom'
, operator text not null check (operator in ('contains', 'equals', 'approx'))
, value text not null
);

insert into rule_conditions (id, rule_id, field, custom_field_id, operator, value)
  select id, rule_id, field, null, operator, value from rule_conditions_old;

drop table rule_conditions_old;

-- 4. contracts: is_manual + generated_rule_id + quarterly-intervall
alter table contracts add column is_manual integer not null default 0;
alter table contracts add column generated_rule_id integer references rules(id) on delete set null;

-- contracts.interval check-constraint: quarterly hinzufügen
-- sqlite: tabelle neu erstellen (check-constraints nicht per alter änderbar)
drop table if exists contracts_old;
alter table contracts rename to contracts_old;

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

insert into contracts (id, name, current_amount_cents, previous_amount_cents, interval, status,
  category_id, detection_method, is_manual, generated_rule_id, detected_at, is_dismissed, is_deleted)
  select id, name, current_amount_cents, previous_amount_cents, interval, status,
    category_id, detection_method, is_manual, generated_rule_id, detected_at, is_dismissed, is_deleted
  from contracts_old;

drop table contracts_old;

-- foreign keys für transactions, die auf contracts zeigen, bleiben erhalten (cascade)

-- 5. recurring_payments: category_id hinzufügen
alter table recurring_payments add column category_id integer references categories(id) on delete set null;

-- 6. custom_fields: data_type-spalte (ersetzt/ergänzt 'type')
-- bereits in migration 005 als 'type' angelegt; wir fügen data_type als alias hinzu
-- und erweitern die erlaubten werte auf die volle spec-liste
drop table if exists custom_fields_old;
alter table custom_fields rename to custom_fields_old;

create table custom_fields (
  id integer primary key
, name text not null unique
, data_type text not null default 'text'
  check (data_type in ('text', 'integer', 'decimal', 'boolean', 'date', 'datetime'))
, sort_order integer not null default 0
, is_deleted integer not null default 0
);

insert into custom_fields (id, name, data_type, sort_order, is_deleted)
  select id, name,
    case
      when type = 'number' then 'decimal'
      when type = 'date' then 'date'
      else 'text'
    end,
    sort_order, is_deleted
  from custom_fields_old;

drop table custom_fields_old;

-- transaction_custom_values bleibt unverändert (custom_field_id-referenz bleibt gültig)

pragma legacy_alter_table = off;

