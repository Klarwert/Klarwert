import Database from "@tauri-apps/plugin-sql";

// Single-connection guarantee: dbInstance ist ein Singleton – BEGIN und ROLLBACK
// landen immer auf derselben Connection. Das verhindert die bekannten Bugs
// "cannot rollback - no transaction is active" und "database is locked".
// Niemals einen zweiten Database.load()-Aufruf hinzufügen.
let dbInstance: Database | null = null;
let loading: Promise<Database> | null = null;
let transactionDepth = 0;
let currentBatchId: string | null = null;

/**
 * Gibt die aktuelle batch_id für Operations-Logging zurück.
 * Ist keine Transaktion aktiv, wird eine neue generiert (Single-Operation).
 */
export function getCurrentBatchId(): string {
  if (currentBatchId) return currentBatchId;
  return crypto.randomUUID();
}

/** Öffnet (einmalig) die lokale SQLite-Datenbank. */
export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;
  if (!loading) {
    loading = Database.load("sqlite:klarwert.db").then(async (db) => {
      // Ensure WAL and busy_timeout are set on connection open
      await db.execute("PRAGMA journal_mode = WAL;");
      await db.execute("PRAGMA busy_timeout = 5000;");
      await db.execute("PRAGMA foreign_keys = ON;");
      dbInstance = db;
      return db;
    });
  }
  return loading;
}

/**
 * Test-Seam: injiziert eine Fake-`Database`-Instanz (z. B. ein `node:sqlite`-Adapter, siehe
 * `src/test/sqliteTestDb.ts`), damit Repositories/Pipeline in Vitest-Integrationstests gegen eine
 * echte SQLite-Engine statt gegen den (im Node-Testkontext nicht verfügbaren) Tauri-SQL-Plugin
 * laufen können. Nur für Tests – nie in produktivem App-Code aufrufen.
 */
export function __setTestDatabase(db: Database | null): void {
  dbInstance = db;
  loading = db ? Promise.resolve(db) : null;
  transactionDepth = 0;
}

/**
 * Führt `fn` innerhalb einer SQLite-Transaktion aus; bei Fehler vollständiges Rollback.
 * Unterstützt Verschachtelung via SAVEPOINTs – innere Aufrufe werden als Savepoint
 * behandelt, sodass kein "database is locked" durch verschachteltes BEGIN entsteht.
 *
 * Verbindliche Regel (CLAUDE.md, Abschnitt "Transaktions-Disziplin"):
 * - Jeder mehrschrittige Schreibvorgang (Import, Bulk-Aktionen, Regel-Anwendung)
 *   nutzt dieses Utility – nirgendwo sonst manuell BEGIN/COMMIT schreiben.
 */
// Einfacher Mutex für Transaktions-Serialisierung
let transactionMutex = Promise.resolve();

export async function runInTransaction<T>(fn: (db: Database) => Promise<T>): Promise<T> {
  // Wenn wir bereits in einer Transaktion sind (depth > 0), laufen wir normal weiter
  // (das ist die gewollte SAVEPOINT-Verschachtelung).
  // Wenn wir eine neue Top-Level-Transaktion starten (depth === 0), müssen wir warten,
  // bis alle vorherigen Top-Level-Transaktionen abgeschlossen sind.
  
  let releaseMutex = () => {};
  if (transactionDepth === 0) {
    const previousMutex = transactionMutex;
    let mutexPromiseResolve: () => void;
    transactionMutex = new Promise((resolve) => {
      mutexPromiseResolve = resolve;
    });
    releaseMutex = mutexPromiseResolve!;
    await previousMutex;
  }

  const db = await getDb();

  const depth = transactionDepth;
  transactionDepth += 1;
  const savepointName = `sp_${depth}`;

  try {
    if (depth === 0) {
      currentBatchId = crypto.randomUUID();
      await db.execute("begin");
    } else {
      await db.execute(`savepoint ${savepointName}`);
    }
  } catch (e) {
    transactionDepth -= 1;
    if (transactionDepth === 0) {
      currentBatchId = null;
      releaseMutex();
    }
    throw e;
  }

  try {
    const result = await fn(db);
    if (depth === 0) {
      await db.execute("commit");
    } else {
      await db.execute(`release savepoint ${savepointName}`);
    }
    return result;
  } catch (e) {
    try {
      if (depth === 0) {
        await db.execute("rollback");
      } else {
        await db.execute(`rollback to savepoint ${savepointName}`);
      }
    } catch { /* ignore rollback errors */ }
    throw e;
  } finally {
    transactionDepth -= 1;
    if (transactionDepth === 0) {
      currentBatchId = null;
      releaseMutex();
    }
  }
}

/** @deprecated Verwende `runInTransaction`. Bleibt für Abwärtskompatibilität. */
export const withTransaction = runInTransaction;
