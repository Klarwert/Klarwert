import { beforeAll, describe, it, expect } from "vitest";
import { getDb, __setTestDatabase } from "@/db/client";
import { createSqliteTestDatabase } from "@/test/sqliteTestDb";
import { runMigrations } from "@/db/migrate";
import { createAsset } from "@/db/repositories/assets";
import { createCategory } from "@/db/repositories/categories";
import {
  createRuleWithGroups,
  updateRuleWithGroups,
  createMerchantRule,
  listRules,
  listDistinctValuesForField,
  listExtraFieldKeys,
  swapRulePriority,
  reorderRules,
} from "@/db/repositories/rules";
import { createMerchant } from "@/db/repositories/merchants";
import { runPipelineForTransactions } from "@/lib/pipeline";

/** Regel-Builder-Erweiterung (prompt-regelbuilder-erweiterung.md), gegen eine echte SQLite-Engine. */
beforeAll(async () => {
  __setTestDatabase(createSqliteTestDatabase());
  await runMigrations();
});

async function insertRawTransaction(input: {
  asset_id: number;
  booking_date: string;
  counterparty: string;
  purpose?: string | null;
  amount_cents: number;
  extra_fields_json?: string | null;
}): Promise<number> {
  const db = await getDb();
  const fingerprint = `${input.booking_date}|${input.amount_cents}|${input.counterparty.toLowerCase()}`;
  const result = await db.execute(
    `insert into transactions (asset_id, booking_date, counterparty, purpose, amount_cents, source, fingerprint, extra_fields_json)
     values ($1, $2, $3, $4, $5, 'import', $6, $7)`,
    [input.asset_id, input.booking_date, input.counterparty, input.purpose ?? null, input.amount_cents, fingerprint, input.extra_fields_json ?? null],
  );
  return result.lastInsertId as number;
}

async function getTransactionCategory(id: number): Promise<number | null> {
  const db = await getDb();
  const rows = await db.select<{ category_id: number | null }[]>("select category_id from transactions where id = $1", [id]);
  return rows[0]?.category_id ?? null;
}

describe("Regel-Builder: UND/ODER-Gruppen", () => {
  it("(Feld A UND Feld B) ODER (Feld C) trifft auf zwei von drei synthetischen Buchungen zu", async () => {
    const assetId = await createAsset({ name: "Regelbuilder-Konto", kind: "account", account_type: "giro", owner_ids: [] });
    const categoryId = await createCategory({ name: "Regelbuilder-Test", color: "#000000" });

    // Gruppe 1 (UND): Empfänger enthält "Amazon" UND Betrag < -50,00 €.
    // Gruppe 2 (ODER-Alternative): Verwendungszweck enthält "Prime".
    await createRuleWithGroups(
      [
        {
          conditions: [
            { field: "counterparty", operator: "contains", value: "amazon" },
            { field: "amount", operator: "less_than", value: "-50,00" },
          ],
        },
        { conditions: [{ field: "purpose", operator: "contains", value: "prime" }] },
      ],
      { category_id: categoryId, tag_id: null, mark_as_transfer: false, mark_as_saving: false, sparzweck_id: null },
    );

    // Treffer 1: Gruppe 1 (Amazon + Betrag < -50 €).
    const hit1 = await insertRawTransaction({ asset_id: assetId, booking_date: "2024-08-01", counterparty: "Amazon", amount_cents: -8000 });
    // Treffer 2: Gruppe 2 (Prime im Verwendungszweck, anderer Empfänger/Betrag).
    const hit2 = await insertRawTransaction({ asset_id: assetId, booking_date: "2024-08-02", counterparty: "Irgendwer", purpose: "Amazon Prime Abo", amount_cents: -999 });
    // Kein Treffer: Amazon, aber Betrag zu klein für Gruppe 1, kein "Prime" im Zweck.
    const miss = await insertRawTransaction({ asset_id: assetId, booking_date: "2024-08-03", counterparty: "Amazon", amount_cents: -1000 });

    await runPipelineForTransactions([hit1, hit2, miss]);

    expect(await getTransactionCategory(hit1)).toBe(categoryId);
    expect(await getTransactionCategory(hit2)).toBe(categoryId);
    expect(await getTransactionCategory(miss)).not.toBe(categoryId);
  });
});

