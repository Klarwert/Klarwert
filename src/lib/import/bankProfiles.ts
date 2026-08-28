import { computeHeaderFingerprint } from "@/lib/import/fingerprint";
import { createImportProfile, updateImportProfile, listImportProfiles } from "@/db/repositories/importProfiles";

export type ColumnRole =
  | "date"
  | "value_date"
  | "amount"
  | "counterparty"
  | "counterparty_incoming"
  | "counterparty_outgoing"
  | "purpose"
  | "external_id"
  | "transaction_type"
  | "card_payment_at"
  | "cash_withdrawal_at"
  | "recipient_iban"
  | "recipient_bic"
  | "recipient_account_number"
  | "description"
  | "bank_category"
  | "bank_subcategory"
  | "bank_account_label";

export const EXTRA_FIELD_ROLES: ColumnRole[] = [
  "value_date",
  "transaction_type",
  "card_payment_at",
  "cash_withdrawal_at",
  "recipient_iban",
  "recipient_bic",
  "recipient_account_number",
  "description",
  "bank_category",
  "bank_subcategory",
  "bank_account_label",
];

export type ColumnMap = Partial<Record<ColumnRole, string>>;

/** Deutsche Klartext-Bezeichnungen für die Bank-Vorlagen-Verwaltung (nicht-technische Nutzer). */
export const COLUMN_ROLE_LABELS: Record<ColumnRole, string> = {
  date: "Datum (Buchungstag)",
  value_date: "Wertstellungsdatum",
  amount: "Betrag",
  counterparty: "Empfänger/Zahlungspflichtiger",
  counterparty_incoming: "Empfänger (bei Eingang)",
  counterparty_outgoing: "Empfänger (bei Ausgang)",
  purpose: "Verwendungszweck",
  external_id: "Externe Buchungs-ID",
  transaction_type: "Umsatztyp",
  card_payment_at: "Datum Karteneinsatz",
  cash_withdrawal_at: "Datum Bargeldabhebung",
  recipient_iban: "IBAN",
  recipient_bic: "BIC",
  recipient_account_number: "Kontonummer",
  description: "Beschreibung",
  bank_category: "Kategorie (von der Bank)",
  bank_subcategory: "Unterkategorie (von der Bank)",
  bank_account_label: "Kontobezeichnung",
};

export const ALL_COLUMN_ROLES: ColumnRole[] = [
  "date",
  "amount",
  "counterparty",
  "purpose",
  "external_id",
  "value_date",
  "counterparty_incoming",
  "counterparty_outgoing",
  "transaction_type",
  "card_payment_at",
  "cash_withdrawal_at",
  "recipient_iban",
  "recipient_bic",
  "recipient_account_number",
  "description",
  "bank_category",
  "bank_subcategory",
  "bank_account_label",
];

export interface BuiltinBankProfile {
  name: string;
  delimiter: "," | ";" | "\t";
  encoding: string;
  dateFormat: string;
  decimalFormat: "de" | "en";
  headers: string[];
  columnMap: ColumnMap;
  /** comdirect: Empfänger steckt im Buchungstext, wird per Präfix-Parser extrahiert. */
  extractCounterpartyFromPurpose?: boolean;
  /** DKB/C24: alle Spalten der Datei standardmäßig als Extra-Feld importieren, statt nur die Kernrollen. */
  importAllColumns?: boolean;
}

