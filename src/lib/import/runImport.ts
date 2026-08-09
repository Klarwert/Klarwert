import { getDb, runInTransaction } from "@/db/client";
import type Database from "@tauri-apps/plugin-sql";
import { runPipelineForTransactions } from "@/lib/pipeline";
import { detectRecurringPatterns } from "@/lib/contractDetection";
import { detectOwnAccountSuggestions } from "@/lib/ownAccountDetection";
import { normalizeFingerprint } from "@/db/repositories/transactions";
import { createImportRecord } from "@/db/repositories/imports";
import { addValueHistoryEntry, getAnchor } from "@/db/repositories/valueHistory";
import { parseAmountWithFormat, parseDecimalString } from "@/lib/money";
import { parseDateWithFormat, parseGermanDateToIso, parseIsoDate, isoDayBefore, todayIso } from "@/lib/dates";
import { EXTRA_FIELD_ROLES, type ColumnRole } from "@/lib/import/bankProfiles";
import type { ImportMode } from "@/db/types";

export interface RunImportInput {
  assetId: number;
  filename: string;
  profileId: number | null;
  headers: string[];
  rows: string[][];
  roleToIndex: Partial<Record<ColumnRole, number>>;
  roleByColumn?: Record<number, ColumnRole | "keep" | "ignore">;
  dataTypeByColumn?: Record<number, string>;
  extractCounterpartyFromPurpose?: boolean;
  dateFormat: string;
  decimalFormat: "de" | "en";
  mode: ImportMode;
  /** Cents; null wenn "Weiß ich gerade nicht" bzw. bei Folge-Import nicht angegeben. */
  currentBalanceInput: number | null;
  /** Mehrkonten-Datei: nur Zeilen importieren, deren bank_account_label diesem Wert entspricht. */
  bankAccountLabelFilter?: string | null;
  /**
   * Gestufte Änderungserkennung (Import-Architektur v2, 2.4): bei gleichem external_id wird Text
   * (counterparty/purpose) immer stillschweigend aktualisiert. Ein abweichender Betrag wird nur
   * übernommen, wenn dieses Flag true ist – der Aufrufer (Wizard) fragt vorher per Sammel-Dialog
   * nach (siehe detectAmountChanges), ein reiner Textunterschied löst diese Rückfrage nie aus.
   * Default true, damit bestehende Aufrufer ohne Vorab-Check ihr bisheriges Verhalten behalten.
   */
  applyAmountChanges?: boolean;
  /**
   * Progress-Callback: wird pro Phase aufgerufen.
   * phase: 'reading' | 'saving' | 'pipeline' | 'finalizing'
   */
  onProgress?: (phase: "reading" | "saving" | "pipeline" | "finalizing", done: number, total: number) => void;
}

export interface RunImportResult {
  status: "success" | "failed";
  rowsRead: number;
  rowsNew: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsAutoCategorized: number;
  transfersFound: number;
  rowsIgnoredOtherAccount: number;
  lostMetadataCount: number;
  balanceUnconfirmed: boolean;
  balanceMismatchCents: number | null;
  errorMessage?: string;
}

export interface ParsedRow {
  booking_date: string;
  value_date: string | null;
  counterparty: string;
  purpose: string | null;
  amount_cents: number;
  external_id: string | null;
  fingerprint: string;
  extra_fields_json: string | null;
}

const COMDIRECT_PREFIX = /(?:Auftraggeber|Empf[aä]nger):\s*(.+?)(?:\s{2,}|$)/i;

function extractCounterparty(text: string): { counterparty: string; purpose: string } {
  const match = COMDIRECT_PREFIX.exec(text);
  if (match) {
    return { counterparty: match[1].trim(), purpose: text.replace(match[0], "").trim() };
  }
  return { counterparty: text, purpose: text };
}

const BOOLEAN_TRUE = new Set(["ja", "yes", "true", "1", "wahr"]);
const BOOLEAN_FALSE = new Set(["nein", "no", "false", "0", "falsch"]);
const DATE_ONLY = /^(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})$/;
const DATE_TIME = /^(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})([ T])(\d{2}:\d{2}(:\d{2})?)/;

