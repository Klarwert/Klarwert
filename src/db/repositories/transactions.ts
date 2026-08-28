import { getDb, runInTransaction } from "@/db/client";
import type { Transaction, TransactionSource } from "@/db/types";
import { logOperation } from "./operations";

export interface TransactionWithTags extends Transaction {
  tag_ids: number[];
}

export type Tristate = "all" | "only" | "without";

export interface TransactionFilter {
  assetId?: number | null;
  personId?: number | null;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  categoryId?: number | null;
  tagId?: number | null;
  sparzweckId?: number | null;
  amountMin?: number;
  amountMax?: number;
  contract?: Tristate;
  transfer?: Tristate;
  saving?: Tristate;
  reviewed?: Tristate;
  excludedFromStats?: Tristate;
  uncategorized?: Tristate;
  quickUnkategorisiert?: boolean;
  quickUngeprueft?: boolean;
  quickTransfers?: boolean;
  quickSparen?: boolean;
  sortBy?: "booking_date" | "counterparty" | "category_id" | "amount_cents";
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

function tristateClause(column: string, value: Tristate | undefined): string | null {
  if (!value || value === "all") return null;
  if (value === "only") return `${column} = 1`;
  return `(${column} = 0 or ${column} is null)`;
}

function buildWhere(filter: TransactionFilter): { where: string; params: unknown[] } {
  const clauses: string[] = ["t.is_deleted = 0"];
  const params: unknown[] = [];
  let i = 1;

  if (filter.assetId) {
    clauses.push(`t.asset_id = $${i++}`);
    params.push(filter.assetId);
  }
  if (filter.personId) {
    clauses.push(
      `t.asset_id in (select asset_id from asset_owners where person_id = $${i++})`,
    );
    params.push(filter.personId);
  }
  if (filter.dateFrom) {
    clauses.push(`t.booking_date >= $${i++}`);
    params.push(filter.dateFrom);
  }
  if (filter.dateTo) {
    clauses.push(`t.booking_date <= $${i++}`);
    params.push(filter.dateTo);
  }
  if (filter.search) {
    clauses.push(
      `(t.counterparty like $${i} or t.purpose like $${i} or cast(t.amount_cents as text) like $${i} or t.booking_date like $${i})`,
    );
    params.push(`%${filter.search}%`);
    i += 1;
  }
  if (filter.categoryId) {
    clauses.push(`t.category_id = $${i++}`);
    params.push(filter.categoryId);
  }
  if (filter.tagId) {
    clauses.push(
      `t.id in (select transaction_id from transaction_tags where tag_id = $${i++})`,
    );
    params.push(filter.tagId);
  }
  if (filter.sparzweckId) {
    clauses.push(`t.sparzweck_id = $${i++}`);
    params.push(filter.sparzweckId);
  }
  if (filter.amountMin !== undefined) {
    clauses.push(`t.amount_cents >= $${i++}`);
    params.push(filter.amountMin);
  }
  if (filter.amountMax !== undefined) {
    clauses.push(`t.amount_cents <= $${i++}`);
    params.push(filter.amountMax);
  }

  for (const [column, value] of [
    ["t.contract_id is not null", filter.contract] as const,
    ["t.is_transfer", filter.transfer] as const,
    ["t.is_saving", filter.saving] as const,
    ["t.is_reviewed", filter.reviewed] as const,
    ["t.exclude_from_stats", filter.excludedFromStats] as const,
  ]) {
    if (!value || value === "all") continue;
    if (column.includes("is not null")) {
      clauses.push(value === "only" ? column : `not (${column})`);
    } else {
      const clause = tristateClause(column, value);
      if (clause) clauses.push(clause);
    }
  }
  if (filter.uncategorized === "only") {
    clauses.push("t.category_id is null");
  } else if (filter.uncategorized === "without") {
    clauses.push("t.category_id is not null");
  }

  if (filter.quickUnkategorisiert) clauses.push("t.category_id is null");
  if (filter.quickUngeprueft) clauses.push("t.is_reviewed = 0");
  if (filter.quickTransfers) clauses.push("t.is_transfer = 1");
  if (filter.quickSparen) clauses.push("t.is_saving = 1");

  return { where: clauses.join(" and "), params };
}

export async function listTransactions(
  filter: TransactionFilter = {},
): Promise<TransactionWithTags[]> {
  const db = await getDb();
  const { where, params } = buildWhere(filter);
  const sortBy = filter.sortBy ?? "booking_date";
  const sortDir = filter.sortDir ?? "desc";
  const limit = filter.limit ?? 200;
  const offset = filter.offset ?? 0;

  const rows = await db.select<Transaction[]>(
    `select t.* from transactions t where ${where}
     order by t.${sortBy} ${sortDir}, t.id desc
     limit ${limit} offset ${offset}`,
    params,
  );
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const placeholders = ids.map((_, idx) => `$${idx + 1}`).join(", ");
  const tagRows = await db.select<{ transaction_id: number; tag_id: number }[]>(
    `select transaction_id, tag_id from transaction_tags where transaction_id in (${placeholders})`,
    ids,
  );
  const tagsByTx = new Map<number, number[]>();
  for (const r of tagRows) {
    const list = tagsByTx.get(r.transaction_id) ?? [];
    list.push(r.tag_id);
    tagsByTx.set(r.transaction_id, list);
  }
  return rows.map((r) => ({ ...r, tag_ids: tagsByTx.get(r.id) ?? [] }));
}

export async function countTransactions(filter: TransactionFilter = {}): Promise<number> {
  const db = await getDb();
  const { where, params } = buildWhere(filter);
  const rows = await db.select<{ count: number }[]>(
    `select count(*) as count from transactions t where ${where}`,
    params,
  );
  return rows[0]?.count ?? 0;
}

export async function getTransaction(id: number): Promise<TransactionWithTags | null> {
  const db = await getDb();
  const rows = await db.select<Transaction[]>(
    "select * from transactions where id = $1 and is_deleted = 0",
    [id],
  );
  if (!rows[0]) return null;
  const tagRows = await db.select<{ tag_id: number }[]>(
    "select tag_id from transaction_tags where transaction_id = $1",
    [id],
  );
  return { ...rows[0], tag_ids: tagRows.map((r) => r.tag_id) };
}

function normalizeFingerprint(date: string, amountCents: number, counterparty: string): string {
  return `${date}|${amountCents}|${counterparty.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export interface CreateManualTransactionInput {
  asset_id: number;
  booking_date: string;
  counterparty: string;
  purpose?: string | null;
  amount_cents: number;
  category_id?: number | null;
}

export async function createManualTransaction(
  input: CreateManualTransactionInput,
): Promise<number> {
  const db = await getDb();
  const fingerprint = normalizeFingerprint(
    input.booking_date,
    input.amount_cents,
    input.counterparty,
  );
  const result = await db.execute(
    `insert into transactions
      (asset_id, booking_date, counterparty, purpose, amount_cents, source, fingerprint, category_id, categorization_source)
     values ($1, $2, $3, $4, $5, 'manual', $6, $7, $8)`,
    [
      input.asset_id,
      input.booking_date,
      input.counterparty,
      input.purpose ?? null,
      input.amount_cents,
      fingerprint,
      input.category_id ?? null,
      input.category_id ? "manual" : "none",
    ],
  );
  const id = result.lastInsertId as number;
  await logOperation(db, "insert", "transactions", id, { ...input, source: 'manual', fingerprint }, null);
  return id;
}

export interface UpdateTransactionInput {
  category_id?: number | null;
  categorization_source?: Transaction["categorization_source"];
  is_reviewed?: 0 | 1;
  is_transfer?: 0 | 1;
  is_saving?: 0 | 1;
  sparzweck_id?: number | null;
  exclude_from_stats?: 0 | 1;
  booking_date?: string;
  counterparty?: string;
  purpose?: string | null;
  amount_cents?: number;
}

/** Für manuelle Transaktionen alle Felder editierbar; importierte: nur Kategorisierung/Flags (UI erzwingt dies). */
export async function updateTransaction(
  id: number,
  input: UpdateTransactionInput,
): Promise<void> {
  const db = await getDb();
  
  const oldRows = await db.select<any[]>("select * from transactions where id = $1", [id]);
  const oldRow = oldRows[0];
  if (!oldRow) return;

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [key, value] of Object.entries(input)) {
    fields.push(`${key} = $${i}`);
    values.push(value);
    i += 1;
  }
  if (fields.length === 0) return;
  values.push(id);
  await db.execute(`update transactions set ${fields.join(", ")} where id = $${i}`, values);
  await logOperation(db, "update", "transactions", id, input, oldRow);
}

export async function setTransactionTags(id: number, tagIds: number[]): Promise<void> {
  const db = await getDb();
  const oldTags = await db.select<any[]>("select tag_id from transaction_tags where transaction_id = $1", [id]);
  await db.execute("delete from transaction_tags where transaction_id = $1", [id]);
  for (const tagId of tagIds) {
    await db.execute(
      "insert into transaction_tags (transaction_id, tag_id) values ($1, $2)",
      [id, tagId],
    );
  }
  await logOperation(db, "update", "transaction_tags", id, { tagIds }, { tagIds: oldTags.map((r: any) => r.tag_id) });
}

/** Ergänzt (statt ersetzt) einen Tag bei mehreren Transaktionen – für die Bulk-Action-Bar. */
export async function addTagToTransactions(ids: number[], tagId: number): Promise<void> {
  const db = await getDb();
  for (const id of ids) {
    await db.execute(
      "insert or ignore into transaction_tags (transaction_id, tag_id) values ($1, $2)",
      [id, tagId],
    );
  }
}

/** Nur manuelle Transaktionen sind löschbar. */
export async function deleteManualTransaction(id: number): Promise<void> {
  const db = await getDb();
  const oldRows = await db.select<any[]>("select * from transactions where id = $1", [id]);
  if (!oldRows[0]) return;
  await db.execute(
    "update transactions set is_deleted = 1 where id = $1 and source = 'manual'",
    [id],
  );
  await logOperation(db, "delete", "transactions", id, {}, oldRows[0]);
}

export async function bulkUpdate(
  ids: number[],
  input: UpdateTransactionInput,
): Promise<void> {
  if (ids.length === 0) return;
  await runInTransaction(async (db) => {
    const placeholdersQuery = ids.map((_, idx) => `$${idx + 1}`).join(", ");
    const oldRows = await db.select<Transaction[]>(
      `select * from transactions where id in (${placeholdersQuery})`,
      ids
    );

    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const [key, value] of Object.entries(input)) {
      fields.push(`${key} = $${i}`);
      values.push(value);
      i += 1;
    }
    if (fields.length === 0) return;
    const placeholders = ids.map((_, idx) => `$${i + idx}`).join(", ");
    values.push(...ids);
    await db.execute(
      `update transactions set ${fields.join(", ")} where id in (${placeholders})`,
      values,
    );

    for (const row of oldRows) {
      await logOperation(db, "update", "transactions", row.id, input, row);
    }
  });
}

export async function countUncategorized(assetId?: number | null): Promise<number> {
  const db = await getDb();
  const where = assetId
    ? "where is_deleted = 0 and category_id is null and asset_id = $1"
    : "where is_deleted = 0 and category_id is null";
  const rows = await db.select<{ count: number }[]>(
    `select count(*) as count from transactions ${where}`,
    assetId ? [assetId] : [],
  );
  return rows[0]?.count ?? 0;
}

/** Bestätigt ein Transfer-Paar (beide Seiten). */
export async function confirmTransferPair(id: number): Promise<void> {
  await runInTransaction(async (db) => {
    const rows = await db.select<{ transfer_pair_id: number | null }[]>(
      "select transfer_pair_id from transactions where id = $1",
      [id],
    );
    const pairId = rows[0]?.transfer_pair_id;
    const ids = pairId ? [id, pairId] : [id];

    const placeholdersQuery = ids.map((_, i) => `$${i + 1}`).join(", ");
    const oldRows = await db.select<Transaction[]>(
      `select * from transactions where id in (${placeholdersQuery})`,
      ids
    );

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    await db.execute(
      `update transactions set transfer_status = 'confirmed' where id in (${placeholders})`,
      ids,
    );

    for (const row of oldRows) {
      await logOperation(db, "update", "transactions", row.id, { transfer_status: 'confirmed' }, row);
    }
  });
}

/** Trennt ein Transfer-Paar und unterdrückt das Muster künftig (R5). */
export async function dismissTransferPair(id: number): Promise<void> {
  await runInTransaction(async (db) => {
    const rows = await db.select<{ transfer_pair_id: number | null; asset_id: number; amount_cents: number }[]>(
      "select transfer_pair_id, asset_id, amount_cents from transactions where id = $1",
      [id],
    );
    const tx = rows[0];
    if (!tx) return;
    const ids = tx.transfer_pair_id ? [id, tx.transfer_pair_id] : [id];

    const placeholdersQuery = ids.map((_, i) => `$${i + 1}`).join(", ");
    const oldRows = await db.select<Transaction[]>(
      `select * from transactions where id in (${placeholdersQuery})`,
      ids
    );

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    await db.execute(
      `update transactions set is_transfer = 0, transfer_pair_id = null, transfer_status = null where id in (${placeholders})`,
      ids,
    );

    for (const row of oldRows) {
      await logOperation(db, "update", "transactions", row.id, { is_transfer: 0, transfer_pair_id: null, transfer_status: null }, row);
    }

    if (tx.transfer_pair_id) {
      const pairRows = await db.select<{ asset_id: number }[]>(
        "select asset_id from transactions where id = $1",
        [tx.transfer_pair_id],
      );
      const otherAssetId = pairRows[0]?.asset_id;
      if (otherAssetId !== undefined) {
        await db.execute(
          "insert into dismissed_transfer_patterns (asset_id_a, asset_id_b, amount_cents) values ($1, $2, $3)",
          [tx.asset_id, otherAssetId, tx.amount_cents],
        );
      }
    }
  });
}

export { normalizeFingerprint };
export type { TransactionSource };
