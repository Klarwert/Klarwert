import { getDb } from "@/db/client";
import { generateRuleForContract } from "@/db/repositories/contracts";
import type { RecurringPayment } from "@/db/types";

export async function listRecurringPayments(): Promise<RecurringPayment[]> {
  const db = await getDb();
  return db.select<RecurringPayment[]>(
    "select * from recurring_payments where is_deleted = 0 and is_dismissed = 0 order by detected_at desc",
  );
}

export async function renameRecurringPayment(id: number, name: string): Promise<void> {
  const db = await getDb();
  await db.execute("update recurring_payments set name = $1 where id = $2", [name, id]);
}

export async function updateRecurringPaymentCategory(id: number, categoryId: number | null): Promise<void> {
  const db = await getDb();
  await db.execute("update recurring_payments set category_id = $1 where id = $2", [categoryId, id]);
}

export async function dismissRecurringPayment(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("update recurring_payments set is_dismissed = 1 where id = $1", [id]);
}

/** Hochstufen: erzeugt bestätigten Vertrag, übernimmt Transaktionen, löscht den wiederkehrenden-Zahlungs-Eintrag. */
export async function upgradeToContract(id: number, categoryId: number | null): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ name: string; typical_amount_cents: number }[]>(
    "select name, typical_amount_cents from recurring_payments where id = $1",
    [id],
  );
  const payment = rows[0];
  if (!payment) throw new Error("Wiederkehrende Zahlung nicht gefunden");

  const result = await db.execute(
    `insert into contracts (name, current_amount_cents, interval, status, category_id, detection_method)
     values ($1, $2, 'monthly', 'confirmed', $3, 'manual_upgrade')`,
    [payment.name, payment.typical_amount_cents, categoryId],
  );
  const contractId = result.lastInsertId as number;
  await db.execute(
    "update transactions set contract_id = $1, recurring_payment_id = null, category_id = coalesce($2, category_id) where recurring_payment_id = $3",
    [contractId, categoryId, id],
  );
  await db.execute("update recurring_payments set is_deleted = 1 where id = $1", [id]);
  
  await generateRuleForContract(contractId);
  return contractId;
}

export async function getRecentTransactionsForRecurringPayment(id: number, limit = 10) {
  const db = await getDb();
  return db.select<{ id: number; booking_date: string; amount_cents: number; counterparty: string }[]>(
    "select id, booking_date, amount_cents, counterparty from transactions where recurring_payment_id = $1 and is_deleted = 0 order by booking_date desc limit $2",
    [id, limit],
  );
}
