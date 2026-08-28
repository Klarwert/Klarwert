import type Database from "@tauri-apps/plugin-sql";
import { getCurrentBatchId } from "@/db/client";

/**
 * Protokolliert eine Datenbankänderung in der `operations`-Tabelle.
 * Dient als Grundlage für ein zukünftiges Undo-System.
 *
 * @param db Die Datenbank-Instanz (innerhalb einer Transaktion).
 * @param opType 'insert', 'update' oder 'delete'.
 * @param entityTable Der Name der betroffenen Tabelle.
 * @param entityId Die ID des betroffenen Eintrags.
 * @param payload Die neuen Werte als Objekt (wird zu JSON). Bei 'delete' leer lassen.
 * @param inversePayload Die vorherigen Werte (für Undo). Bei 'insert' null.
 */
export async function logOperation(
  db: Database,
  opType: "insert" | "update" | "delete",
  entityTable: string,
  entityId: number,
  payload: unknown,
  inversePayload: unknown
): Promise<void> {
  const batchId = getCurrentBatchId();
  await db.execute(
    `insert into operations (op_type, entity_table, entity_id, payload_json, inverse_payload_json, batch_id)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      opType,
      entityTable,
      entityId,
      payload ? JSON.stringify(payload) : "{}",
      inversePayload ? JSON.stringify(inversePayload) : null,
      batchId,
    ]
  );
}
