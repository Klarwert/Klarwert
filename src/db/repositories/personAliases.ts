import { getDb } from "@/db/client";
import type { PersonAlias } from "@/db/types";

/** Namensvarianten einer Person ("auch bekannt als"), Grundlage für die Transfer-Erkennung Stufe 3. */
export async function listPersonAliases(personId?: number): Promise<PersonAlias[]> {
  const db = await getDb();
  if (personId !== undefined) {
    return db.select<PersonAlias[]>("select * from person_aliases where person_id = $1", [personId]);
  }
  return db.select<PersonAlias[]>("select * from person_aliases");
}

export async function addPersonAlias(personId: number, alias: string): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "insert into person_aliases (person_id, alias) values ($1, $2)",
    [personId, alias.trim()],
  );
  return result.lastInsertId as number;
}

export async function removePersonAlias(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("delete from person_aliases where id = $1", [id]);
}
