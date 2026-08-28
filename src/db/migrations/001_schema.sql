-- klarwert – sqlite schema v1 (schema_version = 1)
-- konventionen: beträge als integer-cents, daten als iso-text (yyyy-mm-dd),
-- zeitstempel als iso-text (utc), booleans als integer 0/1

pragma foreign_keys = on;
pragma journal_mode = WAL;
pragma busy_timeout = 5000;
-- WAL + busy_timeout sind Absicherung, nicht die eigentliche Lösung für "database is locked"/
-- "cannot rollback - no transaction active": siehe CLAUDE.md, Abschnitt "Transaktions-Disziplin".

create table meta (
  key text primary key
, value text not null
);
-- initial: ('schema_version', '1')

create table settings (
  key text primary key
, value text not null
);
-- keys: currency ('EUR'), import_reminder_days ('30', '0' = aus),
-- kirchensteuer_aktiv ('0'/'1'), kirchensteuer_satz ('8'/'9'), onboarding_done ('0'/'1')

create table persons (
  id integer primary key
, name text not null
, role text not null default 'adult' check (role in ('adult', 'child'))
, birth_year integer check (birth_year between 1900 and 2100) -- optional, für fire-rechner
, is_active integer not null default 1
, created_at text not null default (datetime('now'))
);

create table assets (
  id integer primary key
, name text not null
, kind text not null check (kind in ('account', 'valuable')) -- konto vs. wertgegenstand, nach anlage fix
, account_type text check (account_type in ('giro', 'tagesgeld', 'kreditkarte', 'depot', 'darlehen')) -- nur kind=account
, valuable_type text check (valuable_type in ('bausparvertrag', 'bargeld', 'sonstiges')) -- nur kind=valuable
, default_sparzweck_id integer references sparzwecke(id) on delete set null -- nur tagesgeld/depot/bausparen sinnvoll
, import_profile_id integer references import_profiles(id) on delete set null
, last_import_at text
, last_confirmed_balance_cents integer -- zuletzt vom nutzer bestätigter bankstand (verifikation)
, is_archived integer not null default 0
, is_deleted integer not null default 0 -- soft-delete fürs undo-fenster
, created_at text not null default (datetime('now'))
);

create table asset_owners (
  asset_id integer not null references assets(id) on delete cascade
, person_id integer not null references persons(id) on delete cascade
, primary key (asset_id, person_id)
);

create table value_history (
  id integer primary key
, asset_id integer not null references assets(id) on delete cascade
, valued_at text not null
, value_cents integer not null
, source text not null check (source in ('manual', 'anchor')) -- anchor = startsaldo aus erstimport
);

create table categories (
  id integer primary key
, name text not null
, color text not null -- hex; unterkategorien erben in der ui die farbe des parents
, icon text -- lucide-name, nur oberkategorien
, parent_id integer references categories(id) on delete restrict
, is_template integer not null default 0 -- seed-kategorien: nicht löschbar/editierbar
, is_system integer not null default 0 -- 'unkategorisiert': weder ausblendbar noch löschbar
, is_hidden integer not null default 0 -- ausgeblendete templates
, sort_order integer not null default 0
, is_deleted integer not null default 0
);
create unique index idx_categories_name on categories(name, coalesce(parent_id, 0)) where is_deleted = 0;

create table category_aliases (
  id integer primary key
, category_id integer not null references categories(id) on delete cascade
, alias text not null -- zusätzlicher suchbegriff, v. a. für template-kategorien
);
create index idx_category_aliases on category_aliases(category_id);

-- benutzerdefinierte spalten für transaktionen (text-only in v1)
create table custom_fields (
  id integer primary key
, name text not null unique
, type text not null default 'text' check (type in ('text', 'number', 'date'))
, sort_order integer not null default 0
, is_deleted integer not null default 0
);

create table transaction_custom_values (
  transaction_id integer not null references transactions(id) on delete cascade
, custom_field_id integer not null references custom_fields(id) on delete cascade
, value text not null
, primary key (transaction_id, custom_field_id)
);

create table tags (
  id integer primary key
, name text not null
, color text not null
, is_deleted integer not null default 0
);

create table sparzwecke (
  id integer primary key
, name text not null
, color text not null
, target_cents integer check (target_cents > 0) -- optionaler zielbetrag
, sort_order integer not null default 0
, is_deleted integer not null default 0
);

