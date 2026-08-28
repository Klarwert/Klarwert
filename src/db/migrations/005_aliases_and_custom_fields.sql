-- klarwert – migration 005: category_aliases table + seed data; custom_fields table

-- create category_aliases table (idempotent – schema was already added in 001 for new installs,
-- but existing installs need it created here)
create table if not exists category_aliases (
  id integer primary key
, category_id integer not null references categories(id) on delete cascade
, alias text not null
);
create index if not exists idx_category_aliases on category_aliases(category_id);

-- create custom_fields table
create table if not exists custom_fields (
  id integer primary key
, name text not null unique
, type text not null default 'text' check (type in ('text', 'number', 'date'))
, sort_order integer not null default 0
, is_deleted integer not null default 0
);

create table if not exists transaction_custom_values (
  transaction_id integer not null references transactions(id) on delete cascade
, custom_field_id integer not null references custom_fields(id) on delete cascade
, value text not null
, primary key (transaction_id, custom_field_id)
);

-- seed aliases per seed-data.md section 1b
insert or ignore into category_aliases (category_id, alias)
  select id, 'Energie' from categories where name = 'Strom' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Stromanbieter' from categories where name = 'Strom' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Ökostrom' from categories where name = 'Strom' and is_deleted = 0;

insert or ignore into category_aliases (category_id, alias)
  select id, 'Heizung' from categories where name = 'Gas' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Erdgas' from categories where name = 'Gas' and is_deleted = 0;

insert or ignore into category_aliases (category_id, alias)
  select id, 'Mobilfunk' from categories where name = 'Handy' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Telefon' from categories where name = 'Handy' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Smartphone-Vertrag' from categories where name = 'Handy' and is_deleted = 0;

insert or ignore into category_aliases (category_id, alias)
  select id, 'DSL' from categories where name = 'Festnetz und Internet' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Glasfaser' from categories where name = 'Festnetz und Internet' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Router' from categories where name = 'Festnetz und Internet' and is_deleted = 0;

insert or ignore into category_aliases (category_id, alias)
  select id, 'Supermarkt' from categories where name = 'Lebensmittel und Getränke' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Einkauf' from categories where name = 'Lebensmittel und Getränke' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Rewe' from categories where name = 'Lebensmittel und Getränke' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Edeka' from categories where name = 'Lebensmittel und Getränke' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Lidl' from categories where name = 'Lebensmittel und Getränke' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Aldi' from categories where name = 'Lebensmittel und Getränke' and is_deleted = 0;

insert or ignore into category_aliases (category_id, alias)
  select id, 'Apotheke' from categories where name = 'Arznei- und Heilmittel' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Medikamente' from categories where name = 'Arznei- und Heilmittel' and is_deleted = 0;

insert or ignore into category_aliases (category_id, alias)
  select id, 'Benzin' from categories where name = 'Tanken' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Diesel' from categories where name = 'Tanken' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Kraftstoff' from categories where name = 'Tanken' and is_deleted = 0;

insert or ignore into category_aliases (category_id, alias)
  select id, 'Bahn' from categories where name = 'Taxi / ÖPNV / Car- und Bikesharing' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Bus' from categories where name = 'Taxi / ÖPNV / Car- und Bikesharing' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Nahverkehr' from categories where name = 'Taxi / ÖPNV / Car- und Bikesharing' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Uber' from categories where name = 'Taxi / ÖPNV / Car- und Bikesharing' and is_deleted = 0;

insert or ignore into category_aliases (category_id, alias)
  select id, 'Essen gehen' from categories where name = 'Restaurant / Cafe / Bar' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Gastronomie' from categories where name = 'Restaurant / Cafe / Bar' and is_deleted = 0;

insert or ignore into category_aliases (category_id, alias)
  select id, 'ETF' from categories where name = 'Wertpapieranlage' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Aktien' from categories where name = 'Wertpapieranlage' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Depot' from categories where name = 'Wertpapieranlage' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Fonds' from categories where name = 'Wertpapieranlage' and is_deleted = 0;

insert or ignore into category_aliases (category_id, alias)
  select id, 'Zahnzusatz' from categories where name = 'Kranken-Zusatzversicherung' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Auslandskrankenversicherung' from categories where name = 'Kranken-Zusatzversicherung' and is_deleted = 0;

insert or ignore into category_aliases (category_id, alias)
  select id, 'Lohn' from categories where name = 'Gehalt' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Einkommen' from categories where name = 'Gehalt' and is_deleted = 0;

insert or ignore into category_aliases (category_id, alias)
  select id, 'Umbuchung' from categories where name = 'Kontentransfer' and is_deleted = 0;
insert or ignore into category_aliases (category_id, alias)
  select id, 'Eigenüberweisung' from categories where name = 'Kontentransfer' and is_deleted = 0;
