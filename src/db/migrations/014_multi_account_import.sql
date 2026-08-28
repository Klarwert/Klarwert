-- migration 014 – Mehrkonto-CSV-Import (eine Datei, mehrere eigene Konten, z. B. C24-Export)

alter table import_profiles add column account_column_index integer;

create table if not exists import_profile_account_map (
  id integer primary key
, import_profile_id integer not null references import_profiles(id) on delete cascade
, source_value text not null
, asset_id integer not null references assets(id) on delete cascade
);
create unique index if not exists idx_import_profile_account_map on import_profile_account_map(import_profile_id, source_value);
