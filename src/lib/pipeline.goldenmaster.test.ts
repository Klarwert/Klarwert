import { beforeAll, describe, it, expect } from "vitest";
import { getDb, __setTestDatabase } from "@/db/client";
import { createSqliteTestDatabase } from "@/test/sqliteTestDb";
import { runMigrations } from "@/db/migrate";
import { createAsset } from "@/db/repositories/assets";
import { runPipelineForTransactions } from "@/lib/pipeline";
import { createMerchant, addMerchantAlias } from "@/db/repositories/merchants";
import { createCategory } from "@/db/repositories/categories";
import { createRule, createMerchantRule } from "@/db/repositories/rules";

/**
 * Golden-Master-Korpus für die Kategorisierungs-Pipeline (A3/Release-Plan): eine feste Menge
 * synthetischer Buchungen läuft durch runPipelineForTransactions(), das Ergebnis (welche Kategorie,
 * über welchen Pfad, mit welcher Konfidenz) wird als Snapshot festgeschrieben.
 *
 * Zweck ist ausdrücklich NICHT, dieselben Fälle wie pipeline.integration.test.ts nochmal einzeln zu
 * behaupten (das leisten die gezielten Assertions dort bereits) - sondern eine breite, realistische
 * Stichprobe zu haben, die JEDEN Pfad mindestens einmal trifft, inklusive der unscheinbaren
 * Mehrfachtreffer-Fälle (mehrere passende Aliase/Regeln), damit eine künftige Änderung an der
 * Priorisierung sofort sichtbar wird, statt sich unbemerkt in die automatische Kategorisierung
 * einzuschleichen. Bei einer beabsichtigten Verhaltensänderung: Snapshot bewusst mit `-u` aktualisieren
 * und im PR erklären, warum sich welche Zeile geändert hat - nicht blind aktualisieren.
 *
 * Contract- und Transfer-Erkennung haben bereits dedizierte Integrationstests
 * (pipeline.integration.test.ts) mit gezielten Assertions; hier sind sie nur so weit vertreten, dass
 * der Korpus wirklich "jeden Zweig" streift, nicht als Ersatz für diese Tests.
 */
beforeAll(async () => {
  __setTestDatabase(createSqliteTestDatabase());
  await runMigrations();
});

interface Booking {
  counterparty: string;
  purpose?: string;
  amountCents: number;
  date: string;
}

async function insertRawTransaction(assetId: number, b: Booking): Promise<number> {
  const db = await getDb();
  const fingerprint = `${b.date}|${b.amountCents}|${b.counterparty.toLowerCase()}`;
  const result = await db.execute(
    `insert into transactions (asset_id, booking_date, counterparty, purpose, amount_cents, source, fingerprint)
     values ($1, $2, $3, $4, $5, 'import', $6)`,
    [assetId, b.date, b.counterparty, b.purpose ?? null, b.amountCents, fingerprint],
  );
  return result.lastInsertId as number;
}

