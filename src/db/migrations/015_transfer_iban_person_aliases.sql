-- migration 015 – Transfer-/Sparen-Erkennung über IBAN + Namensvarianten (gestaffelte Konfidenz)

alter table assets add column iban text;

create table if not exists person_aliases (
  id integer primary key
, person_id integer not null references persons(id) on delete cascade
, alias text not null
);
create index if not exists idx_person_aliases on person_aliases(person_id);
