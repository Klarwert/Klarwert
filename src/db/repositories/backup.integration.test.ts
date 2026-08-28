import { beforeAll, describe, it, expect } from "vitest";
import { getDb, __setTestDatabase } from "@/db/client";
import { createSqliteTestDatabase } from "@/test/sqliteTestDb";
import { runMigrations } from "@/db/migrate";
import { createAsset } from "@/db/repositories/assets";
import { createCategory } from "@/db/repositories/categories";
import { createRuleWithGroups } from "@/db/repositories/rules";
import { exportBackupJson, importBackupJson } from "@/db/repositories/backup";

/**
 * Phase 1 (Datenintegrität): backup.ts sicherte bis zu diesem Fix weder rule_condition_groups noch
 * depot_positions/budgets/budget_periods etc. – ein Restore konnte damit sowohl Daten stillschweigend
 * verlieren als auch (bei Regeln mit Bedingungsgruppen) mit einem Fremdschlüssel-Fehler abbrechen, weil
 * rule_conditions.group_id auf eine nie mitgesicherte rule_condition_groups-Zeile zeigte.
 */
beforeAll(async () => {
  __setTestDatabase(createSqliteTestDatabase());
  await runMigrations();
});

describe("Backup/Restore sichert alle fachlich relevanten Tabellen (Phase 1)", () => {
  it("eine Regel mit Bedingungsgruppen übersteht Export -> vollständiges Löschen -> Import unverändert", async () => {
    const db = await getDb();
    const assetId = await createAsset({ name: "Backup-Test-Konto", kind: "account", account_type: "giro", owner_ids: [] });
    const categoryId = await createCategory({ name: "Backup-Test-Kategorie", color: "#123456" });
    const ruleId = await createRuleWithGroups(
      [
        { conditions: [{ field: "counterparty", operator: "contains", value: "backup-test" }] },
        { conditions: [{ field: "purpose", operator: "contains", value: "alternative" }] },
      ],
      { category_id: categoryId, tag_id: null, mark_as_transfer: false, mark_as_saving: false, sparzweck_id: null },
    );

    // Depot-Position roh einfügen (depot.ts hat einen unabhängigen, vorbestehenden Typ-Fehler
    // in @/db/types, siehe Phase-1-Abschlussbericht – hier bewusst nicht importiert, um den Test
    // von diesem unrelated WIP-Problem zu entkoppeln).
    await db.execute(
      `insert into depot_positions (asset_id, isin, name, shares_amount, purchase_price_cents, currency)
       values ($1, $2, $3, $4, $5, $6)`,
      [assetId, "DE0007164600", "Backup-Test-Wertpapier", "10.5", 123456, "EUR"],
    );

    const json = await exportBackupJson();
    const parsed = JSON.parse(json);
    expect(parsed.tables.rule_condition_groups).toBeDefined();
    expect(parsed.tables.rule_condition_groups.length).toBeGreaterThan(0);
    expect(parsed.tables.depot_positions).toBeDefined();
    expect(parsed.tables.depot_positions.length).toBe(1);

    await db.execute("delete from rule_conditions");
    await db.execute("delete from rule_condition_groups");
    await db.execute("delete from rules");
    await db.execute("delete from depot_positions");

    await importBackupJson(json);

    const groups = await db.select<{ id: number; rule_id: number; group_order: number }[]>(
      "select * from rule_condition_groups where rule_id = $1 order by group_order asc",
      [ruleId],
    );
    expect(groups).toHaveLength(2);
    const conditions = await db.select<{ group_id: number; value: string }[]>(
      "select group_id, value from rule_conditions where group_id in ($1, $2)",
      [groups[0].id, groups[1].id],
    );
    expect(conditions.map((c) => c.value).sort()).toEqual(["alternative", "backup-test"]);

    const depotRows = await db.select<{ isin: string }[]>("select isin from depot_positions where asset_id = $1", [assetId]);
    expect(depotRows).toHaveLength(1);
    expect(depotRows[0].isin).toBe("DE0007164600");

    const violations = await db.select<unknown[]>("PRAGMA foreign_key_check;");
    expect(violations).toHaveLength(0);
  });

  it("exportBackupJson schreibt keine leeren Platzhalter für existierende Tabellen (Tippfehler-Regression)", async () => {
    const json = await exportBackupJson();
    const parsed = JSON.parse(json);
    // Historischer Bug: BACKUP_TABLES enthielt "import_records" statt "imports" – die echte
    // Tabelle "imports" wurde dadurch nie exportiert, der Fehler aber durch ein try/catch verschluckt.
    expect(parsed.tables.import_records).toBeUndefined();
    expect(parsed.tables.imports).toBeDefined();
  });

  it("importBackupJson bricht kontrolliert ab, wenn das Backup Fremdschlüssel-inkonsistent ist", async () => {
    const db = await getDb();
    const categoryId = await createCategory({ name: "Inkonsistenz-Test", color: "#abcdef" });
    await createRuleWithGroups(
      [{ conditions: [{ field: "counterparty", operator: "contains", value: "inkonsistenz" }] }],
      { category_id: categoryId, tag_id: null, mark_as_transfer: false, mark_as_saving: false, sparzweck_id: null },
    );
    const json = await exportBackupJson();
    const parsed = JSON.parse(json);
    // rule_condition_groups absichtlich aus dem Backup entfernen, obwohl rule_conditions noch
    // darauf verweist -> simuliert ein unvollständiges/fremdes Backup-Dokument.
    parsed.tables.rule_condition_groups = [];

    const before = await db.select<{ count: number }[]>("select count(*) as count from rules");

    await expect(importBackupJson(JSON.stringify(parsed))).rejects.toThrow(/Fremdschlüssel/);

    // Rollback: der Zustand vor dem fehlgeschlagenen Restore-Versuch muss erhalten bleiben.
    const after = await db.select<{ count: number }[]>("select count(*) as count from rules");
    expect(after[0].count).toBe(before[0].count);
  });
});
