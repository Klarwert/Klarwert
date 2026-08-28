import { getDb } from "@/db/client";
import type { Collection } from "@/db/types";
import type { TransactionWithTags } from "@/db/repositories/transactions";

export async function listCollections(): Promise<Collection[]> {
  const db = await getDb();
  return db.select<Collection[]>(
    "select * from collections where is_deleted = 0 order by status asc, created_at desc",
  );
}

export async function createCollection(input: {
  name: string;
  is_goal: boolean;
  target_cents: number | null;
  status: "active" | "completed";
}): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "insert into collections (name, is_goal, target_cents, status) values ($1, $2, $3, $4)",
    [input.name, input.is_goal ? 1 : 0, input.target_cents, input.status],
  );
  return result.lastInsertId as number;
}

export async function updateCollection(
  id: number,
  input: { name?: string; is_goal?: boolean; target_cents?: number | null; status?: "active" | "completed" },
): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (input.name !== undefined) {
    fields.push(`name = $${i++}`);
    values.push(input.name);
  }
  if (input.is_goal !== undefined) {
    fields.push(`is_goal = $${i++}`);
    values.push(input.is_goal ? 1 : 0);
  }
  if (input.target_cents !== undefined) {
    fields.push(`target_cents = $${i++}`);
    values.push(input.target_cents);
  }
  if (input.status !== undefined) {
    fields.push(`status = $${i++}`);
    values.push(input.status);
  }
  if (fields.length === 0) return;
  values.push(id);
  await db.execute(`update collections set ${fields.join(", ")} where id = $${i}`, values);
}

/** Löschen entfernt nur die Sammlung selbst – zugeordnete Transaktionen bleiben unverändert. */
export async function deleteCollection(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("update collections set is_deleted = 1 where id = $1", [id]);
}

export async function restoreCollection(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("update collections set is_deleted = 0 where id = $1", [id]);
}

export async function getCollectionSummary(id: number): Promise<{ sumCents: number; count: number }> {
  const db = await getDb();
  const rows = await db.select<{ sum: number | null; count: number }[]>(
    `select sum(t.amount_cents) as sum, count(*) as count from collection_transactions ct
     join transactions t on t.id = ct.transaction_id and t.is_deleted = 0
     where ct.collection_id = $1`,
    [id],
  );
  return { sumCents: rows[0]?.sum ?? 0, count: rows[0]?.count ?? 0 };
}

export async function getCollectionTransactions(id: number): Promise<TransactionWithTags[]> {
  const db = await getDb();
  const rows = await db.select<TransactionWithTags[]>(
    `select t.* from transactions t
     join collection_transactions ct on ct.transaction_id = t.id
     where ct.collection_id = $1 and t.is_deleted = 0
     order by t.booking_date desc`,
    [id],
  );
  return rows.map((r) => ({ ...r, tag_ids: [] }));
}

export async function removeTransactionFromCollection(collectionId: number, transactionId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "delete from collection_transactions where collection_id = $1 and transaction_id = $2",
    [collectionId, transactionId],
  );
}

export interface BulkAddCandidate {
  id: number;
  booking_date: string;
  counterparty: string;
  amount_cents: number;
  category_id: number | null;
  alreadyIncluded: boolean;
}

export const BULK_ADD_MAX_RESULTS = 500;

/**
 * Stufe 1 der zweistufigen Sammlungs-Zuordnung (Product Spec 4.5): liefert die Kandidaten-Zeilen
 * für Stufe 2 (Checkbox-Liste), inkl. Markierung bereits enthaltener Transaktionen.
 * Ergebnis wird auf BULK_ADD_MAX_RESULTS begrenzt (neueste zuerst) – der Aufrufer zeigt bei
 * Überschreitung einen Hinweis an, statt still abzuschneiden.
 */
export async function previewBulkAdd(
  collectionId: number,
  dateFrom: string,
  dateTo: string,
  assetId?: number | null,
  includeCategoryIds: number[] = [],
  excludeCategoryIds: number[] = [],
): Promise<{ candidates: BulkAddCandidate[]; totalMatches: number }> {
  const db = await getDb();
  const clauses = ["is_deleted = 0", "booking_date >= $1", "booking_date <= $2"];
  const params: unknown[] = [dateFrom, dateTo];
  let i = 3;
  if (assetId) {
    clauses.push(`asset_id = $${i++}`);
    params.push(assetId);
  }
  if (includeCategoryIds.length > 0) {
    clauses.push(`category_id in (${includeCategoryIds.map(() => `$${i++}`).join(", ")})`);
    params.push(...includeCategoryIds);
  }
  if (excludeCategoryIds.length > 0) {
    clauses.push(`(category_id is null or category_id not in (${excludeCategoryIds.map(() => `$${i++}`).join(", ")}))`);
    params.push(...excludeCategoryIds);
  }
  const where = clauses.join(" and ");

  const totalRows = await db.select<{ count: number }[]>(
    `select count(*) as count from transactions where ${where}`,
    params,
  );
  const totalMatches = totalRows[0]?.count ?? 0;

  const matches = await db.select<
    { id: number; booking_date: string; counterparty: string; amount_cents: number; category_id: number | null }[]
  >(
    `select id, booking_date, counterparty, amount_cents, category_id from transactions
     where ${where} order by booking_date desc limit ${BULK_ADD_MAX_RESULTS}`,
    params,
  );
  if (matches.length === 0) return { candidates: [], totalMatches: 0 };

  const ids = matches.map((m) => m.id);
  const placeholders = ids.map((_, idx) => `$${idx + 2}`).join(", ");
  const existing = await db.select<{ transaction_id: number }[]>(
    `select transaction_id from collection_transactions where collection_id = $1 and transaction_id in (${placeholders})`,
    [collectionId, ...ids],
  );
  const existingIds = new Set(existing.map((e) => e.transaction_id));

  return {
    candidates: matches.map((m) => ({ ...m, alreadyIncluded: existingIds.has(m.id) })),
    totalMatches,
  };
}

export async function addTransactionsToCollection(collectionId: number, transactionIds: number[]): Promise<void> {
  const db = await getDb();
  for (const txId of transactionIds) {
    await db.execute(
      "insert or ignore into collection_transactions (collection_id, transaction_id) values ($1, $2)",
      [collectionId, txId],
    );
  }
}

/** Returns the IDs of all active collections that contain this transaction. */
export async function getTransactionCollectionIds(transactionId: number): Promise<number[]> {
  const db = await getDb();
  const rows = await db.select<{ collection_id: number }[]>(
    `select ct.collection_id from collection_transactions ct
     join collections c on c.id = ct.collection_id
     where ct.transaction_id = $1 and c.is_deleted = 0`,
    [transactionId],
  );
  return rows.map((r) => r.collection_id);
}
