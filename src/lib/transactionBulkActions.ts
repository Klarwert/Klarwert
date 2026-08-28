import { getDb } from "@/db/client";
import { bulkUpdate, type UpdateTransactionInput } from "@/db/repositories/transactions";
import { addHistoryEntry } from "@/db/repositories/historyLog";

interface RowSnapshot {
  id: number;
  values: Record<string, unknown>;
}

export interface BulkFieldUpdatePayload {
  fields: string[];
  before: RowSnapshot[];
}

/** Wendet mehrere Felder auf mehrere Transaktionen an, merkt sich den Vorzustand für Undo. */
export async function applyBulkFieldUpdate(
  ids: number[],
  fields: UpdateTransactionInput,
  description: string,
): Promise<number> {
  const db = await getDb();
  const fieldNames = Object.keys(fields);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await db.select<Record<string, unknown>[]>(
    `select id, ${fieldNames.join(", ")} from transactions where id in (${placeholders})`,
    ids,
  );
  const before: RowSnapshot[] = rows.map((r) => ({
    id: r.id as number,
    values: Object.fromEntries(fieldNames.map((f) => [f, r[f]])),
  }));

  await bulkUpdate(ids, fields);

  const payload: BulkFieldUpdatePayload = { fields: fieldNames, before };
  return addHistoryEntry({ action_type: "bulk_field_update", description, payload });
}

export async function undoBulkFieldUpdate(payload: BulkFieldUpdatePayload): Promise<void> {
  for (const snapshot of payload.before) {
    await bulkUpdate([snapshot.id], snapshot.values);
  }
}

export interface BulkJoinAddPayload {
  table: "transaction_tags" | "collection_transactions";
  parentColumn: string;
  childColumn: string;
  rows: { parentId: number; childId: number }[];
}

/** Fügt Zeilen in eine n:n-Tabelle ein (Tag-/Sammlung-Zuweisung) und merkt sich die neu eingefügten für Undo. */
export async function applyBulkJoinAdd(
  table: "transaction_tags" | "collection_transactions",
  parentColumn: string,
  childColumn: string,
  rows: { parentId: number; childId: number }[],
  description: string,
): Promise<number> {
  const db = await getDb();
  const inserted: { parentId: number; childId: number }[] = [];
  for (const row of rows) {
    const existing = await db.select<{ c: number }[]>(
      `select count(*) as c from ${table} where ${parentColumn} = $1 and ${childColumn} = $2`,
      [row.parentId, row.childId],
    );
    if ((existing[0]?.c ?? 0) > 0) continue;
    await db.execute(
      `insert into ${table} (${parentColumn}, ${childColumn}) values ($1, $2)`,
      [row.parentId, row.childId],
    );
    inserted.push(row);
  }
  const payload: BulkJoinAddPayload = { table, parentColumn, childColumn, rows: inserted };
  return addHistoryEntry({ action_type: "bulk_join_add", description, payload });
}

export async function undoBulkJoinAdd(payload: BulkJoinAddPayload): Promise<void> {
  const db = await getDb();
  for (const row of payload.rows) {
    await db.execute(
      `delete from ${payload.table} where ${payload.parentColumn} = $1 and ${payload.childColumn} = $2`,
      [row.parentId, row.childId],
    );
  }
}
