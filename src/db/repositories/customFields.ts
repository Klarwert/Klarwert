import { getDb } from "@/db/client";
import type { CustomField, TransactionCustomValue } from "@/db/types";

export async function listCustomFields(): Promise<CustomField[]> {
  const db = await getDb();
  return db.select<CustomField[]>(`select * from custom_fields order by sort_order asc`);
}

export async function createCustomField(name: string, type: "text" | "number" | "date"): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `insert into custom_fields (name, type, sort_order)
     values ($1, $2, (select coalesce(max(sort_order), 0) + 1 from custom_fields))`,
    [name, type],
  );
  return res.lastInsertId as number;
}

export async function updateCustomField(id: number, name: string): Promise<void> {
  const db = await getDb();
  await db.execute(`update custom_fields set name = $1 where id = $2`, [name, id]);
}

export async function deleteCustomField(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(`delete from custom_fields where id = $1`, [id]);
}

export async function getCustomValuesForTransaction(transactionId: number): Promise<TransactionCustomValue[]> {
  const db = await getDb();
  return db.select<TransactionCustomValue[]>(
    `select * from transaction_custom_values where transaction_id = $1`,
    [transactionId],
  );
}

export async function setCustomValue(transactionId: number, fieldId: number, value: string | null): Promise<void> {
  const db = await getDb();
  if (value === null || value.trim() === "") {
    await db.execute(
      `delete from transaction_custom_values where transaction_id = $1 and custom_field_id = $2`,
      [transactionId, fieldId],
    );
  } else {
    await db.execute(
      `insert into transaction_custom_values (transaction_id, custom_field_id, value)
       values ($1, $2, $3)
       on conflict (transaction_id, custom_field_id) do update set value = excluded.value`,
      [transactionId, fieldId, value.trim()],
    );
  }
}
