export type AssetKind = "account" | "valuable";
export type AccountType = "giro" | "tagesgeld" | "kreditkarte" | "depot" | "darlehen";
export type ValuableType = "bausparvertrag" | "bargeld" | "sonstiges";
export type ValueHistorySource = "manual" | "anchor";
export type PersonRole = "adult" | "child";

export interface Person {
  id: number;
  name: string;
  role: PersonRole;
  birth_year: number | null;
  is_active: 0 | 1;
  created_at: string;
  kirchensteuer_aktiv: 0 | 1;
  bundesland: string | null;
}

export interface Sparzweck {
  id: number;
  name: string;
  color: string;
  target_cents: number | null;
  sort_order: number;
  is_deleted: 0 | 1;
}
export type TransactionSource = "import" | "manual";
export type CategorizationSource = "none" | "manual" | "rule" | "contract" | "merchant" | "similarity";
export type TransferStatus = "suggested" | "confirmed" | null;
export type ImportMode = "upsert" | "replace_all";
export type ImportStatus = "success" | "failed";

export type MerchantAliasMatchType = "iban" | "name_exact" | "name_fuzzy" | "regex";
export type CategorizationMatchedBy =
  | "manual"
  | "user_rule"
  | "contract"
  | "transfer"
  | "merchant_iban"
  | "merchant_alias"
  | "similarity"
  | "none";

export interface Merchant {
  id: number;
  canonical_name: string;
  display_name: string;
  default_category_id: number | null;
  source_version: string | null;
  is_builtin: 0 | 1;
  is_active: 0 | 1;
  is_modified: 0 | 1;
}

export interface MerchantAlias {
  id: number;
  merchant_id: number;
  match_type: MerchantAliasMatchType;
  match_value: string;
  priority: number;
}

export interface MerchantSuppression {
  id: number;
  merchant_id: number;
  suppressed_at: string;
}

export interface CategorizationLog {
  id: number;
  transaction_id: number;
  matched_by: CategorizationMatchedBy;
  rule_id: number | null;
  merchant_id: number | null;
  confidence: number;
  applied_at: string;
  alternatives_json: string | null;
}

/** Ein knapp unterlegener Kandidat, der bei der Kategorisierung nicht gewonnen hat (Debug-Anzeige im Drawer). */
export interface CategorizationAlternative {
  matched_by: CategorizationMatchedBy;
  merchant_id?: number | null;
  category_id?: number | null;
  confidence: number;
}

export interface ImportProfile {
  id: number;
  name: string;
  is_builtin: 0 | 1;
  header_fingerprint: string | null;
  delimiter: "," | ";" | "\t" | null;
  encoding: string | null;
  date_format: string | null;
  decimal_format: "de" | "en" | null;
  column_map_json: string;
  source_version?: string | null;
  import_all_columns: 0 | 1;
  account_column_index: number | null;
  locally_modified: 0 | 1;
  is_deleted: 0 | 1;
}

export interface ImportProfileAccountMap {
  id: number;
  import_profile_id: number;
  source_value: string;
  asset_id: number;
}

export interface Asset {
  id: number;
  name: string;
  kind: AssetKind;
  account_type: AccountType | null;
  valuable_type: ValuableType | null;
  default_sparzweck_id: number | null;
  import_profile_id: number | null;
  last_import_at: string | null;
  last_confirmed_balance_cents: number | null;
  iban: string | null;
  is_archived: 0 | 1;
  is_deleted: 0 | 1;
  created_at: string;
}

export interface AssetOwner {
  asset_id: number;
  person_id: number;
}

export interface PersonAlias {
  id: number;
  person_id: number;
  alias: string;
}

export interface ValueHistoryEntry {
  id: number;
  asset_id: number;
  valued_at: string;
  value_cents: number;
  source: ValueHistorySource;
}

export type CategoryDirection = "ausgabe" | "einnahme";

export interface Category {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  direction: CategoryDirection;
  parent_id: number | null;
  is_template: 0 | 1;
  is_system: 0 | 1;
  is_hidden: 0 | 1;
  sort_order: number;
  is_deleted: 0 | 1;
  template_key: string | null;
  aliases?: string[]; // Join on category_aliases
}

export interface Tag {
  id: number;
  name: string;
  color: string;
  is_deleted: 0 | 1;
}

export type RuleField = "purpose" | "counterparty" | "amount" | "asset" | "custom" | "extra_field";
export type RuleOperator = "contains" | "equals" | "approx" | "greater_than" | "less_than" | "between";
export type RuleCreatedFrom = "manual" | "aufraeumen" | "vertrag";

/** Bedingungsgruppen einer Regel sind ODER-verknüpft, siehe klarwert-regelbuilder-erweiterung. */
export interface RuleConditionGroup {
  id: number;
  rule_id: number;
  group_order: number;
}