create table transactions (
  id integer primary key
, asset_id integer not null references assets(id) on delete cascade
, booking_date text not null
, counterparty text not null
, purpose text
, amount_cents integer not null -- vorzeichenbehaftet
, source text not null check (source in ('import', 'manual')) -- import: kernfelder gesperrt
, external_id text -- buchungs-id der bank, falls vorhanden (upsert-schlüssel)
, extra_fields_json text -- optionale bankfelder (transaction_type, card_payment_at, cash_withdrawal_at,
                          -- recipient_name, recipient_iban, recipient_bic, recipient_account_number,
                          -- description, bank_category, bank_subcategory, bank_account_label) – auge-icon in der ui
, fingerprint text not null -- normalisiert: datum|betrag|empfänger (duplikat-/metadaten-matching)
, import_id integer references imports(id) on delete set null
, category_id integer references categories(id) on delete set null
, categorization_source text not null default 'none' check (categorization_source in ('none', 'manual', 'rule', 'contract'))
, applied_rule_id integer references rules(id) on delete set null
, is_reviewed integer not null default 1 -- 0 = "ungeprüft"-marker
, is_transfer integer not null default 0
, transfer_pair_id integer references transactions(id) on delete set null
, transfer_status text check (transfer_status in ('suggested', 'confirmed')) -- null wenn kein transfer
, is_saving integer not null default 0
, sparzweck_id integer references sparzwecke(id) on delete set null
, exclude_from_stats integer not null default 0
, contract_id integer references contracts(id) on delete set null
, recurring_payment_id integer references recurring_payments(id) on delete set null
, is_deleted integer not null default 0
, created_at text not null default (datetime('now'))
, check (contract_id is null or recurring_payment_id is null) -- exklusiv
);
create index idx_tx_asset_date on transactions(asset_id, booking_date);
create index idx_tx_category on transactions(category_id);
create index idx_tx_fingerprint on transactions(asset_id, fingerprint);
create index idx_tx_external on transactions(asset_id, external_id);

-- schema-hook ohne v1-ui (splits)
create table transaction_splits (
  id integer primary key
, transaction_id integer not null references transactions(id) on delete cascade
, amount_cents integer not null check (amount_cents != 0)
, category_id integer not null references categories(id) on delete restrict
, note text
);

create table transaction_tags (
  transaction_id integer not null references transactions(id) on delete cascade
, tag_id integer not null references tags(id) on delete cascade
, primary key (transaction_id, tag_id)
);

create table rules (
  id integer primary key
, priority integer not null unique -- global; kleinste zahl wird zuerst geprüft, erste treffende regel gewinnt
, category_id integer references categories(id) on delete cascade -- aktion: kategorie
, tag_id integer references tags(id) on delete set null -- aktion: tag
, mark_as_transfer integer not null default 0 -- aktion: transfer
, mark_as_saving integer not null default 0 -- aktion: sparen
, sparzweck_id integer references sparzwecke(id) on delete set null
, created_at text not null default (datetime('now'))
, is_deleted integer not null default 0
, check (category_id is not null or tag_id is not null or mark_as_transfer = 1 or mark_as_saving = 1) -- min. eine aktion
);

create table rule_conditions (
  id integer primary key
, rule_id integer not null references rules(id) on delete cascade
, field text not null check (field in ('purpose', 'counterparty', 'amount', 'asset'))
, operator text not null check (operator in ('contains', 'equals', 'approx')) -- approx (±5 %) nur field=amount
, value text not null
);

create table contracts (
  id integer primary key
, name text not null
, current_amount_cents integer not null
, previous_amount_cents integer -- gesetzt bei preisänderung
, interval text not null check (interval in ('monthly', 'yearly', 'irregular'))
, status text not null check (status in ('detected', 'confirmed', 'price_changed', 'paused', 'ended'))
, category_id integer references categories(id) on delete set null
, detection_method text
, detected_at text not null default (datetime('now'))
, is_dismissed integer not null default 0 -- getrennt: muster wird nicht erneut vorgeschlagen
, is_deleted integer not null default 0
);

create table recurring_payments (
  id integer primary key
, name text not null -- generiert, umbenennbar
, typical_amount_cents integer not null -- gleitender durchschnitt
, detected_at text not null default (datetime('now'))
, is_dismissed integer not null default 0
, is_deleted integer not null default 0
);

-- unterdrückte transfer-muster (nach "trennen" nicht erneut vorschlagen)
create table dismissed_transfer_patterns (
  id integer primary key
, asset_id_a integer not null references assets(id) on delete cascade
, asset_id_b integer not null references assets(id) on delete cascade
, amount_cents integer not null
);

