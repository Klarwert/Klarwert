import type { Asset, AccountType, AssetKind, ValuableType } from "@/db/types";
import { getDb } from "@/db/client";
import { logOperation } from "./operations";

export interface AssetWithOwners extends Asset {
  owner_ids: number[];
}

async function attachOwners(db: Awaited<ReturnType<typeof getDb>>, assets: Asset[]): Promise<AssetWithOwners[]> {
  if (assets.length === 0) return [];
  const owners = await db.select<{ asset_id: number; person_id: number }[]>(
    "select asset_id, person_id from asset_owners",
  );
  const byAsset = new Map<number, number[]>();
  for (const o of owners) {
    const list = byAsset.get(o.asset_id) ?? [];
    list.push(o.person_id);
    byAsset.set(o.asset_id, list);
  }
  return assets.map((a) => ({ ...a, owner_ids: byAsset.get(a.id) ?? [] }));
}

export async function listAssets(includeArchived = true): Promise<AssetWithOwners[]> {
  const db = await getDb();
  const where = includeArchived ? "where is_deleted = 0" : "where is_deleted = 0 and is_archived = 0";
  const assets = await db.select<Asset[]>(`select * from assets ${where}`);
  return attachOwners(db, assets);
}

export async function getAsset(id: number): Promise<AssetWithOwners | null> {
  const db = await getDb();
  const rows = await db.select<Asset[]>(
    "select * from assets where id = $1 and is_deleted = 0",
    [id],
  );
  if (rows.length === 0) return null;
  const [withOwners] = await attachOwners(db, rows);
  return withOwners;
}

export interface CreateAssetInput {
  name: string;
  kind: AssetKind;
  account_type?: AccountType | null;
  valuable_type?: ValuableType | null;
  default_sparzweck_id?: number | null;
  iban?: string | null;
  owner_ids: number[];
}

export async function createAsset(input: CreateAssetInput): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `insert into assets (name, kind, account_type, valuable_type, default_sparzweck_id, iban)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      input.name,
      input.kind,
      input.account_type ?? null,
      input.valuable_type ?? null,
      input.default_sparzweck_id ?? null,
      input.iban?.trim().replace(/\s+/g, "").toUpperCase() || null,
    ],
  );
  const assetId = result.lastInsertId as number;
  for (const personId of input.owner_ids) {
    await db.execute(
      "insert into asset_owners (asset_id, person_id) values ($1, $2)",
      [assetId, personId],
    );
  }
  await logOperation(db, "insert", "assets", assetId, input, null);
  return assetId;
}

export interface UpdateAssetInput {
  name?: string;
  account_type?: AccountType | null;
  default_sparzweck_id?: number | null;
  iban?: string | null;
  is_archived?: 0 | 1;
  owner_ids?: number[];
}

export async function updateAsset(id: number, input: UpdateAssetInput): Promise<void> {
  const db = await getDb();
  
  const oldRows = await db.select<Asset[]>("select * from assets where id = $1", [id]);
  const oldRow = oldRows[0];
  if (!oldRow) return;

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if ("iban" in input) {
    input.iban = input.iban?.trim().replace(/\s+/g, "").toUpperCase() || null;
  }
  for (const key of ["name", "account_type", "default_sparzweck_id", "iban", "is_archived"] as const) {
    if (key in input) {
      fields.push(`${key} = $${i}`);
      values.push(input[key]);
      i += 1;
    }
  }
  if (fields.length > 0) {
    values.push(id);
    await db.execute(`update assets set ${fields.join(", ")} where id = $${i}`, values);
  }
  if (input.owner_ids) {
    await db.execute("delete from asset_owners where asset_id = $1", [id]);
    for (const personId of input.owner_ids) {
      await db.execute(
        "insert into asset_owners (asset_id, person_id) values ($1, $2)",
        [id, personId],
      );
    }
  }
  await logOperation(db, "update", "assets", id, input, oldRow);
}

export async function countAssetTransactions(id: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>(
    "select count(*) as count from transactions where asset_id = $1 and is_deleted = 0",
    [id],
  );
  return rows[0]?.count ?? 0;
}

/** Soft-Delete (kaskadiert konzeptionell Transaktionen/Historie via Undo-Fenster, siehe history_log). */
export async function deleteAsset(id: number): Promise<void> {
  const db = await getDb();
  const oldRows = await db.select<Asset[]>("select * from assets where id = $1", [id]);
  if (!oldRows[0]) return;
  await db.execute("update assets set is_deleted = 1 where id = $1", [id]);
  await db.execute("update transactions set is_deleted = 1 where asset_id = $1", [id]);
  await logOperation(db, "delete", "assets", id, {}, oldRows[0]);
}

export async function restoreAsset(id: number): Promise<void> {
  const db = await getDb();
  const oldRows = await db.select<Asset[]>("select * from assets where id = $1", [id]);
  if (!oldRows[0]) return;
  await db.execute("update assets set is_deleted = 0 where id = $1", [id]);
  await db.execute("update transactions set is_deleted = 0 where asset_id = $1", [id]);
  await logOperation(db, "update", "assets", id, { is_deleted: 0 }, oldRows[0]);
}

export async function setLastConfirmedBalance(
  id: number,
  cents: number,
  importedAt: string,
): Promise<void> {
  const db = await getDb();
  const oldRows = await db.select<Asset[]>("select * from assets where id = $1", [id]);
  if (!oldRows[0]) return;
  await db.execute(
    "update assets set last_confirmed_balance_cents = $1, last_import_at = $2 where id = $3",
    [cents, importedAt, id],
  );
  await logOperation(db, "update", "assets", id, { last_confirmed_balance_cents: cents, last_import_at: importedAt }, oldRows[0]);
}
