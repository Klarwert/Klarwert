import { getDb } from "@/db/client";
import type { ImportRecord, ImportMode, ImportStatus } from "@/db/types";

export interface CreateImportInput {
  asset_id: number;
  profile_id: number | null;
  filename: string;
  mode: ImportMode;
  status: ImportStatus;
  rows_read?: number;
  rows_new?: number;
  rows_updated?: number;
  rows_skipped?: number;
  rows_auto_categorized?: number;
  error_message?: string | null;
}

export async function createImportRecord(input: CreateImportInput): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `insert into imports
      (asset_id, profile_id, filename, mode, status, rows_read, rows_new, rows_updated, rows_skipped, rows_auto_categorized, error_message)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      input.asset_id,
      input.profile_id,
      input.filename,
      input.mode,
      input.status,
      input.rows_read ?? null,
      input.rows_new ?? null,
      input.rows_updated ?? null,
      input.rows_skipped ?? null,
      input.rows_auto_categorized ?? null,
      input.error_message ?? null,
    ],
  );
  return result.lastInsertId as number;
}

export async function listImportsForAsset(assetId: number): Promise<ImportRecord[]> {
  const db = await getDb();
  return db.select<ImportRecord[]>(
    "select * from imports where asset_id = $1 order by created_at desc",
    [assetId],
  );
}

export async function getLastImport(assetId: number): Promise<ImportRecord | null> {
  const db = await getDb();
  const rows = await db.select<ImportRecord[]>(
    "select * from imports where asset_id = $1 and status = 'success' order by created_at desc limit 1",
    [assetId],
  );
  return rows[0] ?? null;
}
