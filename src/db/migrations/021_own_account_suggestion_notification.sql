-- migration 021 – neuer Benachrichtigungstyp 'own_account_suggestion' (siehe Bugfix-Runde 3, Punkt 4):
-- eine wiederholt auftauchende, nicht zugeordnete Gegenpartei-IBAN wird zusammen mit einem
-- Namensabgleich (Alias/Personenname) als Vorschlag angezeigt, ein eigenes Konto mit dieser IBAN
-- (ausgegraut, da aus echten Bankdaten) anzulegen. Kein anderes Objekt referenziert notifications(id)
-- per Fremdschlüssel, daher ist dieser Rebuild risikofrei bzgl. der heute gefundenen
-- legacy_alter_table-Problematik – trotzdem korrekt gesetzt, für den Fall künftiger Referenzen.
pragma foreign_keys = off;
pragma legacy_alter_table = on;

drop table if exists notifications_fk_repair_old;
alter table notifications rename to notifications_fk_repair_old;

create table notifications (
  id integer primary key
, type text not null check (type in (
    'import_reminder', 'balance_mismatch', 'import_failed', 'contract_detected'
  , 'price_change', 'contract_ended', 'transfer_detected', 'budget_80', 'budget_exceeded', 'sparzweck_reached'
  , 'own_account_suggestion'
  ))
, ref_table text
, ref_id integer
, message text not null
, priority text not null check (priority in ('info', 'warning', 'critical'))
, is_read integer not null default 0
, is_archived integer not null default 0
, created_at text not null default (datetime('now'))
);

insert into notifications (id, type, ref_table, ref_id, message, priority, is_read, is_archived, created_at)
select id, type, ref_table, ref_id, message, priority, is_read, is_archived, created_at
from notifications_fk_repair_old;

drop table notifications_fk_repair_old;
create unique index if not exists idx_notif_upsert on notifications(type, ref_table, ref_id) where is_archived = 0;

pragma legacy_alter_table = off;
pragma foreign_keys = on;
pragma foreign_key_check;
