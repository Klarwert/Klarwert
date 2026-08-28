import { getDb } from "@/db/client";
import type { Tag } from "@/db/types";

export async function listTags(): Promise<Tag[]> {
  const db = await getDb();
  return db.select<Tag[]>("select * from tags where is_deleted = 0 order by name asc");
}

export async function createTag(name: string, color: string): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "insert into tags (name, color) values ($1, $2)",
    [name, color],
  );
  return result.lastInsertId as number;
}

export async function updateTag(id: number, input: { name?: string; color?: string }): Promise<void> {
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
  await db.execute(`update tags set ${fields.join(", ")} where id = $${i}`, values);
}

export async function deleteTag(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("update tags set is_deleted = 1 where id = $1", [id]);
}

export async function countTagUsage(id: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>(
    "select count(*) as count from transaction_tags where tag_id = $1",
    [id],
  );
  return rows[0]?.count ?? 0;
}
