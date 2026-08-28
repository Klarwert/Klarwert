import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { __setTestDatabase, getDb, runInTransaction, getCurrentBatchId } from "@/db/client";
import { createSqliteTestDatabase } from "@/test/sqliteTestDb";
import { runMigrations } from "@/db/migrate";
import { logOperation } from "./operations";

describe("Operations Log", () => {
  beforeAll(async () => {
    __setTestDatabase(createSqliteTestDatabase());
    await runMigrations();
  });

  beforeEach(async () => {
    const db = await getDb();
    await db.execute("delete from operations");
  });

  it("should generate a single batch_id inside a transaction", async () => {
    let batchId1: string = "";
    let batchId2: string = "";
    
    await runInTransaction(async (db) => {
      batchId1 = getCurrentBatchId();
      await logOperation(db, "insert", "categories", 1, { name: "Test" }, null);
      
      await runInTransaction(async (innerDb) => {
        batchId2 = getCurrentBatchId();
        await logOperation(innerDb, "update", "categories", 1, { name: "Test 2" }, { name: "Test" });
      });
    });

    expect(batchId1).toBeDefined();
    expect(batchId2).toBe(batchId1);

    const db = await getDb();
    const ops = await db.select<any[]>("select * from operations order by id asc");
    expect(ops.length).toBe(2);
    expect(ops[0].batch_id).toBe(batchId1);
    expect(ops[1].batch_id).toBe(batchId1);
  });
  
  it("generates separate batch_ids without transactions", () => {
    const id1 = getCurrentBatchId();
    const id2 = getCurrentBatchId();
    expect(id1).not.toBe(id2);
  });
});
