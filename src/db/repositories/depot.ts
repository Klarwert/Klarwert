import { getDb, runInTransaction } from "@/db/client";
import type { DepotPosition, DepotPrice } from "@/db/types";
import { logOperation } from "@/db/repositories/operations";

export async function listDepotPositions(assetId: number): Promise<DepotPosition[]> {
  const db = await getDb();
  return db.select<DepotPosition[]>(
    `SELECT * FROM depot_positions WHERE asset_id = $1 ORDER BY name ASC`,
    [assetId]
  );
}

export async function createDepotPosition(
  assetId: number,
  isin: string,
  name: string,
  sharesAmount: string,
  purchasePriceCents: number,
  currency = "EUR"
): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO depot_positions (asset_id, isin, name, shares_amount, purchase_price_cents, currency)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [assetId, isin, name, sharesAmount, purchasePriceCents, currency]
  );
  return res.lastInsertId as number;
}

export async function updateDepotPosition(
  id: number,
  isin: string,
  name: string,
  sharesAmount: string,
  purchasePriceCents: number,
  currency = "EUR"
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE depot_positions 
     SET isin = $1, name = $2, shares_amount = $3, purchase_price_cents = $4, currency = $5, updated_at = datetime('now')
     WHERE id = $6`,
    [isin, name, sharesAmount, purchasePriceCents, currency, id]
  );
}

export async function deleteDepotPosition(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM depot_positions WHERE id = $1`, [id]);
}

export async function listPricesForIsin(isin: string): Promise<DepotPrice[]> {
  const db = await getDb();
  return db.select<DepotPrice[]>(
    `SELECT * FROM depot_prices WHERE isin = $1 ORDER BY date_str DESC`,
    [isin]
  );
}

export async function upsertDepotPrice(
  isin: string,
  dateStr: string,
  priceCents: number,
  currency = "EUR",
  source: "manual" | "auto" = "manual"
): Promise<void> {
  await runInTransaction(async (db) => {
    // Vorherigen Preis für den Audit-Trail laden (falls vorhanden)
    const existing = await db.select<{ price_cents: number; currency: string; source: string }[]>(
      `SELECT price_cents, currency, source FROM depot_prices WHERE isin = $1 AND date_str = $2 LIMIT 1`,
      [isin, dateStr]
    );

    const res = await db.execute(
      `INSERT INTO depot_prices (isin, date_str, price_cents, currency, source)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(isin, date_str) DO UPDATE SET price_cents = excluded.price_cents, currency = excluded.currency, source = excluded.source`,
      [isin, dateStr, priceCents, currency, source]
    );

    // Audit-Trail nur bei tatsächlicher Änderung (neuer Eintrag oder Kursänderung)
    const isNew = existing.length === 0;
    const changed = !isNew && existing[0].price_cents !== priceCents;
    if (isNew || changed) {
      const entityId = isNew ? (res.lastInsertId as number) : -1; // -1 = Update (keine neue ID)
      await logOperation(
        db,
        isNew ? "insert" : "update",
        "depot_prices",
        entityId,
        { isin, date_str: dateStr, price_cents: priceCents, currency, source },
        isNew ? null : { isin, date_str: dateStr, price_cents: existing[0].price_cents, currency: existing[0].currency, source: existing[0].source }
      );
    }
  });
}
