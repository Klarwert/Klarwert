import { beforeAll, describe, it, expect } from "vitest";
import { getDb, __setTestDatabase } from "@/db/client";
import { createSqliteTestDatabase } from "@/test/sqliteTestDb";
import { runMigrations } from "@/db/migrate";
import { createAsset } from "@/db/repositories/assets";
import { createPerson } from "@/db/repositories/persons";
import { addPersonAlias } from "@/db/repositories/personAliases";
import { listNotifications } from "@/db/repositories/notifications";
import { runPipelineForTransactions } from "@/lib/pipeline";
import { runImport, detectAmountChanges } from "@/lib/import/runImport";
import { createSparzweck, getCumulativeSaving } from "@/db/repositories/sparzwecke";
import { createMerchant, addMerchantAlias } from "@/db/repositories/merchants";
import { createCategory } from "@/db/repositories/categories";
import { createMerchantRule } from "@/db/repositories/rules";

/**
 * Echte Integrationstests gegen eine echte SQLite-Engine (node:sqlite, siehe
 * src/test/sqliteTestDb.ts) statt gegen den in Node nicht verfügbaren Tauri-SQL-Plugin.
 * Deckt genau die Fehlerklasse ab, die reine Unit-Tests auf isolierten Funktionen nicht
 * fangen: "UI/Repository sieht im Code richtig aus, aber die Verdrahtung über mehrere
 * Tabellen/Schritte hinweg funktioniert nicht" (siehe CLAUDE.md-Historie).
 */
beforeAll(async () => {
  __setTestDatabase(createSqliteTestDatabase());
  await runMigrations();
});

async function insertRawTransaction(input: {
  asset_id: number;
  booking_date: string;
  counterparty: string;
  amount_cents: number;
  extra_fields_json?: string | null;
  source?: string;
}): Promise<number> {
  const db = await getDb();
  const fingerprint = `${input.booking_date}|${input.amount_cents}|${input.counterparty.toLowerCase()}`;
  const result = await db.execute(
    `insert into transactions
      (asset_id, booking_date, counterparty, purpose, amount_cents, source, fingerprint, extra_fields_json)
     values ($1, $2, $3, null, $4, $5, $6, $7)`,
    [
      input.asset_id,
      input.booking_date,
      input.counterparty,
      input.amount_cents,
      input.source ?? "import",
      fingerprint,
      input.extra_fields_json ?? null,
    ],
  );
  return result.lastInsertId as number;
}

async function getTransactionRow(id: number) {
  const db = await getDb();
  const rows = await db.select<any[]>("select * from transactions where id = $1", [id]);
  return rows[0];
}