describe("Regel-Builder: Werte-Picker und Import-Spalten", () => {
  it("listExtraFieldKeys findet echte, aus dem Import stammende extra_fields_json-Schlüssel", async () => {
    const assetId = await createAsset({ name: "Extra-Feld-Konto", kind: "account", account_type: "giro", owner_ids: [] });
    await insertRawTransaction({
      asset_id: assetId,
      booking_date: "2024-08-04",
      counterparty: "Testbuchung",
      amount_cents: -100,
      extra_fields_json: JSON.stringify({ Mandatsreferenz: "ABC-123" }),
    });

    const keys = await listExtraFieldKeys();
    expect(keys).toContain("Mandatsreferenz");
  });

  it("listDistinctValuesForField liefert echte, in der Datenbank vorkommende Empfänger statt Platzhalter", async () => {
    const assetId = await createAsset({ name: "Werte-Picker-Konto", kind: "account", account_type: "giro", owner_ids: [] });
    await insertRawTransaction({ asset_id: assetId, booking_date: "2024-08-05", counterparty: "Einzigartiger Testempfaenger", amount_cents: -500 });

    const values = await listDistinctValuesForField("counterparty", "Einzigartiger");
    expect(values).toContain("Einzigartiger Testempfaenger");
  });
});

describe("Händler-Regeln dürfen (anders als Benutzerregeln) ohne Bedingung angelegt werden", () => {
  it("createMerchantRule mit leeren Bedingungen wirft nicht und gilt als Default-Treffer", async () => {
    const categoryId = await createCategory({ name: "Merchant-Fallback-Test", color: "#666666" });
    const merchantId = await createMerchant({ canonical_name: "fallback-test-merchant", display_name: "Fallback Test" });

    const ruleId = await createMerchantRule(merchantId, { conditions: [], category_id: categoryId });

    const rules = await listRules();
    const rule = rules.find((r) => r.id === ruleId);
    expect(rule).toBeDefined();
    expect(rule!.groups).toHaveLength(0);
  });

  it("createRuleWithGroups (normale Benutzerregel) wirft weiterhin bei leeren Bedingungen", async () => {
    const categoryId = await createCategory({ name: "User-Rule-No-Empty-Test", color: "#777777" });
    await expect(
      createRuleWithGroups([], { category_id: categoryId, tag_id: null, mark_as_transfer: false, mark_as_saving: false, sparzweck_id: null }),
    ).rejects.toThrow("Eine Regel braucht mindestens eine Bedingung.");
  });
});

describe("Regel-Schreibvorgänge sind atomar (Phase 1: Datenintegrität)", () => {
  it("updateRuleWithGroups lässt bei einem Fehler mitten im Rebuild die alten Gruppen/Bedingungen unangetastet", async () => {
    const categoryId = await createCategory({ name: "Atomaritäts-Test", color: "#222222" });
    const ruleId = await createRuleWithGroups(
      [{ conditions: [{ field: "counterparty", operator: "contains", value: "original" }] }],
      { category_id: categoryId, tag_id: null, mark_as_transfer: false, mark_as_saving: false, sparzweck_id: null },
    );

    // custom_field_id verweist auf keinen existierenden custom_fields-Datensatz -> die insert-into-
    // rule_conditions-Anweisung in writeGroups() verletzt den Fremdschlüssel und wirft. Vor der
    // Transaktions-Kapselung (Phase 1) hätte das vorangegangene "delete from rule_condition_groups"
    // trotzdem bereits committed vorgelegen und die Regel ohne jede Bedingung zurückgelassen (siehe
    // 028_cleanup_empty_rules.sql).
    await expect(
      updateRuleWithGroups(
        ruleId,
        [{ conditions: [{ field: "counterparty", operator: "contains", value: "neu", custom_field_id: 999999 }] }],
        { category_id: categoryId, tag_id: null, mark_as_transfer: false, mark_as_saving: false, sparzweck_id: null },
      ),
    ).rejects.toThrow();

    const rules = await listRules();
    const rule = rules.find((r) => r.id === ruleId);
    expect(rule).toBeDefined();
    expect(rule!.groups).toHaveLength(1);
    expect(rule!.groups[0].conditions).toHaveLength(1);
    expect(rule!.groups[0].conditions[0].value).toBe("original");
  });
});