create table collections (
  id integer primary key
, name text not null
, is_goal integer not null default 0
, target_cents integer check (target_cents > 0)
, status text not null default 'active' check (status in ('active', 'completed'))
, is_deleted integer not null default 0
, created_at text not null default (datetime('now'))
);

create table collection_transactions (
  collection_id integer not null references collections(id) on delete cascade
, transaction_id integer not null references transactions(id) on delete cascade
, primary key (collection_id, transaction_id)
);

create table budgets (
  id integer primary key
, category_id integer not null unique references categories(id) on delete cascade
, limit_cents integer not null check (limit_cents > 0)
, period_type text not null check (period_type in ('week', 'month', 'quarter', 'year'))
, is_deleted integer not null default 0
);

create table budget_periods (
  id integer primary key
, budget_id integer not null references budgets(id) on delete cascade
, period_start text not null
, period_end text not null
, limit_snapshot_cents integer not null -- limit zum periodenzeitpunkt (historie bleibt unverfälscht)
, spent_cents_frozen integer -- null solange laufend (live berechnet), gefüllt nach abschluss
);

create table steuer_themen (
  id integer primary key
, name text not null
, sort_order integer not null default 0
, is_deleted integer not null default 0
);

create table steuer_thema_categories (
  thema_id integer not null references steuer_themen(id) on delete cascade
, category_id integer not null references categories(id) on delete cascade
, primary key (thema_id, category_id)
);

create table steuer_thema_keywords (
  id integer primary key
, thema_id integer not null references steuer_themen(id) on delete cascade
, keyword text not null -- match (case-insensitive, contains) auf empfänger/zweck
);

create table widgets (
  id text primary key -- fester typ-schlüssel, z. b. 'kpi_income', 'sankey', 'saving_by_purpose'
, is_visible integer not null default 1
, sort_order integer not null
, config_json text -- z. b. personen-vergleich: {"metric":"expenses"}
);

create table import_profiles (
  id integer primary key
, name text not null
, is_builtin integer not null default 0 -- mitgelieferte bankprofile (seed)
, header_fingerprint text -- normalisierte header-zeile zur auto-erkennung
, delimiter text check (delimiter in (',', ';', '\t'))
, encoding text default 'utf-8'
, date_format text -- z. b. 'dd.MM.yyyy'
, decimal_format text check (decimal_format in ('de', 'en')) -- 1.234,56 vs 1,234.56
, column_map_json text not null -- {"date":2,"amount":8,"counterparty":3,"purpose":5,"external_id":7}
, is_deleted integer not null default 0
);

create table imports (
  id integer primary key
, asset_id integer not null references assets(id) on delete cascade
, profile_id integer references import_profiles(id) on delete set null
, filename text not null
, mode text not null check (mode in ('upsert', 'replace_all'))
, status text not null check (status in ('success', 'failed'))
, rows_read integer
, rows_new integer
, rows_updated integer
, rows_skipped integer
, rows_auto_categorized integer
, error_message text
, created_at text not null default (datetime('now'))
);

create table exports (
  id integer primary key
, type text not null check (type in ('backup', 'transactions_csv', 'steuer_csv'))
, period_start text
, period_end text
, created_at text not null default (datetime('now'))
);

create table calculator_scenarios (
  id integer primary key
, calculator_type text not null check (calculator_type in ('fire', 'zinseszins', 'entnahme'))
, name text not null
, inputs_json text not null
, results_json text not null
, created_at text not null default (datetime('now'))
);

create table notifications (
  id integer primary key
, type text not null check (type in (
    'import_reminder', 'balance_mismatch', 'import_failed', 'contract_detected'
  , 'price_change', 'contract_ended', 'transfer_detected', 'budget_80', 'budget_exceeded', 'sparzweck_reached'
  ))
, ref_table text
, ref_id integer
, message text not null
, priority text not null check (priority in ('info', 'warning', 'critical'))
, is_read integer not null default 0
, is_archived integer not null default 0
, created_at text not null default (datetime('now'))
);
create unique index idx_notif_upsert on notifications(type, ref_table, ref_id) where is_archived = 0;

create table history_log (
  id integer primary key
, action_type text not null -- z. b. 'bulk_categorize', 'rule_apply', 'asset_delete', 'reorder_rules'
, description text not null
, payload_json text not null -- daten zur wiederherstellung
, is_undoable integer not null default 1 -- 0 nach fensterablauf (30 tage / 50 aktionen)
, created_at text not null default (datetime('now'))
);
