import { getDb } from "@/db/client";
import type { Person, PersonRole } from "@/db/types";

export async function listPersons(includeInactive = false): Promise<Person[]> {
  const db = await getDb();
  const where = includeInactive ? "" : "where is_active = 1";
  return db.select<Person[]>(
    `select * from persons ${where} order by id asc`,
  );
}

export async function createPerson(input: {
  name: string;
  role?: PersonRole;
  birth_year?: number | null;
  kirchensteuer_aktiv?: 0 | 1;
  bundesland?: string | null;
}): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "insert into persons (name, role, birth_year, kirchensteuer_aktiv, bundesland) values ($1, $2, $3, $4, $5)",
    [
      input.name,
      input.role ?? "adult",
      input.birth_year ?? null,
      input.kirchensteuer_aktiv ?? 0,
      input.bundesland ?? null,
    ],
  );
  return result.lastInsertId as number;
}

export async function updatePerson(
  id: number,
  input: Partial<Pick<Person, "name" | "role" | "birth_year" | "kirchensteuer_aktiv" | "bundesland">>,
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
  await db.execute(
    `update persons set ${fields.join(", ")} where id = $${i}`,
    values,
  );
}

/** Soft-Delete: Person wird deaktiviert, Zuordnungen an Konten/Transaktionen bleiben nicht bestehen (asset_owners kaskadiert). */
export async function deactivatePerson(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("update persons set is_active = 0 where id = $1", [id]);
}

export const deletePerson = deactivatePerson;

export async function countActivePersons(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>(
    "select count(*) as count from persons where is_active = 1",
  );
  return rows[0]?.count ?? 0;
}