export const BUILTIN_BANK_PROFILES: BuiltinBankProfile[] = [
  {
    name: "Sparkasse (CSV-CAMT)",
    delimiter: ";",
    encoding: "windows-1252",
    dateFormat: "dd.MM.yy",
    decimalFormat: "de",
    headers: [
      "Buchungstag",
      "Betrag",
      "Beguenstigter/Zahlungspflichtiger",
      "Verwendungszweck",
      "Kundenreferenz (End-to-End)",
    ],
    columnMap: {
      date: "Buchungstag",
      amount: "Betrag",
      counterparty: "Beguenstigter/Zahlungspflichtiger",
      purpose: "Verwendungszweck",
      external_id: "Kundenreferenz (End-to-End)",
    },
  },
  {
    name: "ING",
    delimiter: ";",
    encoding: "windows-1252",
    dateFormat: "dd.MM.yyyy",
    decimalFormat: "de",
    headers: ["Buchung", "Betrag", "Auftraggeber/Empfänger", "Verwendungszweck"],
    columnMap: {
      date: "Buchung",
      amount: "Betrag",
      counterparty: "Auftraggeber/Empfänger",
      purpose: "Verwendungszweck",
    },
  },
  {
    name: "DKB",
    delimiter: ";",
    encoding: "utf-8",
    dateFormat: "dd.MM.yy",
    decimalFormat: "de",
    headers: [
      "Buchungsdatum",
      "Wertstellung",
      "Status",
      "Zahlungspflichtige*r",
      "Zahlungsempfänger*in",
      "Verwendungszweck",
      "Umsatztyp",
      "IBAN",
      "Betrag (€)",
      "Gläubiger-ID",
      "Mandatsreferenz",
      "Kundenreferenz"
    ],
    columnMap: {
      date: "Buchungsdatum",
      value_date: "Wertstellung",
      amount: "Betrag (€)",
      counterparty_incoming: "Zahlungspflichtige*r",
      counterparty_outgoing: "Zahlungsempfänger*in",
      purpose: "Verwendungszweck",
      transaction_type: "Umsatztyp",
      recipient_iban: "IBAN",
      description: "Gläubiger-ID",
      external_id: "Kundenreferenz",
    },
    importAllColumns: true,
  },
  {
    name: "C24",
    delimiter: ",",
    encoding: "utf-8",
    dateFormat: "dd.MM.yyyy",
    decimalFormat: "de",
    headers: [
      "Transaktionstyp",
      "Buchungsdatum",
      "Karteneinsatz",
      "Betrag",
      "Zahlungsempfänger",
      "IBAN",
      "BIC",
      "Verwendungszweck",
      "Beschreibung",
      "Kontonummer",
      "Kontoname",
      "Kategorie",
      "Unterkategorie",
      "Bargeldabhebung"
    ],
    columnMap: {
      date: "Buchungsdatum",
      amount: "Betrag",
      counterparty: "Zahlungsempfänger",
      purpose: "Verwendungszweck",
      transaction_type: "Transaktionstyp",
      card_payment_at: "Karteneinsatz",
      recipient_iban: "IBAN",
      recipient_bic: "BIC",
      description: "Beschreibung",
      recipient_account_number: "Kontonummer",
      bank_account_label: "Kontoname",
      bank_category: "Kategorie",
      bank_subcategory: "Unterkategorie",
      cash_withdrawal_at: "Bargeldabhebung"
    },
    importAllColumns: true,
  },
  {
    name: "comdirect",
    delimiter: ";",
    encoding: "windows-1252",
    dateFormat: "dd.MM.yyyy",
    decimalFormat: "de",
    headers: ["Buchungstag", "Umsatz in EUR", "Buchungstext"],
    columnMap: {
      date: "Buchungstag",
      amount: "Umsatz in EUR",
      purpose: "Buchungstext",
      counterparty: "Buchungstext",
    },
    extractCounterpartyFromPurpose: true,
  },
  {
    name: "Commerzbank",
    delimiter: ";",
    encoding: "windows-1252",
    dateFormat: "dd.MM.yyyy",
    decimalFormat: "de",
    headers: ["Buchungstag", "Betrag", "Buchungstext"],
    columnMap: {
      date: "Buchungstag",
      amount: "Betrag",
      purpose: "Buchungstext",
    },
  },
  {
    name: "Volksbank/GLS (VR)",
    delimiter: ";",
    encoding: "windows-1252",
    dateFormat: "dd.MM.yyyy",
    decimalFormat: "de",
    headers: ["Buchungstag", "Betrag", "Name Zahlungsbeteiligter", "Verwendungszweck"],
    columnMap: {
      date: "Buchungstag",
      amount: "Betrag",
      counterparty: "Name Zahlungsbeteiligter",
      purpose: "Verwendungszweck",
    },
  },
  {
    name: "N26",
    delimiter: ",",
    encoding: "utf-8",
    dateFormat: "yyyy-MM-dd",
    decimalFormat: "en",
    headers: ["Booking Date", "Amount (EUR)", "Partner Name", "Payment Reference"],
    columnMap: {
      date: "Booking Date",
      amount: "Amount (EUR)",
      counterparty: "Partner Name",
      purpose: "Payment Reference",
    },
  },
  {
    name: "Trade Republic",
    delimiter: ";",
    encoding: "utf-8",
    dateFormat: "dd.MM.yyyy",
    decimalFormat: "de",
    headers: ["Datum", "Betrag", "Beschreibung"],
    columnMap: {
      date: "Datum",
      amount: "Betrag",
      purpose: "Beschreibung",
    },
  },
];

let seeded = false;

/** Legt die mitgelieferten Bankprofile beim ersten Start an (idempotent und synchronisiert Aktualisierungen). */
export async function ensureBuiltinBankProfiles(): Promise<void> {
  if (seeded) return;
  const existing = await listImportProfiles();
  const existingMap = new Map(existing.filter((p) => p.is_builtin).map((p) => [p.name, p]));
  for (const profile of BUILTIN_BANK_PROFILES) {
    const found = existingMap.get(profile.name);
    if (!found) {
      await createImportProfile({
        name: profile.name,
        is_builtin: true,
        header_fingerprint: computeHeaderFingerprint(profile.headers),
        delimiter: profile.delimiter,
        encoding: profile.encoding,
        date_format: profile.dateFormat,
        decimal_format: profile.decimalFormat,
        column_map_json: JSON.stringify(profile.columnMap),
        import_all_columns: profile.importAllColumns ?? false,
      });
    } else if (!found.locally_modified) {
      // Nur synchronisieren, solange der Nutzer dieses mitgelieferte Profil nicht selbst über den
      // Import-Wizard bearbeitet hat (siehe locally_modified, Migration 017) – sonst würden App-Updates
      // eine bewusste Nutzer-Korrektur bei jedem Start wieder überschreiben.
      await updateImportProfile(found.id, {
        header_fingerprint: computeHeaderFingerprint(profile.headers),
        delimiter: profile.delimiter,
        encoding: profile.encoding,
        date_format: profile.dateFormat,
        decimal_format: profile.decimalFormat,
        column_map_json: JSON.stringify(profile.columnMap),
        import_all_columns: profile.importAllColumns ?? false,
      });
    }
  }
  seeded = true;
}

