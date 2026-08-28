-- Add kirchensteuer_aktiv and bundesland to persons table
alter table persons add column kirchensteuer_aktiv integer not null default 0;
alter table persons add column bundesland text default null;