/**
 * Formatiert den Rohwert einer als "Extra-Feld" mitgenommenen Spalte gemäß dem im Wizard gewählten
 * (oder automatisch erkannten) Datentyp – sonst hätte die Datentyp-Auswahl im Mapping-Schritt keine
 * Wirkung. Bei Parse-Fehlern wird der unveränderte Rohwert übernommen, statt die Zeile zu verwerfen.
 */
export function formatExtraFieldValue(rawValue: string, dataType: string | undefined): string {
  if (!dataType || dataType === "text") return rawValue;
  try {
    switch (dataType) {
      case "integer": {
        const cleaned = rawValue.replace(/[.\s]/g, "").replace(",", ".");
        const n = Number.parseFloat(cleaned);
        return Number.isNaN(n) ? rawValue : String(Math.round(n));
      }
      case "decimal": {
        const n = parseDecimalString(rawValue);
        return String(n);
      }
      case "boolean": {
        const lower = rawValue.trim().toLowerCase();
        if (BOOLEAN_TRUE.has(lower)) return "Ja";
        if (BOOLEAN_FALSE.has(lower)) return "Nein";
        return rawValue;
      }
      case "date": {
        const match = DATE_ONLY.exec(rawValue.trim());
        if (!match) return rawValue;
        return match[1].includes(".") ? parseGermanDateToIso(match[1]) : parseIsoDate(match[1]);
      }
      case "datetime": {
        const match = DATE_TIME.exec(rawValue.trim());
        if (!match) return rawValue;
        const isoDate = match[1].includes(".") ? parseGermanDateToIso(match[1]) : parseIsoDate(match[1]);
        return `${isoDate} ${match[3]}`;
      }
      default:
        return rawValue;
    }
  } catch {
    return rawValue;
  }
}

function buildExtraFields(
  row: string[],
  roleToIndex: Partial<Record<ColumnRole, number>>,
  roleByColumn?: Record<number, ColumnRole | "keep" | "ignore">,
  headers?: string[],
  dataTypeByColumn?: Record<number, string>,
): string | null {
  const entries: [string, string][] = [];
  for (const role of EXTRA_FIELD_ROLES) {
    const idx = roleToIndex[role];
    if (idx === undefined) continue;
    const value = (row[idx] ?? "").trim();
    if (value) entries.push([role, value]);
  }

  if (roleByColumn && headers) {
    for (const [colStr, role] of Object.entries(roleByColumn)) {
      if (role === "keep") {
        const idx = Number(colStr);
        const value = (row[idx] ?? "").trim();
        const key = headers[idx] || `Spalte_${idx}`;
        if (value) entries.push([key, formatExtraFieldValue(value, dataTypeByColumn?.[idx])]);
      }
    }
  }

  return entries.length > 0 ? JSON.stringify(Object.fromEntries(entries)) : null;
}

/** Distinkte Werte der Kontoname-Spalte, um Mehrkonten-Dateien (z. B. C24) zu erkennen. */
export function detectBankAccountLabels(
  rows: string[][],
  roleToIndex: Partial<Record<ColumnRole, number>>,
): string[] {
  const idx = roleToIndex.bank_account_label;
  if (idx === undefined) return [];
  const values = new Set<string>();
  for (const row of rows) {
    const v = (row[idx] ?? "").trim();
    if (v) values.add(v);
  }
  return [...values];
}

