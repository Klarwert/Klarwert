import { beforeAll, describe, it, expect } from "vitest";
import { getDb, __setTestDatabase } from "@/db/client";
import { createSqliteTestDatabase } from "@/test/sqliteTestDb";
import { runMigrations } from "@/db/migrate";
import { listAllMerchants, updateMerchantContent } from "@/db/repositories/merchants";

/**
 * Integrationstests für die Zusammenführung von Händlern und Regel-Vorlagen
 * (klarwert-haendler-regel-konzept-v2.md), gegen eine echte SQLite-Engine (siehe
 * src/test/sqliteTestDb.ts).
 */
beforeAll(async () => {
  __setTestDatabase(createSqliteTestDatabase());
  await runMigrations();
});

describe("Händler & Regel-Vorlagen zusammenführen", () => {
  it("ein kuratierter Händler lässt sich bearbeiten, ohne zu verschwinden, und wird zu 'Angepasst'", async () => {
    const merchants = await listAllMerchants();
    const rewe = merchants.find((m) => m.canonical_name === "rewe");
    expect(rewe).toBeTruthy();
    expect(rewe!.is_builtin).toBe(1);
    expect(rewe!.is_modified).toBe(0);

    await updateMerchantContent(rewe!.id, { display_name: "REWE (angepasst)", default_category_id: rewe!.default_category_id });

    const afterEdit = await listAllMerchants();
    const reweAfter = afterEdit.find((m) => m.id === rewe!.id);
    expect(reweAfter).toBeTruthy();
    expect(reweAfter!.display_name).toBe("REWE (angepasst)");
    expect(reweAfter!.is_builtin).toBe(1);
    expect(reweAfter!.is_modified).toBe(1);
  });

  it("die ~50 Regel-Vorlagen wurden zu Händlern mit verknüpften Regeln migriert", async () => {
    const db = await getDb();
    const migratedRules = await db.select<{ count: number }[]>(
      "select count(*) as count from rules where merchant_id is not null and is_deleted = 0",
    );
    expect(migratedRules[0].count).toBeGreaterThan(30);

    const merchantsFromTemplates = await db.select<{ count: number }[]>(
      "select count(*) as count from merchants where source_version = 'migrated-rule-template'",
    );
    expect(merchantsFromTemplates[0].count).toBeGreaterThan(0);
  });
});
