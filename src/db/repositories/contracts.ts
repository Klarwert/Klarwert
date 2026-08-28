import { getDb, runInTransaction } from "@/db/client";
import type { Contract } from "@/db/types";
import { createRule } from "@/db/repositories/rules";

export async function autoArchiveStaleContracts(): Promise<void> {
  const db = await getDb();
  const activeContracts = await db.select<{ id: number; interval: string; detected_at: string }[]>(
    "select id, interval, detected_at from contracts where is_deleted = 0 and current_amount_cents != 0 and status not in ('ended', 'paused')",
  );
  const now = Date.now();
  const FOUR_MONTHS_MS = 120 * 86_400_000; // 4 Monate (120 Tage)

  for (const contract of activeContracts) {
    const recent = await db.select<{ booking_date: string }[]>(
      "select booking_date from transactions where contract_id = $1 and is_deleted = 0 order by booking_date desc limit 1",
      [contract.id],
    );
    let lastDateMs: number | null = null;
    if (recent.length > 0 && recent[0].booking_date) {
      lastDateMs = new Date(`${recent[0].booking_date}T00:00:00`).getTime();
    } else if (contract.detected_at) {
      lastDateMs = new Date(contract.detected_at).getTime();
    }

    let maxMs = FOUR_MONTHS_MS;
    if (contract.interval === "quarterly") maxMs = 180 * 86_400_000;
    if (contract.interval === "yearly") maxMs = 450 * 86_400_000;

    if (lastDateMs && !isNaN(lastDateMs) && now - lastDateMs > maxMs) {
      await db.execute("update contracts set status = 'ended' where id = $1", [contract.id]);
    }
  }
}

export async function listContracts(): Promise<Contract[]> {
  await autoArchiveStaleContracts();
  const db = await getDb();
  return db.select<Contract[]>(
    "select * from contracts where is_deleted = 0 and current_amount_cents != 0 order by detected_at desc",
  );
}

export async function updateContractStatus(id: number, status: Contract["status"]): Promise<void> {
  const db = await getDb();
  if (status === "confirmed") {
    await db.execute(
      "update contracts set status = $1, previous_amount_cents = null where id = $2",
      [status, id],
    );
  } else {
    await db.execute("update contracts set status = $1 where id = $2", [status, id]);
  }
}

export async function updateContract(
  id: number,
  updates: { name?: string; current_amount_cents?: number; interval?: string; category_id?: number | null; status?: Contract["status"] }
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const args: any[] = [];
  let i = 1;
  for (const [key, value] of Object.entries(updates)) {
    sets.push(`${key} = $${i}`);
    args.push(value);
    i++;
  }
  if (sets.length === 0) return;
  args.push(id);
  await db.execute(`update contracts set ${sets.join(", ")} where id = $${i}`, args);
  
  if ("category_id" in updates && updates.category_id !== undefined) {
    await db.execute("update transactions set category_id = $1 where contract_id = $2", [updates.category_id, id]);
  }

  if (updates.status === "confirmed") {
    await generateRuleForContract(id);
  }
}

export async function generateRuleForContract(contractId: number): Promise<void> {
  const db = await getDb();
  const existingRule = await db.select<{ id: number }[]>(
    "select id from rules where source_contract_id = $1 and is_deleted = 0",
    [contractId],
  );
  if (existingRule.length > 0) return;

  const rows = await db.select<{ name: string; category_id: number | null }[]>(
    "select name, category_id from contracts where id = $1",
    [contractId]
  );
  if (rows.length === 0) return;

  const contract = rows[0];
  
  // Try to find the counterparty from a linked transaction
  const txs = await db.select<{ counterparty: string }[]>(
    "select counterparty from transactions where contract_id = $1 order by booking_date desc limit 1",
    [contractId]
  );
  
  const counterparty = txs.length > 0 ? txs[0].counterparty : contract.name;
  
  await createRule(
    [{ field: "counterparty", operator: "contains", value: counterparty }],
    { category_id: contract.category_id, mark_as_saving: false, mark_as_transfer: false, sparzweck_id: null, tag_id: null },
    "vertrag",
    contractId
  );
}

export async function deleteContract(id: number): Promise<void> {
  return runInTransaction(async (tx) => {
    await tx.execute("update contracts set is_deleted = 1 where id = $1", [id]);
    await tx.execute("update transactions set contract_id = null, categorization_source = 'none' where contract_id = $1", [id]);
  });
}

export async function dismissContract(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("update contracts set is_dismissed = 1, status = 'ended' where id = $1", [id]);
}

export async function updateContractCategory(id: number, categoryId: number | null): Promise<void> {
  const db = await getDb();
  await db.execute("update contracts set category_id = $1 where id = $2", [categoryId, id]);
  await db.execute("update transactions set category_id = $1 where contract_id = $2", [categoryId, id]);
}

export async function getRecentTransactionsForContract(contractId: number, limit = 10) {
  const db = await getDb();
  return db.select<{ id: number; booking_date: string; amount_cents: number; counterparty: string }[]>(
    "select id, booking_date, amount_cents, counterparty from transactions where contract_id = $1 and is_deleted = 0 order by booking_date desc limit $2",
    [contractId, limit],
  );
}

export async function createManualContract(name: string, interval: string, categoryId: number | null, transactionIds: number[], currentAmountCents?: number): Promise<number> {
  return runInTransaction(async (tx) => {
    let avgCents = currentAmountCents ?? 0;
    
    if (transactionIds.length > 0 && currentAmountCents === undefined) {
      const rows = await tx.select<{ amount_cents: number }[]>(
        `select amount_cents from transactions where id in (${transactionIds.map((_, i) => `$${i + 1}`).join(",")})`,
        transactionIds
      );
      if (rows.length > 0) {
        avgCents = Math.round(rows.reduce((sum: number, r: { amount_cents: number }) => sum + r.amount_cents, 0) / rows.length);
      }
    }

    const res = await tx.execute(
      `insert into contracts (name, interval, current_amount_cents, status, detected_at, category_id, is_manual)
       values ($1, $2, $3, 'confirmed', current_timestamp, $4, 1)`,
      [name, interval, avgCents, categoryId]
    );
    const contractId = res.lastInsertId as number;

    if (transactionIds.length > 0) {
      const query = categoryId !== null 
        ? `update transactions set contract_id = ?, categorization_source = 'contract', category_id = ? where id in (${transactionIds.map(() => "?").join(",")})`
        : `update transactions set contract_id = ?, categorization_source = 'contract' where id in (${transactionIds.map(() => "?").join(",")})`;
      
      const args = categoryId !== null ? [contractId, categoryId, ...transactionIds] : [contractId, ...transactionIds];
      await tx.execute(query, args);
    }
    return contractId;
  });
}