export function parseRows(input: RunImportInput): { parsed: ParsedRow[]; skipped: number; ignoredOtherAccount: number } {
  const { roleToIndex, rows, dateFormat, decimalFormat, extractCounterpartyFromPurpose } = input;
  const parsed: ParsedRow[] = [];
  let skipped = 0;
  let ignoredOtherAccount = 0;

  for (const row of rows) {
    if (input.bankAccountLabelFilter && roleToIndex.bank_account_label !== undefined) {
      const label = (row[roleToIndex.bank_account_label] ?? "").trim();
      if (label !== input.bankAccountLabelFilter) {
        ignoredOtherAccount += 1;
        continue;
      }
    }
    try {
      const dateIdx = roleToIndex.date;
      const amountIdx = roleToIndex.amount;
      // Mindest-Anforderung: Datum + Betrag + (Empfänger ODER richtungsabhängige Rollen)
      if (dateIdx === undefined || amountIdx === undefined) {
        skipped += 1;
        continue;
      }

      const booking_date = parseDateWithFormat(row[dateIdx], dateFormat);
      const value_date =
        roleToIndex.value_date !== undefined && row[roleToIndex.value_date]
          ? parseDateWithFormat(row[roleToIndex.value_date], dateFormat)
          : null;
      const amount_cents = parseAmountWithFormat(row[amountIdx], decimalFormat);

      // Richtungsabhängige Empfänger-Spalte (Punkt 7 / Product Spec Kap. 6):
      // Betrag < 0 → counterparty_outgoing; Betrag > 0 → counterparty_incoming.
      // Wenn nur eine Rolle gesetzt ist, gilt sie unabhängig vom Vorzeichen.
      let counterparty: string;
      const outgoingIdx = roleToIndex.counterparty_outgoing;
      const incomingIdx = roleToIndex.counterparty_incoming;
      const counterpartyIdx = roleToIndex.counterparty;

      if (outgoingIdx !== undefined && incomingIdx !== undefined) {
        // Beide Rollen gesetzt → richtungsabhängig mit Fallback
        counterparty = amount_cents < 0
          ? ((row[outgoingIdx] ?? "").trim() || (row[incomingIdx] ?? "").trim())
          : ((row[incomingIdx] ?? "").trim() || (row[outgoingIdx] ?? "").trim());
      } else if (outgoingIdx !== undefined) {
        counterparty = (row[outgoingIdx] ?? "").trim();
      } else if (incomingIdx !== undefined) {
        counterparty = (row[incomingIdx] ?? "").trim();
      } else if (counterpartyIdx !== undefined) {
        counterparty = (row[counterpartyIdx] ?? "").trim();
      } else {
        skipped += 1;
        continue;
      }

      let purpose =
        roleToIndex.purpose !== undefined ? (row[roleToIndex.purpose] ?? "").trim() : null;

      if (extractCounterpartyFromPurpose && purpose) {
        const extracted = extractCounterparty(purpose);
        counterparty = extracted.counterparty || counterparty;
        purpose = extracted.purpose;
      }

      if (!counterparty) {
        skipped += 1;
        continue;
      }

      const external_id =
        roleToIndex.external_id !== undefined
          ? (row[roleToIndex.external_id] ?? "").trim() || null
          : null;

      parsed.push({
        booking_date,
        value_date,
        counterparty,
        purpose: purpose || null,
        amount_cents,
        external_id,
        fingerprint: normalizeFingerprint(booking_date, amount_cents, counterparty),
        extra_fields_json: buildExtraFields(row, roleToIndex, input.roleByColumn, input.headers, input.dataTypeByColumn),
      });
    } catch {
      skipped += 1;
    }
  }

  return { parsed, skipped, ignoredOtherAccount };
}

export interface AmountChange {
  external_id: string;
  booking_date: string;
  counterparty: string;
  oldAmountCents: number;
  newAmountCents: number;
}

/**
 * Read-only-Vorabprüfung (außerhalb jeder Transaktion): welche Zeilen dieser Datei würden bei
 * `mode='upsert'` denselben external_id treffen, aber mit einem abweichenden Betrag? Der Wizard
 * ruft dies vor dem eigentlichen Import auf, um bei Treffern den Sammel-Dialog zu zeigen (2.4).
 * Reine Textabweichungen lösen hier bewusst nichts aus – die Funktion prüft nur den Betrag.
 */
export async function detectAmountChanges(assetId: number, parsed: ParsedRow[]): Promise<AmountChange[]> {
  const withExternalId = parsed.filter((r) => r.external_id);
  if (withExternalId.length === 0) return [];
  const db = await getDb();
  const changes: AmountChange[] = [];
  for (const row of withExternalId) {
    const existing = await db.select<{ amount_cents: number }[]>(
      "select amount_cents from transactions where asset_id = $1 and external_id = $2 and source = 'import'",
      [assetId, row.external_id],
    );
    if (existing.length > 0 && existing[0].amount_cents !== row.amount_cents) {
      changes.push({
        external_id: row.external_id!,
        booking_date: row.booking_date,
        counterparty: row.counterparty,
        oldAmountCents: existing[0].amount_cents,
        newAmountCents: row.amount_cents,
      });
    }
  }
  return changes;
}

