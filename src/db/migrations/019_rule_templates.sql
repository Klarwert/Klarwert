-- feature: regel-vorlagen (ergaenzt die haendler-db/ebene a um einfache, community-unabhaengige
-- text-regeln, die der nutzer in den einstellungen komplett an/ausschalten sowie einzeln ausblenden
-- oder bearbeiten kann). laeuft als eigene pipeline-stufe zwischen benutzerregeln und haendler-db.
create table if not exists rule_templates (
  id integer primary key autoincrement
, template_key text not null unique -- stabiler slug fuer idempotentes reseeding, wie categories.template_key
, label text not null -- klartext-name in der verwaltungs-ui, z.b. "Vattenfall (Strom)"
, category_template_key text not null -- ziel-kategorie, referenziert categories.template_key
, field text not null check (field in ('purpose', 'counterparty'))
, operator text not null default 'contains' check (operator in ('contains', 'equals'))
, value text not null
, sort_order integer not null default 0
, is_hidden integer not null default 0
, is_custom integer not null default 0 -- vom nutzer selbst angelegt, kein mitgeliefertes template
, is_deleted integer not null default 0
);
create index if not exists idx_rule_templates_category on rule_templates(category_template_key);