describe("rules.priority bleibt unter aktiven Regeln eindeutig (Migration 029)", () => {
  it("swapRulePriority vertauscht zwei Prioritäten, ohne den partiellen Unique-Index zu verletzen", async () => {
    const categoryId = await createCategory({ name: "Swap-Test", color: "#333333" });
    const ruleA = await createRuleWithGroups(
      [{ conditions: [{ field: "counterparty", operator: "contains", value: "swap-a" }] }],
      { category_id: categoryId, tag_id: null, mark_as_transfer: false, mark_as_saving: false, sparzweck_id: null },
    );
    const ruleB = await createRuleWithGroups(
      [{ conditions: [{ field: "counterparty", operator: "contains", value: "swap-b" }] }],
      { category_id: categoryId, tag_id: null, mark_as_transfer: false, mark_as_saving: false, sparzweck_id: null },
    );

    const before = await listRules();
    const priorityA = before.find((r) => r.id === ruleA)!.priority;
    const priorityB = before.find((r) => r.id === ruleB)!.priority;

    await expect(swapRulePriority(ruleA, ruleB)).resolves.not.toThrow();

    const after = await listRules();
    expect(after.find((r) => r.id === ruleA)!.priority).toBe(priorityB);
    expect(after.find((r) => r.id === ruleB)!.priority).toBe(priorityA);

    const priorities = after.filter((r) => !r.is_deleted).map((r) => r.priority);
    expect(new Set(priorities).size).toBe(priorities.length);
  });

  it("reorderRules vergibt allen aktiven Regeln eine dichte, eindeutige Prioritätsreihenfolge", async () => {
    const categoryId = await createCategory({ name: "Reorder-Test", color: "#444444" });
    const allBefore = await listRules();
    const newRule1 = await createRuleWithGroups(
      [{ conditions: [{ field: "counterparty", operator: "contains", value: "reorder-1" }] }],
      { category_id: categoryId, tag_id: null, mark_as_transfer: false, mark_as_saving: false, sparzweck_id: null },
    );
    const newRule2 = await createRuleWithGroups(
      [{ conditions: [{ field: "counterparty", operator: "contains", value: "reorder-2" }] }],
      { category_id: categoryId, tag_id: null, mark_as_transfer: false, mark_as_saving: false, sparzweck_id: null },
    );

    const all = await listRules();
    const orderedIds = [newRule2, newRule1, ...allBefore.map((r) => r.id)];
    expect(orderedIds).toHaveLength(all.length);

    await expect(reorderRules(orderedIds)).resolves.not.toThrow();

    const after = await listRules();
    expect(after.find((r) => r.id === newRule2)!.priority).toBe(1);
    expect(after.find((r) => r.id === newRule1)!.priority).toBe(2);

    const priorities = after.map((r) => r.priority);
    expect(new Set(priorities).size).toBe(priorities.length);
  });

  it("zwei aktive Regeln können nicht dieselbe Priorität tragen (Unique-Index greift)", async () => {
    const db = await getDb();
    const categoryId = await createCategory({ name: "Unique-Index-Test", color: "#555555" });
    const ruleA = await createRuleWithGroups(
      [{ conditions: [{ field: "counterparty", operator: "contains", value: "unique-a" }] }],
      { category_id: categoryId, tag_id: null, mark_as_transfer: false, mark_as_saving: false, sparzweck_id: null },
    );
    const ruleB = await createRuleWithGroups(
      [{ conditions: [{ field: "counterparty", operator: "contains", value: "unique-b" }] }],
      { category_id: categoryId, tag_id: null, mark_as_transfer: false, mark_as_saving: false, sparzweck_id: null },
    );
    const rows = await db.select<{ priority: number }[]>("select priority from rules where id = $1", [ruleA]);
    await expect(
      db.execute("update rules set priority = $1 where id = $2", [rows[0].priority, ruleB]),
    ).rejects.toThrow();
  });
});
