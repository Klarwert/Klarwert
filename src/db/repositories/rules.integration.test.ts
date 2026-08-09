import { beforeAll, describe, it, expect } from "vitest";
import { getDb, __setTestDatabase } from "@/db/client";
import { createSqliteTestDatabase } from "@/test/sqliteTestDb";
import { runMigrations } from "@/db/migrate";
import { createAsset } from "@/db/repositories/assets";
import { createCategory } from "@/db/repositories/categories";
import { createRuleWithGroups, listDistinctValuesForField, listExtraFieldKeys } from "@/db/repositories/rules";
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
