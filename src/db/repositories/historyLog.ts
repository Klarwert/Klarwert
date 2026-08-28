import { getDb } from "@/db/client";
import type { HistoryLogEntry } from "@/db/types";

const HISTORY_WINDOW_DAYS = 30;
const HISTORY_WINDOW_MAX_ACTIONS = 50;

/**
 * Architektur-Hinweis: Zwei parallele Logging-Systeme
 *
 * history_log (diese Datei):
 *   - Nutzer-orientiertes Undo-System (Product Spec 5.6, R11)
 *   - Deckt Soft-Delete-Operationen für Categories, Rules, Tags, Collections ab
 *   - 30-Tage / 50-Aktionen-Fenster für is_undoable
 *   - Vom AktionsLog im UI lesbar und anzeigbar
 *
 * operations (operations.ts / operations-Tabelle):
 *   - Technischer Audit-Trail auf Datenbank-Ebene (für zukünftiges Undo/Replay)
 *   - Erfasst insert/update/delete auf beliebigen Tabellen inkl. inverser Payload
 *   - Kein UI-Zugriff geplant (nur für Developer/Debug/Undo-Infrastruktur)
 *   - Grundlage für das langfristige „Undo anything"-Feature
 *
 * Beide Systeme bleiben parallel, da sie unterschiedliche Granularität und Zielgruppen haben.
 */

/** Tabellen, für die generisches Soft-Delete-Undo (is_deleted = 0 zurücksetzen) sicher ist. */
const SOFT_DELETE_TABLES = new Set(["categories", "rules", "tags", "collections"]);


export async function addHistoryEntry(input: {
  action_type: string;
  description: string;
  payload: unknown;
}): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "insert into history_log (action_type, description, payload_json) values ($1, $2, $3)",
    [input.action_type, input.description, JSON.stringify(input.payload)],
  );
  return result.lastInsertId as number;
}

/** Löscht (soft) eine Zeile in einer der SOFT_DELETE_TABLES und protokolliert einen rückgängig machbaren Verlaufseintrag. */
export async function logSoftDelete(table: string, id: number, description: string): Promise<void> {
  if (!SOFT_DELETE_TABLES.has(table)) {
    throw new Error(`logSoftDelete: Tabelle "${table}" ist nicht für generisches Undo freigegeben`);
  }
  await addHistoryEntry({ action_type: "soft_delete", description, payload: { table, id } });
}

export async function undoSoftDelete(payload: { table: string; id: number }): Promise<void> {
  if (!SOFT_DELETE_TABLES.has(payload.table)) {
    throw new Error(`undoSoftDelete: Tabelle "${payload.table}" ist nicht für generisches Undo freigegeben`);
  }
  const db = await getDb();
  await db.execute(`update ${payload.table} set is_deleted = 0 where id = $1`, [payload.id]);
}

/**
 * Setzt `is_undoable = 0` für Einträge außerhalb des 30-Tage/50-Aktionen-Fensters
 * (Product Spec 5.6, R11) – läuft bei jedem Abruf des Verlaufs.
 */
async function enforceHistoryWindow(): Promise<void> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - HISTORY_WINDOW_DAYS * 86_400_000).toISOString();
  await db.execute("update history_log set is_undoable = 0 where is_undoable = 1 and created_at < $1", [cutoff]);

  const recent = await db.select<{ id: number }[]>(
    "select id from history_log where is_undoable = 1 order by created_at desc",
  );
  const staleIds = recent.slice(HISTORY_WINDOW_MAX_ACTIONS).map((r) => r.id);
  if (staleIds.length > 0) {
    const placeholders = staleIds.map((_, i) => `$${i + 1}`).join(", ");
    await db.execute(`update history_log set is_undoable = 0 where id in (${placeholders})`, staleIds);
  }
}

export async function listHistory(limit = 50): Promise<HistoryLogEntry[]> {
  await enforceHistoryWindow();
  const db = await getDb();
  return db.select<HistoryLogEntry[]>(
    "select * from history_log order by created_at desc limit $1",
    [limit],
  );
}

export async function markNotUndoable(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("update history_log set is_undoable = 0 where id = $1", [id]);
}

export async function getHistoryEntry(id: number): Promise<HistoryLogEntry | null> {
  const db = await getDb();
  const rows = await db.select<HistoryLogEntry[]>("select * from history_log where id = $1", [id]);
  return rows[0] ?? null;
}