interface AccountImportOutcome {
  rowsNew: number;
  rowsUpdated: number;
  rowsSkipped: number;
  lostMetadataCount: number;
  balanceUnconfirmed: boolean;
  balanceMismatchCents: number | null;
  newlyInsertedIds: number[];
  pipelineResult: { categorized: number; transfersFound: number };
}

/**
 * Importiert bereits geparste Zeilen für EIN Konto auf einer bereits offenen Transaktion/Connection
 * (`db`). Öffnet selbst kein eigenes BEGIN/COMMIT (CLAUDE.md Transaktions-Disziplin) – der Aufrufer
 * (runImport für Einzelkonto, runMultiAccountImport für Mehrkonten-Dateien) umschließt den kompletten
 * Durchlauf mit genau einer äußeren Transaktion.
 */
async function importAccountRows(
  db: Database,
  assetId: number,
  profileId: number | null,
  mode: ImportMode,
  currentBalanceInput: number | null,
  parsed: ParsedRow[],
  onProgress?: RunImportInput["onProgress"],
  applyAmountChanges = true,
): Promise<AccountImportOutcome> {
  let rowsNew = 0;
  let rowsUpdated = 0;
  let rowsSkipped = 0;
  let lostMetadataCount = 0;
  const newlyInsertedIds: number[] = [];

  const anchorBefore = await getAnchor(assetId);
  const isFirstImport = !anchorBefore;

  onProgress?.("saving", 0, parsed.length);

  if (mode === "replace_all") {
    interface Preserved {
      category_id: number | null;
      categorization_source: string;
      is_reviewed: 0 | 1;
      is_saving: 0 | 1;
      sparzweck_id: number | null;
      exclude_from_stats: 0 | 1;
      tag_ids: number[];
    }
    const existing = await db.select<
      {
        id: number;
        fingerprint: string;
        category_id: number | null;
        categorization_source: string;
        is_reviewed: 0 | 1;
        is_saving: 0 | 1;
        sparzweck_id: number | null;
        exclude_from_stats: 0 | 1;
      }[]
    >(
      "select id, fingerprint, category_id, categorization_source, is_reviewed, is_saving, sparzweck_id, exclude_from_stats from transactions where asset_id = $1 and source = 'import'",
      [assetId],
    );
    const preserved = new Map<string, Preserved>();
    for (const row of existing) {
      const tagRows = await db.select<{ tag_id: number }[]>(
        "select tag_id from transaction_tags where transaction_id = $1",
        [row.id],
      );
      preserved.set(row.fingerprint, { ...row, tag_ids: tagRows.map((t) => t.tag_id) });
    }

    await db.execute("delete from transactions where asset_id = $1 and source = 'import'", [assetId]);

    const matchedFingerprints = new Set<string>();
    const CHUNK = 200;
    for (let ci = 0; ci < parsed.length; ci += CHUNK) {
      const chunk = parsed.slice(ci, ci + CHUNK);
      for (const row of chunk) {
        const meta = preserved.get(row.fingerprint);
        if (meta) matchedFingerprints.add(row.fingerprint);
        const insertResult = await db.execute(
          `insert into transactions
            (asset_id, booking_date, value_date, counterparty, purpose, amount_cents, source, external_id, fingerprint, extra_fields_json, category_id, categorization_source, is_reviewed, is_saving, sparzweck_id, exclude_from_stats)
           values ($1, $2, $3, $4, $5, $6, 'import', $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            assetId,
            row.booking_date,
            row.value_date,
            row.counterparty,
            row.purpose,
            row.amount_cents,
            row.external_id,
            row.fingerprint,
            row.extra_fields_json,
            meta?.category_id ?? null,
            meta?.categorization_source ?? "none",
            meta?.is_reviewed ?? 1,
            meta?.is_saving ?? 0,
            meta?.sparzweck_id ?? null,
            meta?.exclude_from_stats ?? 0,
          ],
        );
        const newId = insertResult.lastInsertId as number;
        if (meta) {
          if (meta.tag_ids.length > 0) {
            const tagPlaceholders = meta.tag_ids.map((_, k) => `($1, $${k + 2})`).join(", ");
            await db.execute(
              `insert into transaction_tags (transaction_id, tag_id) values ${tagPlaceholders}`,
              [newId, ...meta.tag_ids],
            );
          }
        } else {
          newlyInsertedIds.push(newId);
        }
        rowsNew += 1;
      }
      onProgress?.("saving", Math.min(ci + CHUNK, parsed.length), parsed.length);
    }
    lostMetadataCount = preserved.size - matchedFingerprints.size;
  } else {
    // Upsert-Modus
    const CHUNK = 200;
    for (let ci = 0; ci < parsed.length; ci += CHUNK) {
      const chunk = parsed.slice(ci, ci + CHUNK);
      for (const row of chunk) {
        let existingId: number | null = null;
        let existingRow: {
          booking_date: string;
          value_date: string | null;
          counterparty: string;
          purpose: string | null;
          amount_cents: number;
          extra_fields_json: string | null;
        } | null = null;
        if (row.external_id) {
          const rows = await db.select<
            { id: number; booking_date: string; value_date: string | null; counterparty: string; purpose: string | null; amount_cents: number; extra_fields_json: string | null }[]
          >(
            "select id, booking_date, value_date, counterparty, purpose, amount_cents, extra_fields_json from transactions where asset_id = $1 and external_id = $2 and source = 'import'",
            [assetId, row.external_id],
          );
          existingId = rows[0]?.id ?? null;
          existingRow = rows[0] ?? null;
        } else {
          const rows = await db.select<{ id: number }[]>(
            "select id from transactions where asset_id = $1 and fingerprint = $2 and source = 'import'",
            [assetId, row.fingerprint],
          );
          existingId = rows[0]?.id ?? null;
        }

        if (existingId) {
          if (row.external_id && existingRow) {
            // Betrag nur übernehmen, wenn unverändert ODER der Nutzer die Sammel-Rückfrage bestätigt
            // hat (Import-Architektur v2, 2.4) – reiner Textunterschied wird immer stillschweigend
            // übernommen, ein abweichender Betrag ohne Bestätigung bleibt unangetastet (inkl. fingerprint,
            // der den Betrag encodiert).
            const amountUnchanged = existingRow.amount_cents === row.amount_cents;
            const textChanged =
              existingRow.booking_date !== row.booking_date ||
              existingRow.value_date !== row.value_date ||
              existingRow.counterparty !== row.counterparty ||
              existingRow.purpose !== row.purpose ||
              existingRow.extra_fields_json !== row.extra_fields_json;
            const willApplyAmountChange = !amountUnchanged && applyAmountChanges;

            // Nichts hat sich tatsächlich geändert -> kein Update, kein irreführendes "N aktualisiert"
            // beim erneuten Import derselben, unveränderten Datei.
            if (textChanged || willApplyAmountChange) {
              if (amountUnchanged || applyAmountChanges) {
                await db.execute(
                  `update transactions set booking_date = $1, value_date = $2, counterparty = $3, purpose = $4, amount_cents = $5, fingerprint = $6, extra_fields_json = $7
                   where id = $8`,
                  [
                    row.booking_date,
                    row.value_date,
                    row.counterparty,
                    row.purpose,
                    row.amount_cents,
                    row.fingerprint,
                    row.extra_fields_json,
                    existingId,
                  ],
                );
              } else {
                await db.execute(
                  `update transactions set booking_date = $1, value_date = $2, counterparty = $3, purpose = $4, extra_fields_json = $5
                   where id = $6`,
                  [row.booking_date, row.value_date, row.counterparty, row.purpose, row.extra_fields_json, existingId],
                );
              }
              rowsUpdated += 1;
            }
          } else {
            rowsSkipped += 1;
          }
        } else {
          const insertResult = await db.execute(
            `insert into transactions
              (asset_id, booking_date, value_date, counterparty, purpose, amount_cents, source, external_id, fingerprint, extra_fields_json)
             values ($1, $2, $3, $4, $5, $6, 'import', $7, $8, $9)`,
            [
              assetId,
              row.booking_date,
              row.value_date,
              row.counterparty,
              row.purpose,
              row.amount_cents,
              row.external_id,
              row.fingerprint,
              row.extra_fields_json,
            ],
          );
          newlyInsertedIds.push(insertResult.lastInsertId as number);
          rowsNew += 1;
        }
      }
      onProgress?.("saving", Math.min(ci + CHUNK, parsed.length), parsed.length);
    }
  }

  // Phase C: Kategorisierungs-Pipeline + Contract-Erkennung (innerhalb der Transaktion!)
  onProgress?.("pipeline", 0, 1);
  const pipelineResult = await runPipelineForTransactions(newlyInsertedIds, db);
  await detectRecurringPatterns(assetId, db);
  await detectOwnAccountSuggestions(db);
  onProgress?.("pipeline", 1, 1);

  // Kontostand-Verifikation
  let balanceUnconfirmed = false;
  let balanceMismatchCents: number | null = null;

  if (isFirstImport) {
    if (currentBalanceInput !== null) {
      const sumImported = parsed.reduce((s, r) => s + r.amount_cents, 0);
      const anchorValue = currentBalanceInput - sumImported;
      const earliestDate = parsed.reduce(
        (min, r) => (r.booking_date < min ? r.booking_date : min),
        parsed[0]?.booking_date ?? todayIso(),
      );
      await addValueHistoryEntry({
        asset_id: assetId,
        valued_at: isoDayBefore(earliestDate),
        value_cents: anchorValue,
        source: "anchor",
      });
      await db.execute("update assets set last_confirmed_balance_cents = $1 where id = $2", [
        currentBalanceInput,
        assetId,
      ]);
    } else {
      balanceUnconfirmed = true;
    }
  } else if (currentBalanceInput !== null) {
    const totalRows = await db.select<{ total: number | null }[]>(
      "select sum(amount_cents) as total from transactions where asset_id = $1 and is_deleted = 0",
      [assetId],
    );
    const anchorValue = anchorBefore?.value_cents ?? 0;
    const computed = anchorValue + (totalRows[0]?.total ?? 0);
    const diff = computed - currentBalanceInput;
    if (Math.abs(diff) >= 1) balanceMismatchCents = diff;
    await db.execute("update assets set last_confirmed_balance_cents = $1 where id = $2", [
      currentBalanceInput,
      assetId,
    ]);
  }

  await db.execute(
    "update assets set last_import_at = $1, import_profile_id = coalesce($2, import_profile_id) where id = $3",
    [new Date().toISOString(), profileId, assetId],
  );

  return {
    rowsNew,
    rowsUpdated,
    rowsSkipped,
    lostMetadataCount,
    balanceUnconfirmed,
    balanceMismatchCents,
    newlyInsertedIds,
    pipelineResult,
  };
}

export async function runImport(input: RunImportInput): Promise<RunImportResult> {
  const { onProgress } = input;

  // Phase A: Zeilen parsen (synchron, sehr schnell)
  onProgress?.("reading", 0, 1);
  const { parsed, skipped: parseSkipped, ignoredOtherAccount } = parseRows(input);
  onProgress?.("reading", 1, 1);

  try {
    // Phase B + C + D laufen als EINE Datenbank-Transaktion (CLAUDE.md Transaktions-Disziplin):
    // BEGIN ganz am Anfang, COMMIT ganz am Ende, ROLLBACK im Catch.
    const outcome = await runInTransaction((db) =>
      importAccountRows(
        db,
        input.assetId,
        input.profileId,
        input.mode,
        input.currentBalanceInput,
        parsed,
        onProgress,
        input.applyAmountChanges ?? true,
      ),
    );
    const result = { ...outcome, rowsSkipped: outcome.rowsSkipped + parseSkipped };

    // Phase D: Import-Protokoll (außerhalb der Transaktion – unkritisch, darf schief gehen)
    onProgress?.("finalizing", 0, 1);
    await createImportRecord({
      asset_id: input.assetId,
      profile_id: input.profileId,
      filename: input.filename,
      mode: input.mode,
      status: "success",
      rows_read: input.rows.length,
      rows_new: result.rowsNew,
      rows_updated: result.rowsUpdated,
      rows_skipped: result.rowsSkipped,
      rows_auto_categorized: result.pipelineResult.categorized,
    });
    onProgress?.("finalizing", 1, 1);

    return {
      status: "success" as const,
      rowsRead: input.rows.length,
      rowsNew: result.rowsNew,
      rowsUpdated: result.rowsUpdated,
      rowsSkipped: result.rowsSkipped,
      rowsAutoCategorized: result.pipelineResult.categorized,
      transfersFound: result.pipelineResult.transfersFound,
      rowsIgnoredOtherAccount: ignoredOtherAccount,
      lostMetadataCount: result.lostMetadataCount,
      balanceUnconfirmed: result.balanceUnconfirmed,
      balanceMismatchCents: result.balanceMismatchCents,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? `${e.message}` : String(e);
    try {
      await createImportRecord({
        asset_id: input.assetId,
        profile_id: input.profileId,
        filename: input.filename,
        mode: input.mode,
        status: "failed",
        error_message: errorMessage,
      });
    } catch { /* Import-Protokoll-Fehler nicht weiterwerfen */ }
    return {
      status: "failed",
      rowsRead: input.rows.length,
      rowsNew: 0,
      rowsUpdated: 0,
      rowsSkipped: 0,
      rowsAutoCategorized: 0,
      transfersFound: 0,
      rowsIgnoredOtherAccount: 0,
      lostMetadataCount: 0,
      balanceUnconfirmed: false,
      balanceMismatchCents: null,
      // Originale Fehlermeldung der DB/des Parsers, nicht generisch (CLAUDE.md Fehlermeldungen)
      errorMessage,
    };
  }
}

export interface MultiAccountImportInput {
  filename: string;
  profileId: number;
  headers: string[];
  rows: string[][];
  roleToIndex: Partial<Record<ColumnRole, number>>;
  roleByColumn?: Record<number, ColumnRole | "keep" | "ignore">;
  dataTypeByColumn?: Record<number, string>;
  extractCounterpartyFromPurpose?: boolean;
  dateFormat: string;
  decimalFormat: "de" | "en";
  mode: ImportMode;
  /** Spaltenindex der Kontokennung (Kontoname/Kontonummer laut Bank-Export). */
  accountColumnIndex: number;
  /** Kontokennungs-Wert (aus der Datei) -> Klarwert-Konto-ID, siehe import_profile_account_map. */
  accountMap: Record<string, number>;
  /** Optional: manuell bestätigter Kontostand je Konto (nur relevant beim jeweiligen Erstimport). */
  currentBalanceInputByAsset?: Record<number, number | null>;
  /** Siehe RunImportInput.applyAmountChanges – gilt hier für alle Kontogruppen gemeinsam. */
  applyAmountChanges?: boolean;
  onProgress?: (phase: "reading" | "saving" | "pipeline" | "finalizing", done: number, total: number) => void;
}

export interface MultiAccountImportAccountResult {
  assetId: number;
  label: string;
  rowsRead: number;
  rowsNew: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsAutoCategorized: number;
  transfersFound: number;
  balanceUnconfirmed: boolean;
  balanceMismatchCents: number | null;
}

export interface MultiAccountImportResult {
  status: "success" | "failed";
  perAccount: MultiAccountImportAccountResult[];
  rowsIgnoredUnmapped: number;
  errorMessage?: string;
}

/**
 * Importiert eine Mehrkonten-Datei (z. B. C24-Export mit mehreren Unterkonten in einer Datei) in
 * EINEM Durchlauf: Zeilen werden nach der Kontokennungs-Spalte gruppiert, jede Gruppe läuft durch
 * dieselbe Pro-Konto-Logik wie ein Einzelkonto-Import (Löschen bei "Komplett neu laden" + Einfügen +
 * Pipeline + Kontostand-Verifikation) – alles innerhalb EINER äußeren Transaktion (CLAUDE.md
 * Transaktions-Disziplin, kein verschachteltes BEGIN/COMMIT). Jede Kontogruppe erzeugt danach eine
 * eigene Zeile in `imports` mit dem jeweiligen `asset_id`.
 */
/** Wie detectAmountChanges, aber über alle Kontogruppen einer Mehrkonten-Datei hinweg. */
export async function detectAmountChangesMultiAccount(input: MultiAccountImportInput): Promise<AmountChange[]> {
  const rowsByLabel = new Map<string, string[][]>();
  for (const row of input.rows) {
    const label = (row[input.accountColumnIndex] ?? "").trim();
    const assetId = label ? input.accountMap[label] : undefined;
    if (!label || assetId === undefined) continue;
    const list = rowsByLabel.get(label) ?? [];
    list.push(row);
    rowsByLabel.set(label, list);
  }
  const allChanges: AmountChange[] = [];
  for (const [label, groupRows] of rowsByLabel) {
    const assetId = input.accountMap[label];
    const { parsed } = parseRows({
      assetId,
      filename: input.filename,
      profileId: input.profileId,
      headers: input.headers,
      rows: groupRows,
      roleToIndex: input.roleToIndex,
      roleByColumn: input.roleByColumn,
      dataTypeByColumn: input.dataTypeByColumn,
      extractCounterpartyFromPurpose: input.extractCounterpartyFromPurpose,
      dateFormat: input.dateFormat,
      decimalFormat: input.decimalFormat,
      mode: input.mode,
      currentBalanceInput: null,
    });
    allChanges.push(...(await detectAmountChanges(assetId, parsed)));
  }
  return allChanges;
}

export async function runMultiAccountImport(input: MultiAccountImportInput): Promise<MultiAccountImportResult> {
  const { onProgress } = input;

  const rowsByLabel = new Map<string, string[][]>();
  let rowsIgnoredUnmapped = 0;
  for (const row of input.rows) {
    const label = (row[input.accountColumnIndex] ?? "").trim();
    const assetId = label ? input.accountMap[label] : undefined;
    if (!label || assetId === undefined) {
      rowsIgnoredUnmapped += 1;
      continue;
    }
    const list = rowsByLabel.get(label) ?? [];
    list.push(row);
    rowsByLabel.set(label, list);
  }

  const groups = [...rowsByLabel.entries()];
  const perAccount: MultiAccountImportAccountResult[] = [];

  try {
    await runInTransaction(async (db) => {
      for (const [label, groupRows] of groups) {
        const assetId = input.accountMap[label];
        const { parsed, skipped } = parseRows({
          assetId,
          filename: input.filename,
          profileId: input.profileId,
          headers: input.headers,
          rows: groupRows,
          roleToIndex: input.roleToIndex,
          roleByColumn: input.roleByColumn,
      dataTypeByColumn: input.dataTypeByColumn,
          extractCounterpartyFromPurpose: input.extractCounterpartyFromPurpose,
          dateFormat: input.dateFormat,
          decimalFormat: input.decimalFormat,
          mode: input.mode,
          currentBalanceInput: null,
        });
        const currentBalanceInput = input.currentBalanceInputByAsset?.[assetId] ?? null;
        const outcome = await importAccountRows(
          db,
          assetId,
          input.profileId,
          input.mode,
          currentBalanceInput,
          parsed,
          onProgress,
          input.applyAmountChanges ?? true,
        );
        perAccount.push({
          assetId,
          label,
          rowsRead: groupRows.length,
          rowsNew: outcome.rowsNew,
          rowsUpdated: outcome.rowsUpdated,
          rowsSkipped: outcome.rowsSkipped + skipped,
          rowsAutoCategorized: outcome.pipelineResult.categorized,
          transfersFound: outcome.pipelineResult.transfersFound,
          balanceUnconfirmed: outcome.balanceUnconfirmed,
          balanceMismatchCents: outcome.balanceMismatchCents,
        });
      }
    });

    onProgress?.("finalizing", 0, 1);
    for (const acc of perAccount) {
      await createImportRecord({
        asset_id: acc.assetId,
        profile_id: input.profileId,
        filename: input.filename,
        mode: input.mode,
        status: "success",
        rows_read: acc.rowsRead,
        rows_new: acc.rowsNew,
        rows_updated: acc.rowsUpdated,
        rows_skipped: acc.rowsSkipped,
        rows_auto_categorized: acc.rowsAutoCategorized,
      });
    }
    onProgress?.("finalizing", 1, 1);

    return { status: "success", perAccount, rowsIgnoredUnmapped };
  } catch (e) {
    const errorMessage = e instanceof Error ? `${e.message}` : String(e);
    for (const assetId of new Set(Object.values(input.accountMap))) {
      try {
        await createImportRecord({
          asset_id: assetId,
          profile_id: input.profileId,
          filename: input.filename,
          mode: input.mode,
          status: "failed",
          error_message: errorMessage,
        });
      } catch { /* Import-Protokoll-Fehler nicht weiterwerfen */ }
    }
    return { status: "failed", perAccount: [], rowsIgnoredUnmapped, errorMessage };
  }
}