describe("Kategorisierungs-Pipeline – Golden-Master-Korpus", () => {
  it("kategorisiert einen breiten, realistischen Buchungskorpus stabil über alle Pipeline-Zweige", async () => {
    const db = await getDb();
    const assetId = await createAsset({
      name: "Girokonto",
      kind: "account",
      account_type: "giro",
      owner_ids: [],
    } as any);

    const lebensmittel = await createCategory({ name: "Lebensmittel", color: "#7aa662" });
    const drogerie = await createCategory({ name: "Drogerie", color: "#7aa662" });
    const streaming = await createCategory({ name: "Streaming", color: "#8a5fa0" });
    const versicherung = await createCategory({ name: "Versicherung", color: "#5f7a9e" });
    const gehalt = await createCategory({ name: "Gehalt", color: "#3f7d4e" });
    const restaurant = await createCategory({ name: "Restaurant", color: "#c07a4a" });
    const buero = await createCategory({ name: "Büromaterial", color: "#8a5fa0" });

    // --- Händler mit exaktem Alias (bewusst fiktiver Name, um Kollisionen mit den echten,
    // per seedDefaultMerchants() mitgelieferten Händlern auszuschließen) ---
    const testMarkt = await createMerchant({ canonical_name: "gm_test_markt", display_name: "Test-Markt GM", default_category_id: lebensmittel });
    await addMerchantAlias({ merchant_id: testMarkt, match_type: "name_exact", match_field: "counterparty", match_value: "TESTMARKT GM" });

    // --- Händler mit unscharfem (fuzzy) Alias ---
    const testDrogerie = await createMerchant({ canonical_name: "gm_test_drogerie", display_name: "Test-Drogerie GM", default_category_id: drogerie });
    await addMerchantAlias({ merchant_id: testDrogerie, match_type: "name_fuzzy", match_field: "counterparty", match_value: "testdrogerie-markt" });

    // --- Händler mit Regex-Alias ---
    const testStreaming = await createMerchant({ canonical_name: "gm_test_streaming", display_name: "Test-Streaming GM", default_category_id: streaming });
    await addMerchantAlias({ merchant_id: testStreaming, match_type: "regex", match_field: "counterparty", match_value: "^teststreamingdienst" });

    // --- Händler mit eigener, vom Standard-Kategorie abweichender Regel (Mehrfachtreffer-Fall:
    // derselbe Händler, aber zwei unterschiedliche Ergebnisse je nach Betrag) ---
    const testVersicherer = await createMerchant({ canonical_name: "gm_test_versicherer", display_name: "Test-Versicherer GM", default_category_id: versicherung });
    await addMerchantAlias({ merchant_id: testVersicherer, match_type: "name_exact", match_field: "counterparty", match_value: "Testversicherer GM AG" });
    const buero2 = await createCategory({ name: "Bürobedarf Sonderfall", color: "#8a5fa0" });
    await createMerchantRule(testVersicherer, {
      // "-200" hier ist Euro, nicht Cent (Regel-Bedingungswerte sind immer Euro-Strings, siehe
      // suggest-category.ts) - trifft die -250€-Buchung unten, nicht die -50€-Buchung.
      conditions: [
        { field: "counterparty", operator: "contains", value: "Testversicherer" },
        { field: "amount", operator: "less_than", value: "-200" },
      ],
      category_id: buero2,
      tag_id: null,
      mark_as_transfer: false,
      mark_as_saving: false,
      sparzweck_id: null,
    } as any);

    // --- Zwei konkurrierende Aliase auf denselben Text (name_exact muss vor name_fuzzy gewinnen -
    // echter Mehrfachtreffer-Fall, siehe merchants.ts B3-Priorität) ---
    const ambigA = await createMerchant({ canonical_name: "gm_ambig_exact", display_name: "Ambig Exact GM", default_category_id: restaurant });
    await addMerchantAlias({ merchant_id: ambigA, match_type: "name_exact", match_field: "counterparty", match_value: "Testfoodtruck Mitte" });
    const ambigB = await createMerchant({ canonical_name: "gm_ambig_fuzzy", display_name: "Ambig Fuzzy GM", default_category_id: buero });
    await addMerchantAlias({ merchant_id: ambigB, match_type: "name_fuzzy", match_field: "counterparty", match_value: "Testfoodtruck" });

    // --- Zahlungsdienstleister-Präfix (normalizeCounterparty muss "SumUp *" abstreifen) ---
    const kaffeebar = await createMerchant({ canonical_name: "gm_test_kaffeebar", display_name: "Test-Kaffeebar GM", default_category_id: restaurant });
    await addMerchantAlias({ merchant_id: kaffeebar, match_type: "name_fuzzy", match_field: "counterparty", match_value: "Testkaffeebar Mitte" });

    // --- Benutzerregel: einfache "contains" ---
    await createRule(
      [{ field: "counterparty", operator: "contains", value: "Finanzamt" }],
      { category_id: null, tag_id: null, mark_as_transfer: false, mark_as_saving: false, sparzweck_id: null },
    );
    // --- Benutzerregel: Betrag exakt (Gehalt) ---
    await createRule(
      [{ field: "amount", operator: "greater_than", value: "2000" }],
      { category_id: gehalt, tag_id: null, mark_as_transfer: false, mark_as_saving: false, sparzweck_id: null },
    );
    // --- Benutzerregel: "contains" auf Verwendungszweck (Regel-Operatoren kennen kein Regex -
    // das gibt es nur bei Händler-Aliasen, siehe merchant.schema.json) ---
    await createRule(
      [{ field: "purpose", operator: "contains", value: "Rechnung-2026" }],
      { category_id: buero, tag_id: null, mark_as_transfer: false, mark_as_saving: false, sparzweck_id: null },
    );

    const bookings: Booking[] = [
      // Exakter Händler-Alias
      { counterparty: "TESTMARKT GM", amountCents: -4523, date: "2026-01-05" },
      { counterparty: "TESTMARKT GM", amountCents: -1899, date: "2026-01-12" },
      // Fuzzy Händler-Alias, leicht abweichender Text
      { counterparty: "testdrogerie-markt filiale 42", amountCents: -1299, date: "2026-01-06" },
      // Regex-Alias
      { counterparty: "TESTSTREAMINGDIENST.COM", amountCents: -1299, date: "2026-01-01" },
      // Händler mit betragsabhängiger Sonderregel: kleiner Betrag -> Standardkategorie
      { counterparty: "Testversicherer GM AG", amountCents: -5000, date: "2026-01-03" },
      // gleicher Händler, großer Betrag -> Sonderregel greift (Mehrfachtreffer-Fall)
      { counterparty: "Testversicherer GM AG", amountCents: -25000, date: "2026-02-03" },
      // Ambiguität: exakter Alias muss vor fuzzy gewinnen
      { counterparty: "Testfoodtruck Mitte", amountCents: -1550, date: "2026-01-08" },
      // Zahlungsdienstleister-Präfix muss abgestreift werden
      { counterparty: "SumUp *Testkaffeebar Mitte", amountCents: -450, date: "2026-01-09" },
      // Benutzerregel: contains
      { counterparty: "Finanzamt Berlin Mitte", amountCents: -34000, date: "2026-01-15" },
      // Benutzerregel: Betrag (Gehalt), kein Händler-Treffer
      { counterparty: "Arbeitgeber XY GmbH", amountCents: 320000, date: "2026-01-01" },
      // Benutzerregel: Regex auf purpose
      { counterparty: "Unbekannt", purpose: "Rechnung-2026 Nr. 4471", amountCents: -8900, date: "2026-01-20" },
      // Kein Treffer irgendeiner Art -> bleibt unkategorisiert
      { counterparty: "Voellig Unbekannter Zahlungsempfaenger XJ", amountCents: -777, date: "2026-01-25" },
    ];

    const ids: number[] = [];
    for (const b of bookings) {
      ids.push(await insertRawTransaction(assetId, b));
    }

    await runPipelineForTransactions(ids);

    const results = await Promise.all(
      ids.map(async (id, i) => {
        const rows = await db.select<any[]>(
          "select counterparty, amount_cents, category_id, categorization_source, merchant_id from transactions where id = $1",
          [id],
        );
        const row = rows[0];
        const categoryName = row.category_id
          ? (await db.select<{ name: string }[]>("select name from categories where id = $1", [row.category_id]))[0]?.name ?? null
          : null;
        return {
          input: bookings[i].counterparty,
          amount: row.amount_cents,
          category: categoryName,
          source: row.categorization_source,
          hasMerchant: row.merchant_id !== null,
        };
      }),
    );

    expect(results).toMatchSnapshot();
  });
});
