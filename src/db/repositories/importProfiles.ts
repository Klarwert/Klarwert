import { getDb } from "@/db/client";
import type { ImportProfile, ImportProfileAccountMap } from "@/db/types";
import { z } from "zod";

const ColumnMapSchema = z.record(z.string(), z.string());

export interface ParsedImportProfile extends Omit<ImportProfile, "column_map_json"> {
  column_map_json: Record<string, string>;
}

function parseRow(row: ImportProfile): ParsedImportProfile {
  let parsedMap: Record<string, string> = {};
  try {
    parsedMap = ColumnMapSchema.parse(JSON.parse(row.column_map_json));
  } catch (e) {
    console.warn("Invalid column_map_json in DB for profile", row.id, e);
  }
  return { ...row, column_map_json: parsedMap };
}

export async function listImportProfiles(): Promise<ParsedImportProfile[]> {
  const db = await getDb();
  const rows = await db.select<ImportProfile[]>(
    "select * from import_profiles where is_deleted = 0 order by is_builtin desc, name asc",
  );
  return rows.map(parseRow);
}

export async function findByFingerprint(fingerprint: string): Promise<ParsedImportProfile | null> {
  const db = await getDb();
  // Bei identischen Spaltenüberschriften (z. B. eine unveränderte Kopie eines mitgelieferten
  // Bank-Templates) mehrere Profile mit demselben Fingerprint möglich – die eigene/angepasste
  // Vorlage soll dann Vorrang vor der mitgelieferten haben, sonst wirkt eine Kopie/Bearbeitung
  // beim nächsten Import wie wirkungslos (die Erkennung würde weiterhin das Original treffen).
  const rows = await db.select<ImportProfile[]>(
    "select * from import_profiles where header_fingerprint = $1 and is_deleted = 0 order by is_builtin asc, id desc limit 1",
    [fingerprint],
  );
  return rows[0] ? parseRow(rows[0]) : null;
}

export interface CreateImportProfileInput {
  name: string;
  is_builtin?: boolean;
  header_fingerprint?: string | null;
  delimiter: "," | ";" | "\t";
  encoding?: string;
  date_format?: string;
  decimal_format: "de" | "en";
  column_map_json: string;
  import_all_columns?: boolean;
  account_column_index?: number | null;
  locally_modified?: boolean;
}

export async function createImportProfile(input: CreateImportProfileInput): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `insert into import_profiles
      (name, is_builtin, header_fingerprint, delimiter, encoding, date_format, decimal_format, column_map_json, import_all_columns, account_column_index)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      input.name,
      input.is_builtin ? 1 : 0,
      input.header_fingerprint ?? null,
      input.delimiter,
      input.encoding ?? "utf-8",
      input.date_format ?? null,
      input.decimal_format,
      input.column_map_json,
      input.import_all_columns ? 1 : 0,
      input.account_column_index ?? null,
    ],
  );
  return result.lastInsertId as number;
}

export async function updateImportProfile(
  id: number,
  input: Partial<CreateImportProfileInput>,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `update import_profiles set
      name = coalesce($1, name),
      header_fingerprint = coalesce($2, header_fingerprint),
      delimiter = coalesce($3, delimiter),
      encoding = coalesce($4, encoding),
      date_format = coalesce($5, date_format),
      decimal_format = coalesce($6, decimal_format),
      column_map_json = coalesce($7, column_map_json),
      import_all_columns = coalesce($8, import_all_columns),
      account_column_index = coalesce($9, account_column_index),
      locally_modified = coalesce($10, locally_modified)
     where id = $11`,
    [
      input.name ?? null,
      input.header_fingerprint ?? null,
      input.delimiter ?? null,
      input.encoding ?? null,
      input.date_format ?? null,
      input.decimal_format ?? null,
      input.column_map_json ?? null,
      input.import_all_columns === undefined ? null : (input.import_all_columns ? 1 : 0),
      input.account_column_index ?? null,
      input.locally_modified === undefined ? null : (input.locally_modified ? 1 : 0),
      id,
    ],
  );
}

export async function deleteImportProfile(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("update import_profiles set is_deleted = 1 where id = $1", [id]);
}

/** Kontokennungs-Mapping (Mehrkonto-Dateien, z. B. C24): source_value (z. B. Kontoname/-nummer laut Bank-Export) -> Klarwert-Konto. */
export async function listAccountMapForProfile(profileId: number): Promise<ImportProfileAccountMap[]> {
  const db = await getDb();
  return db.select<ImportProfileAccountMap[]>(
    "select * from import_profile_account_map where import_profile_id = $1",
    [profileId],
  );
}

export async function setAccountMapping(profileId: number, sourceValue: string, assetId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `insert into import_profile_account_map (import_profile_id, source_value, asset_id)
     values ($1, $2, $3)
     on conflict (import_profile_id, source_value) do update set asset_id = excluded.asset_id`,
    [profileId, sourceValue, assetId],
  );
}

