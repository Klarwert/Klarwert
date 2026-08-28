-- 027_depot.sql
-- Führt das Wertpapier- und Depot-Modul ein (Phase D)

create table depot_positions (
    id integer primary key
  , asset_id integer not null references assets(id) on delete cascade
  , isin text not null
  , name text not null
  , shares_amount text not null -- String für präzise Dezimalzahlen, SQLite hat kein echtes DECIMAL
  , purchase_price_cents integer not null
  , currency text not null default 'EUR'
  , created_at text not null default (datetime('now'))
  , updated_at text not null default (datetime('now'))
);

create index idx_depot_positions_asset on depot_positions(asset_id);
create index idx_depot_positions_isin on depot_positions(isin);

create table depot_prices (
    isin text not null
  , date_str text not null -- YYYY-MM-DD
  , price_cents integer not null
  , currency text not null default 'EUR'
  , primary key (isin, date_str)
);
