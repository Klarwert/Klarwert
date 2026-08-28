import { getDb } from "@/db/client";
import type { Sparzweck } from "@/db/types";

export async function listSparzwecke(): Promise<Sparzweck[]> {
  const db = await getDb();
  return db.select<Sparzweck[]>(
    "select * from sparzwecke where is_deleted = 0 order by sort_order asc, name asc",
  );
}

export async function createSparzweck(input: {
  name: string;
  color: string;
  target_cents?: number | null;
}): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "insert into sparzwecke (name, color, target_cents) values ($1, $2, $3)",
    [input.name, input.color, input.target_cents ?? null],
  );
  return result.lastInsertId as number;
}

export async function updateSparzweck(
  id: number,
  input: Partial<Pick<Sparzweck, "name" | "color" | "target_cents">>,
): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [key, value] of Object.entries(input)) {
    fields.push(`${key} = $${i}`);
    values.push(value);
    i += 1;
  }
  if (fields.length === 0) return;
  values.push(id);
  await db.execute(`update sparzwecke set ${fields.join(", ")} where id = $${i}`, values);
}

/** Löschen entfernt nur die Zweck-Zuordnung (Sparen-Flag der Transaktionen bleibt). */
export async function deleteSparzweck(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("update sparzwecke set is_deleted = 1 where id = $1", [id]);
  await db.execute("update transactions set sparzweck_id = null where sparzweck_id = $1", [id]);
  await db.execute("update assets set default_sparzweck_id = null where default_sparzweck_id = $1", [id]);
}

export async function getCumulativeSaving(sparzweckId: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ total: number | null }[]>(
    `select sum(-amount_cents) as total from transactions
     where sparzweck_id = $1 and is_saving = 1 and is_deleted = 0 and exclude_from_stats = 0`,
    [sparzweckId],
  );
  return rows[0]?.total ?? 0;
}