/** Bedingungen INNERHALB einer Gruppe sind UND-verknüpft. */
export interface RuleCondition {
  id: number;
  group_id: number;
  field: RuleField;
  custom_field_id: number | null;
  /** Gesetzt, wenn field='extra_field': Schlüssel aus transactions.extra_fields_json (Import-Custom-Spalten). */
  extra_field_key: string | null;
  operator: RuleOperator;
  value: string;
  /** Nur bei operator='between' gesetzt (oberes Ende des Bereichs). */
  value_to: string | null;
}

export type CustomFieldDataType = "text" | "integer" | "decimal" | "boolean" | "date" | "datetime";

export interface CustomField {
  id: number;
  name: string;
  data_type: CustomFieldDataType;
  sort_order: number;
  is_deleted: 0 | 1;
}

export interface TransactionCustomValue {
  transaction_id: number;
  custom_field_id: number;
  value: string;
}

export type CollectionStatus = "active" | "completed";

export interface Collection {
  id: number;
  name: string;
  is_goal: 0 | 1;
  target_cents: number | null;
  status: CollectionStatus;
  is_deleted: 0 | 1;
  created_at: string;
}

export type ContractInterval = "monthly" | "quarterly" | "yearly" | "irregular";
export type ContractStatus = "detected" | "confirmed" | "price_changed" | "paused" | "ended";

export interface Contract {
  id: number;
  name: string;
  current_amount_cents: number;
  previous_amount_cents: number | null;
  amount_tolerance_percent: number;
  interval: ContractInterval;
  status: ContractStatus;
  category_id: number | null;
  merchant_id: number | null;
  detection_method: string | null;
  is_manual: 0 | 1;
  confidence: number | null;
  detected_at: string;
  is_dismissed: 0 | 1;
  is_deleted: 0 | 1;
}

export interface RecurringPayment {
  id: number;
  name: string;
  typical_amount_cents: number;
  category_id: number | null;
  detected_at: string;
  is_dismissed: 0 | 1;
  is_deleted: 0 | 1;
}

export interface Rule {
  id: number;
  priority: number;
  category_id: number | null;
  tag_id: number | null;
  mark_as_transfer: 0 | 1;
  mark_as_saving: 0 | 1;
  sparzweck_id: number | null;
  created_from: RuleCreatedFrom;
  source_contract_id: number | null;
  merchant_id: number | null;
  created_at: string;
  is_deleted: 0 | 1;
}

export interface Transaction {
  id: number;
  asset_id: number;
  booking_date: string;
  counterparty: string;
  purpose: string | null;
  amount_cents: number;
  source: TransactionSource;
  external_id: string | null;
  extra_fields_json: string | null;
  custom_values?: Record<number, string>; // custom_field_id -> value
  fingerprint: string;
  import_id: number | null;
  category_id: number | null;
  categorization_source: CategorizationSource;
  applied_rule_id: number | null;
  merchant_id?: number | null;
  categorization_confidence?: number | null;
  is_reviewed: 0 | 1;
  is_transfer: 0 | 1;
  transfer_pair_id: number | null;
  transfer_status: TransferStatus;
  is_saving: 0 | 1;
  sparzweck_id: number | null;
  exclude_from_stats: 0 | 1;
  contract_id: number | null;
  recurring_payment_id: number | null;
  is_deleted: 0 | 1;
  created_at: string;
}

export interface ImportRecord {
  id: number;
  asset_id: number;
  profile_id: number | null;
  filename: string;
  mode: ImportMode;
  status: ImportStatus;
  rows_read: number | null;
  rows_new: number | null;
  rows_updated: number | null;
  rows_skipped: number | null;
  rows_auto_categorized: number | null;
  error_message: string | null;
  created_at: string;
}

export interface HistoryLogEntry {
  id: number;
  action_type: string;
  description: string;
  payload_json: string;
  is_undoable: 0 | 1;
  created_at: string;
}

export type SettingsMap = {
  currency: string;
  import_reminder_days: string;
  kirchensteuer_aktiv: "0" | "1";
  kirchensteuer_satz: "8" | "9";
  onboarding_done: "0" | "1";
  date_display_format: "dd.MM.yyyy" | "yyyy-MM-dd";
  use_rule_templates: "0" | "1";
  rule_templates_migrated_to_merchants: "0" | "1";
  check_updates_on_startup: "0" | "1";
};

export type NotificationType =
  | "import_reminder"
  | "balance_mismatch"
  | "import_failed"
  | "contract_detected"
  | "price_change"
  | "contract_ended"
  | "transfer_detected"
  | "budget_80"
  | "budget_exceeded"
  | "sparzweck_reached"
  | "own_account_suggestion";

export type NotificationPriority = "info" | "warning" | "critical";

export interface NotificationItem {
  id: number;
  type: NotificationType;
  ref_table: string | null;
  ref_id: number | null;
  message: string;
  priority: NotificationPriority;
  is_read: 0 | 1;
  is_archived: 0 | 1;
  created_at: string;
}

