-- migration 013 – knapp unterlegene Alternativen für die Transparenz-Anzeige im Transaktions-Drawer
alter table categorization_log add column alternatives_json text;