describe("Transfer-Erkennung (Pipeline-Integration)", () => {
  it("Stufe 1 IBAN-Treffer setzt transfer_status='confirmed' direkt, ohne Bestätigung", async () => {
    const girokontoId = await createAsset({ name: "Giro", kind: "account", account_type: "giro", owner_ids: [] });
    const tagesgeldId = await createAsset({
      name: "Tagesgeld",
      kind: "account",
      account_type: "tagesgeld",
      iban: "DE00 1111 2222 3333 4444 55",
      owner_ids: [],
    });

    const txId = await insertRawTransaction({
      asset_id: girokontoId,
      booking_date: "2024-05-01",
      counterparty: "Eigenes Tagesgeldkonto",
      amount_cents: -50000,
      extra_fields_json: JSON.stringify({ recipient_iban: "DE00111122223333444455" }),
    });

    await runPipelineForTransactions([txId]);

    const tx = await getTransactionRow(txId);
    expect(tx.is_transfer).toBe(1);
    expect(tx.transfer_status).toBe("confirmed");
    void tagesgeldId;
  });

  it("Stufe 3 Alias-Namenstreffer erzeugt nur einen Hinweis, markiert aber nichts automatisch (case-insensitiv)", async () => {
    const girokontoId = await createAsset({ name: "Giro 2", kind: "account", account_type: "giro", owner_ids: [] });
    const personId = await createPerson({ name: "Max Mustermann" });
    await addPersonAlias(personId, "M. Mustermann");

    // Bewusst andere Groß-/Kleinschreibung als der hinterlegte Alias – Erkennung muss trotzdem greifen.
    const txId = await insertRawTransaction({
      asset_id: girokontoId,
      booking_date: "2024-05-02",
      counterparty: "m. mustermann",
      amount_cents: -20000,
    });

    await runPipelineForTransactions([txId]);

    const tx = await getTransactionRow(txId);
    expect(tx.is_transfer).toBe(0);
    expect(tx.transfer_status).toBeNull();

    const notifications = await listNotifications();
    const hint = notifications.find((n) => n.type === "transfer_detected" && n.ref_id === txId);
    expect(hint).toBeTruthy();
    expect(hint!.message).toContain("Max Mustermann");
  });

  it("manuelle Kategorisierung wird von einem erneuten Pipeline-Lauf nie überschrieben", async () => {
    const girokontoId = await createAsset({ name: "Giro 3", kind: "account", account_type: "giro", owner_ids: [] });
    const txId = await insertRawTransaction({
      asset_id: girokontoId,
      booking_date: "2024-05-03",
      counterparty: "Irgendein Laden",
      amount_cents: -1234,
    });
    const db = await getDb();
    await db.execute(
      "update transactions set category_id = null, categorization_source = 'manual' where id = $1",
      [txId],
    );

    await runPipelineForTransactions([txId]);

    const tx = await getTransactionRow(txId);
    expect(tx.categorization_source).toBe("manual");
  });

  it("eine Entnahme vom Sparkonto zurück aufs Girokonto verringert den Sparstand wieder (nicht nur Einzahlungen zählen)", async () => {
    const sparzweckId = await createSparzweck({ name: "Notgroschen", color: "#000000" });
    const girokontoId = await createAsset({ name: "Giro Sparen", kind: "account", account_type: "giro", owner_ids: [] });
    const tagesgeldId = await createAsset({
      name: "Tagesgeld Sparen",
      kind: "account",
      account_type: "tagesgeld",
      owner_ids: [],
      default_sparzweck_id: sparzweckId,
    });

    // Einzahlung: 500 € vom Girokonto aufs Tagesgeldkonto (Gegenbuchungspaar, Stufe 2).
    const depositOut = await insertRawTransaction({
      asset_id: girokontoId,
      booking_date: "2024-06-01",
      counterparty: "Eigenes Tagesgeld",
      amount_cents: -50000,
    });
    const depositIn = await insertRawTransaction({
      asset_id: tagesgeldId,
      booking_date: "2024-06-01",
      counterparty: "Eigenes Giro",
      amount_cents: 50000,
    });
    await runPipelineForTransactions([depositOut, depositIn]);
    expect(await getCumulativeSaving(sparzweckId)).toBe(50000);

    // Entnahme: 200 € zurück vom Tagesgeldkonto aufs Girokonto.
    const withdrawalOut = await insertRawTransaction({
      asset_id: tagesgeldId,
      booking_date: "2024-06-05",
      counterparty: "Eigenes Giro",
      amount_cents: -20000,
    });
    const withdrawalIn = await insertRawTransaction({
      asset_id: girokontoId,
      booking_date: "2024-06-05",
      counterparty: "Eigenes Tagesgeld",
      amount_cents: 20000,
    });
    await runPipelineForTransactions([withdrawalOut, withdrawalIn]);
    expect(await getCumulativeSaving(sparzweckId)).toBe(30000);
  });
});

