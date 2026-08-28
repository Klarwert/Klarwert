import { beforeAll, describe, it, expect } from "vitest";
import { getDb, __setTestDatabase } from "@/db/client";
import { createSqliteTestDatabase } from "@/test/sqliteTestDb";
import { runMigrations } from "@/db/migrate";
import { createAsset } from "@/db/repositories/assets";
import { createCategory } from "@/db/repositories/categories";
import { createBudget, listBudgets } from "@/db/repositories/budgets";

/**
 * Phase 1 (Datenintegrität): spentAndLimitForPeriod() prüfte vor diesem Fix per "select, dann bedingt
 * insert" (ohne Transaktion/Unique-Constraint), ob für eine Periode schon ein budget_periods-Snapshot
 * existiert. listBudgets() ruft das für mehrere Perioden per Promise.all praktisch gleichzeitig auf –
 * zwei überlappende listBudgets()-Aufrufe (z. B. zwei React-Query-Refetches) konnten dadurch je einen
 * eigenen Snapshot für dieselbe (budget_id, period_start) anlegen.
 */
beforeAll(async () => {
  __setTestDatabase(createSqliteTestDatabase());
  await runMigrations();
});

async function insertRawTransaction(assetId: number, categoryId: number, bookingDate: string, amountCents: number): Promise<void> {
  const db = await getDb();
  const fingerprint = `${bookingDate}|${amountCents}|test`;
  await db.execute(
    `insert into transactions (asset_id, booking_date, counterparty, amount_cents, source, fingerprint, category_id)
     values ($1, $2, 'Testbuchung', $3, 'import', $4, $5)`,
    [assetId, bookingDate, amountCents, fingerprint, categoryId],
  );
}

describe("Budgetperioden-Snapshots sind race-sicher (Phase 1: Datenintegrität)", () => {
  it("zwei überlappende listBudgets()-Aufrufe legen für dieselbe Periode nur einen Snapshot an", async () => {
    const db = await getDb();
    const assetId = await createAsset({ name: "Budget-Test-Konto", kind: "account", account_type: "giro", owner_ids: [] });
    const categoryId = await createCategory({ name: "Budget-Test-Kategorie", color: "#654321" });
    const budgetId = await createBudget({ category_id: categoryId, limit_cents: 20000, period_type: "month" });
    await insertRawTransaction(assetId, categoryId, "2024-01-15", -5000);

    const anchor = "2024-01-20";
    const [resultA, resultB] = await Promise.all([listBudgets(anchor), listBudgets(anchor)]);

    const summaryA = resultA.find((b) => b.id === budgetId)!;
    const summaryB = resultB.find((b) => b.id === budgetId)!;
    expect(summaryA.spentCents).toBe(5000);
    expect(summaryB.spentCents).toBe(5000);

    const periodRows = await db.select<{ count: number }[]>(
      "select count(*) as count from budget_periods where budget_id = $1",
      [budgetId],
    );
    // 6 Historien-Monate pro listBudgets()-Aufruf (siehe getBudgetPeriods), aber trotz zweier
    // paralleler Aufrufe darf jede (budget_id, period_start)-Kombination nur einmal vorkommen.
    expect(periodRows[0].count).toBe(6);
  });

  it("eine bereits abgeschlossene, eingefrorene Periode ändert sich durch einen erneuten Aufruf nicht mehr", async () => {
    const assetId = await createAsset({ name: "Budget-Frozen-Konto", kind: "account", account_type: "giro", owner_ids: [] });
    const categoryId = await createCategory({ name: "Budget-Frozen-Kategorie", color: "#fedcba" });
    const budgetId = await createBudget({ category_id: categoryId, limit_cents: 10000, period_type: "month" });
    // Anchor Dezember 2023, getBudgetPeriods() deckt die letzten 6 Monate ab (Juli-Dezember) –
    // Oktober liegt sicher innerhalb dieses Fensters und ist zugleich klar abgeschlossen (nicht "current").
    await insertRawTransaction(assetId, categoryId, "2023-10-10", -3000);

    const firstCall = await listBudgets("2023-12-01");
    const octoberEntry = firstCall.find((b) => b.id === budgetId)!.history.find((h) => h.spentCents === 3000);
    expect(octoberEntry).toBeDefined();

    // Nachträgliche Buchung in derselben (jetzt eingefrorenen) Periode darf die Historie nicht mehr
    // rückwirkend verändern (siehe Kommentar in spentAndLimitForPeriod/001_schema.sql).
    await insertRawTransaction(assetId, categoryId, "2023-10-20", -7000);
    const secondCall = await listBudgets("2023-12-01");
    const octoberEntryAfter = secondCall.find((b) => b.id === budgetId)!.history.find((h) => h.label === octoberEntry!.label);
    expect(octoberEntryAfter!.spentCents).toBe(3000);
  });
});
