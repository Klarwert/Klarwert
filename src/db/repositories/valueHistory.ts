import { getDb } from "@/db/client";
import type { ValueHistoryEntry, ValueHistorySource } from "@/db/types";

export async function listValueHistory(assetId: number): Promise<ValueHistoryEntry[]> {
  const db = await getDb();
  return db.select<ValueHistoryEntry[]>(
    "select * from value_history where asset_id = $1 order by valued_at asc, id asc",
    [assetId],
  );
}

export async function addValueHistoryEntry(input: {
  asset_id: number;
  valued_at: string;
  value_cents: number;
  source: ValueHistorySource;
}): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `insert into value_history (asset_id, valued_at, value_cents, source)
     values ($1, $2, $3, $4)`,
    [input.asset_id, input.valued_at, input.value_cents, input.source],
  );
  return result.lastInsertId as number;
}

/** Aktueller Wertstand (letzter Historien-Eintrag) für ein Asset, oder null. */
export async function getLatestValue(assetId: number): Promise<ValueHistoryEntry | null> {
  const db = await getDb();
  const rows = await db.select<ValueHistoryEntry[]>(
    "select * from value_history where asset_id = $1 order by valued_at desc, id desc limit 1",
    [assetId],
  );
  return rows[0] ?? null;
}

/** Anker-Eintrag (Erstimport-Startsaldo), falls vorhanden. */
export async function getAnchor(assetId: number): Promise<ValueHistoryEntry | null> {
  const db = await getDb();
  const rows = await db.select<ValueHistoryEntry[]>(
    "select * from value_history where asset_id = $1 and source = 'anchor' order by valued_at asc limit 1",
    [assetId],
  );
  return rows[0] ?? null;
}