describe("Händler mit mehreren Regeln (Pipeline-Integration)", () => {
  it("zwei Regeln am selben Händler liefern für zwei unterschiedliche Buchungen zwei unterschiedliche Kategorien", async () => {
    const assetId = await createAsset({ name: "Amazon-Konto", kind: "account", account_type: "giro", owner_ids: [] });
    const streamingCategoryId = await createCategory({ name: "Streaming", color: "#000000" });
    const shoppingCategoryId = await createCategory({ name: "Shopping", color: "#111111" });

    const merchantId = await createMerchant({
      canonical_name: "amazon-test-merchant",
      display_name: "Amazon Test",
      default_category_id: shoppingCategoryId,
      is_builtin: 0,
    });
    await addMerchantAlias({ merchant_id: merchantId, match_type: "name_exact", match_value: "amazon test merchant" });

    // Regel 1 (höhere Priorität, da zuerst angelegt): Verwendungszweck enthält "Prime" -> Streaming.
    await createMerchantRule(merchantId, {
      conditions: [{ field: "purpose", operator: "contains", value: "prime" }],
      category_id: streamingCategoryId,
    });
    // Regel 2 (Fallback ohne Bedingung): sonst -> Shopping.
    await createMerchantRule(merchantId, { conditions: [], category_id: shoppingCategoryId });

    const primeTxId = await insertRawTransaction({
      asset_id: assetId,
      booking_date: "2024-07-01",
      counterparty: "Amazon Test Merchant",
      amount_cents: -1299,
    });
    await getDb().then((db) =>
      db.execute("update transactions set purpose = $1 where id = $2", ["Amazon Prime Mitgliedschaft", primeTxId]),
    );
    const shoppingTxId = await insertRawTransaction({
      asset_id: assetId,
      booking_date: "2024-07-02",
      counterparty: "Amazon Test Merchant",
      amount_cents: -4599,
    });

    await runPipelineForTransactions([primeTxId, shoppingTxId]);

    const primeTx = await getTransactionRow(primeTxId);
    const shoppingTx = await getTransactionRow(shoppingTxId);
    expect(primeTx.category_id).toBe(streamingCategoryId);
    expect(shoppingTx.category_id).toBe(shoppingCategoryId);
    expect(primeTx.category_id).not.toBe(shoppingTx.category_id);
  });
});

describe("Import-Idempotenz (Pipeline-Integration)", () => {
  async function importCsv(assetId: number, rows: string[][], profileId: number | null = null) {
    return runImport({
      assetId,
      filename: "test.csv",
      profileId,
      headers: ["Datum", "Betrag", "Empfaenger", "Verwendungszweck", "Referenz"],
      rows,
      roleToIndex: { date: 0, amount: 1, counterparty: 2, purpose: 3, external_id: 4 },
      dateFormat: "dd.MM.yyyy",
      decimalFormat: "de",
      mode: "upsert",
      currentBalanceInput: 100000,
    });
  }

  it("derselbe Import zweimal hintereinander erzeugt beim zweiten Mal 0 neue Zeilen", async () => {
    const assetId = await createAsset({ name: "Idempotenz-Konto", kind: "account", account_type: "giro", owner_ids: [] });
    const rows = [
      ["01.05.2024", "-10,00", "Rewe", "Einkauf", "REF-001"],
      ["02.05.2024", "-20,00", "Aldi", "Einkauf", "REF-002"],
    ];

    const first = await importCsv(assetId, rows);
    expect(first.status).toBe("success");
    expect(first.rowsNew).toBe(2);

    const second = await importCsv(assetId, rows);
    expect(second.status).toBe("success");
    expect(second.rowsNew).toBe(0);
    expect(second.rowsUpdated).toBe(0);
  });

  it("gleicher external_id mit geänderter Betragsspalte wird erst erkannt (detectAmountChanges), ein reiner Textunterschied löst es nicht aus", async () => {
    const assetId = await createAsset({ name: "Aenderung-Konto", kind: "account", account_type: "giro", owner_ids: [] });
    await importCsv(assetId, [["01.05.2024", "-10,00", "Rewe", "Einkauf", "REF-100"]]);

    const textOnlyChange = await runImportParsedForAmountCheck(assetId, [
      ["01.05.2024", "-10,00", "Rewe Markt GmbH", "Einkauf", "REF-100"],
    ]);
    expect(textOnlyChange).toHaveLength(0);

    const amountChange = await runImportParsedForAmountCheck(assetId, [
      ["01.05.2024", "-15,00", "Rewe", "Einkauf", "REF-100"],
    ]);
    expect(amountChange).toHaveLength(1);
    expect(amountChange[0].oldAmountCents).toBe(-1000);
    expect(amountChange[0].newAmountCents).toBe(-1500);
  });

  async function runImportParsedForAmountCheck(assetId: number, rows: string[][]) {
    const { parseRows } = await import("@/lib/import/runImport");
    const { parsed } = parseRows({
      assetId,
      filename: "test.csv",
      profileId: null,
      headers: ["Datum", "Betrag", "Empfaenger", "Verwendungszweck", "Referenz"],
      rows,
      roleToIndex: { date: 0, amount: 1, counterparty: 2, purpose: 3, external_id: 4 },
      dateFormat: "dd.MM.yyyy",
      decimalFormat: "de",
      mode: "upsert",
      currentBalanceInput: null,
    });
    return detectAmountChanges(assetId, parsed);
  }
});
