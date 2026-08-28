-- B0: Operations-Log (Undo-Basis)
create table operations (
  id integer primary key
, op_type text not null            -- 'insert' | 'update' | 'delete'
, entity_table text not null       -- betroffene tabelle (z.B. 'transactions', 'categories')
, entity_id integer not null       -- id in der betroffenen tabelle
, payload_json text not null       -- neue werte (kompletter zeileninhalt bei insert/update, leer bei delete)
, inverse_payload_json text        -- vorherige werte für undo (null bei insert, alter inhalt bei update/delete)
, batch_id text not null           -- fasst zusammengehörige ops zusammen (ein import = ein batch)
, created_at text not null default (datetime('now'))
, undone_at text                   -- gesetzt, wenn rückgängig gemacht
);
create index idx_operations_batch on operations(batch_id);
create index idx_operations_entity on operations(entity_table, entity_id);
