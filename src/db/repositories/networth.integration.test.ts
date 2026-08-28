import { beforeAll, describe, it, expect } from "vitest";
import { getDb, __setTestDatabase } from "@/db/client";
import { createSqliteTestDatabase } from "@/test/sqliteTestDb";
import { runMigrations } from "@/db/migrate";
import { createAsset, listAssets } from "@/db/repositories/assets";
import { getCurrentBalances, getNetWorthSeries } from "@/db/repositories/networth";

/**
 * Depot-Konten bekommen ihren Wert NICHT über Anker+Transaktionen (wie jedes andere Konto), sondern
 * über depot_positions × aktuellen/historischen Kurs aus depot_prices - siehe depotValueAt() in
 * networth.ts. Das ist eine bewusste Ausnahme von der sonst universellen Kontostand-Regel, weil ein
 * Wertpapierdepot fachlich kein Kassenkonto ist. Diese Tests beweisen, dass die Ausnahme korrekt
 * greift, ohne normale Konten zu beeinflussen.
 */
beforeAll(async () => {
  __setTestDatabase(createSqliteTestDatabase());
  await runMigrations();
});

describe("Depot-Bewertung in getCurrentBalances/getNetWorthSeries", () => {
  it("ein normales Girokonto verwendet weiterhin Anker + Transaktionen (unverändertes Verhalten)", async () => {
    const db = await getDb();
    const giroId = await createAsset({ name: "Test-Giro", kind: "account", account_type: "giro", owner_ids: [] });
    await db.execute(
      "insert into value_history (asset_id, valued_at, value_cents, source) values ($1, $2, $3, 'anchor')",
      [giroId, "2024-01-01", 100000],
    );
    await db.execute(
      `insert into transactions (asset_id, booking_date, counterparty, amount_cents, source, fingerprint)
       values ($1, '2024-06-01', 'Test', -5000, 'manual', 'fp-giro-1')`,
      [giroId],
    );

    const assets = await listAssets();
    const balances = await getCurrentBalances(assets);
    expect(balances.get(giroId)).toBe(95000);
  });

  it("ein Depot-Konto ohne Kursdaten fällt auf den Einstandskurs zurück", async () => {
    const db = await getDb();
    const depotId = await createAsset({ name: "Test-Depot-1", kind: "account", account_type: "depot", owner_ids: [] });
    await db.execute(
      `insert into depot_positions (asset_id, isin, name, shares_amount, purchase_price_cents, currency)
       values ($1, 'DE000TEST001', 'Test AG', '10', 5000, 'EUR')`,
      [depotId],
    );

    const assets = await listAssets();
    const balances = await getCurrentBalances(assets);
    // 10 Stück * 50,00 € Einstandskurs = 500,00 €
    expect(balances.get(depotId)).toBe(50000);
  });

  it("ein Depot-Konto mit Kursdaten verwendet den aktuellsten Kurs <= heute, nicht den Einstandskurs", async () => {
    const db = await getDb();
    const depotId = await createAsset({ name: "Test-Depot-2", kind: "account", account_type: "depot", owner_ids: [] });
    await db.execute(
      `insert into depot_positions (asset_id, isin, name, shares_amount, purchase_price_cents, currency)
       values ($1, 'DE000TEST002', 'Test AG 2', '4', 10000, 'EUR')`,
      [depotId],
    );
    await db.execute(
      "insert into depot_prices (isin, date_str, price_cents, currency) values ('DE000TEST002', '2024-01-01', 12000, 'EUR')",
    );
    await db.execute(
      "insert into depot_prices (isin, date_str, price_cents, currency) values ('DE000TEST002', '2099-01-01', 99999, 'EUR')",
    );

    const assets = await listAssets();
    const balances = await getCurrentBalances(assets);
    // 4 Stück * 120,00 € (Kurs vom 2024-01-01, NICHT der Zukunftskurs 2099) = 480,00 €
    expect(balances.get(depotId)).toBe(48000);
  });

  it("getNetWorthSeries verwendet für vergangene Stichtage den zu dieser Zeit gültigen Kurs", async () => {
    const db = await getDb();
    const depotId = await createAsset({ name: "Test-Depot-3", kind: "account", account_type: "depot", owner_ids: [] });
    await db.execute(
      `insert into depot_positions (asset_id, isin, name, shares_amount, purchase_price_cents, currency)
       values ($1, 'DE000TEST003', 'Test AG 3', '2', 10000, 'EUR')`,
      [depotId],
    );
    const oldDate = new Date();
    oldDate.setMonth(oldDate.getMonth() - 5);
    const oldDateIso = oldDate.toISOString().slice(0, 10);
    await db.execute("insert into depot_prices (isin, date_str, price_cents, currency) values ('DE000TEST003', $1, 5000, 'EUR')", [oldDateIso]);
    await db.execute(
      "insert into depot_prices (isin, date_str, price_cents, currency) values ('DE000TEST003', $1, 20000, 'EUR')",
      [new Date().toISOString().slice(0, 10)],
    );

    const assets = await listAssets();
    const series = await getNetWorthSeries(assets, 6);
    const oldPoint = series[0]; // ältester Punkt, sollte vor dem heutigen Kurswechsel liegen
    const newestPoint = series[series.length - 1];
    expect(newestPoint.cents).toBeGreaterThanOrEqual(2 * 20000);
    expect(oldPoint.cents).toBeLessThan(newestPoint.cents);
  });
});
