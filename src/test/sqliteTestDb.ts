import { DatabaseSync } from "node:sqlite";
import type Database from "@tauri-apps/plugin-sql";

/**
 * Wandelt Postgres-Style-Platzhalter ($1, $2, ...) in SQLite-nummerierte Platzhalter (?1, ?2, ...)
 * um – nicht in schlichte `?`, weil manche Queries (z. B. die Transfer-Erkennung in pipeline.ts)
 * denselben Platzhalter mehrfach verwenden (z. B. `julianday($3) - 2 and julianday($3) + 2`);
 * bei simplen `?` bräuchte das doppelt so viele bindValues wie tatsächlich übergeben werden.
 * SQLites `?N`-Syntax bindet denselben Wert korrekt an jedes Vorkommen.
 */
function toSqlitePlaceholders(query: string): string {
  return query.replace(/\$(\d+)/g, "?$1");
}

/**
 * Adapter, der eine echte `node:sqlite`-In-Memory-Datenbank hinter derselben `select`/`execute`-
 * Schnittstelle wie `@tauri-apps/plugin-sql`s `Database` verbirgt – für Vitest-Integrationstests,
 * die echte Repositories/Pipeline-Logik gegen eine echte SQLite-Engine laufen lassen wollen, ohne
 * den (in Node nicht verfügbaren) Tauri-IPC-Bridge zu brauchen. Siehe `db/client.ts#__setTestDatabase`.
 */
export function createSqliteTestDatabase(): Database {
  const raw = new DatabaseSync(":memory:");

  const fake = {
    async execute(query: string, bindValues?: unknown[]) {
      const sql = toSqlitePlaceholders(query);
      if (!bindValues || bindValues.length === 0) {
        raw.exec(sql);
        return { rowsAffected: 0, lastInsertId: undefined };
      }
      const stmt = raw.prepare(sql);
      const info = stmt.run(...(bindValues as any[]));
      return {
        rowsAffected: Number(info.changes ?? 0),
        lastInsertId: info.lastInsertRowid !== undefined ? Number(info.lastInsertRowid) : undefined,
      };
    },
    async select<T>(query: string, bindValues?: unknown[]): Promise<T> {
      const sql = toSqlitePlaceholders(query);
      const stmt = raw.prepare(sql);
      const rows = bindValues && bindValues.length > 0 ? stmt.all(...(bindValues as any[])) : stmt.all();
      return rows as unknown as T;
    },
    async close() {
      raw.close();
      return true;
    },
    path: ":memory:",
  };

  return fake;
}
