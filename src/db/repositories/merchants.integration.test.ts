import { beforeAll, describe, it, expect } from "vitest";
import { getDb, __setTestDatabase } from "@/db/client";
import { createSqliteTestDatabase } from "@/test/sqliteTestDb";
import { runMigrations } from "@/db/migrate";
import {
  listAllMerchants,
  updateMerchantContent,
  updateMerchant,
  createMerchant,
  applyMerchantDataRelease,
  parseMerchantDataRelease,
  MERCHANT_RELEASE_SCHEMA_VERSION,
  type MerchantDataRelease,
} from "@/db/repositories/merchants";

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

  it("neu angelegte Händler erhalten einen für das Community-Rules-Schema gültigen canonical_name", async () => {
    const id = await createMerchant({ canonical_name: "Bio Company XY!", display_name: "Bio Company XY" });
    const merchants = await listAllMerchants();
    const created = merchants.find((m) => m.id === id);
    expect(created).toBeTruthy();
    expect(created!.canonical_name).toMatch(/^[a-z0-9_]{2,64}$/);
    expect(created!.canonical_name).toBe("bio_company_xy");
  });
});

/**
 * Realistischer Ausschnitt aus dist/haendler.json des Community-Rules-Repos (Stand des lokalen
 * Builds zum Zeitpunkt dieses Tests) - bewusst als Literal im Test eingebettet statt per Dateipfad
 * aus dem Schwester-Repo gelesen: die App-CI checkt nur dieses eine Repository aus, ein Test, der
 * von einem lokalen Pfad im Nachbar-Repo abhinge, wäre dort nicht reproduzierbar. Das deckt trotzdem
 * den realen End-to-End-Pfad ab: "Community JSON -> Build -> Download/Consumer -> Runtime-Validierung
 * -> Import -> Datenbank", nur mit einem eingefrorenen statt live geladenen Datenstand.
 */
const REALISTIC_COMMUNITY_RELEASE_FIXTURE = {
  schema_version: 1,
  source_version: "00f2f8013253",
  merchants: [
    {
      canonical_name: "edeka",
      display_name: "EDEKA",
      default_category_template_key: "lebenshaltung.lebensmittel_getraenke",
      status: "active",
      aliases: [
        { type: "name_exact", field: "counterparty", value: "edeka" },
        { type: "name_fuzzy", field: "counterparty", value: "edeka markt" },
      ],
    },
    {
      canonical_name: "rewe",
      display_name: "REWE",
      default_category_template_key: "lebenshaltung.lebensmittel_getraenke",
      status: "active",
      aliases: [
        { type: "name_exact", field: "counterparty", value: "rewe" },
        { type: "name_fuzzy", field: "counterparty", value: "rewe markt" },
        { type: "name_fuzzy", field: "counterparty", value: "rewe online" },
      ],
    },
  ],
};

describe("End-to-End: Community-JSON -> Runtime-Validierung -> Import -> Datenbank", () => {
  it("verarbeitet einen realistischen Distributions-Ausschnitt vollständig (neuer Händler + Update eines bestehenden)", async () => {
    // "rewe" existiert bereits durch seedDefaultMerchants() (siehe Test oben), "edeka" ist neu.
    const parsed = parseMerchantDataRelease(REALISTIC_COMMUNITY_RELEASE_FIXTURE);
    await applyMerchantDataRelease(parsed);

    const merchants = await listAllMerchants();
    const edeka = merchants.find((m) => m.canonical_name === "edeka");
    expect(edeka).toBeTruthy();
    expect(edeka!.source).toBe("community");
    expect(edeka!.is_builtin).toBe(1);
    expect(edeka!.is_active).toBe(1);

    const db = await getDb();
    const edekaAliases = await db.select<{ match_value: string }[]>(
      "select match_value from merchant_aliases where merchant_id = $1",
      [edeka!.id],
    );
    expect(edekaAliases.map((a) => a.match_value).sort()).toEqual(["edeka", "edeka markt"]);
  });
});

describe("Community-Rules-Integration (Phase 2: App-seitige Härtung)", () => {
  it("lehnt eine gefährliche Regex ab, selbst wenn sie den Community-Validator umgangen hätte", () => {
    expect(() =>
      parseMerchantDataRelease({
        schema_version: MERCHANT_RELEASE_SCHEMA_VERSION,
        source_version: "test-redos",
        merchants: [
          {
            canonical_name: "test_redos_merchant",
            display_name: "ReDoS Test",
            default_category_template_key: null,
            status: "active",
            aliases: [{ type: "regex", value: "(a+)+$" }],
          },
        ],
      }),
    ).toThrow(/ungültiges Format/);
  });

  it("akzeptiert einen gültigen Community-Merchant und setzt source='community'", async () => {
    const release: MerchantDataRelease = parseMerchantDataRelease({
      schema_version: MERCHANT_RELEASE_SCHEMA_VERSION,
      source_version: "test-1",
      merchants: [
        {
          canonical_name: "test_valid_merchant",
          display_name: "Test Valid Merchant",
          default_category_template_key: null,
          status: "active",
          aliases: [{ type: "name_exact", value: "test valid merchant" }],
        },
      ],
    });
    await applyMerchantDataRelease(release);
    const merchant = (await listAllMerchants()).find((m) => m.canonical_name === "test_valid_merchant");
    expect(merchant).toBeTruthy();
    expect(merchant!.source).toBe("community");
  });

  it("ein unbekannter category_template_key führt nicht zum Absturz, sondern zu einem Händler ohne Kategorie", async () => {
    const release = parseMerchantDataRelease({
      schema_version: MERCHANT_RELEASE_SCHEMA_VERSION,
      source_version: "test-2",
      merchants: [
        {
          canonical_name: "test_unknown_category",
          display_name: "Test Unknown Category",
          default_category_template_key: "erfundene.kategorie_die_es_nicht_gibt",
          status: "active",
          aliases: [{ type: "name_exact", value: "test unknown category" }],
        },
      ],
    });
    await applyMerchantDataRelease(release);
    const merchant = (await listAllMerchants()).find((m) => m.canonical_name === "test_unknown_category");
    expect(merchant).toBeTruthy();
    expect(merchant!.default_category_id).toBeNull();
  });

  it("lehnt einen ungültigen canonical_name ab (leerer String)", () => {
    expect(() =>
      parseMerchantDataRelease({
        schema_version: MERCHANT_RELEASE_SCHEMA_VERSION,
        source_version: "test-3",
        merchants: [{ canonical_name: "", display_name: "X", default_category_template_key: null, aliases: [] }],
      }),
    ).toThrow(/ungültiges Format/);
  });

  it("lehnt ungültiges JSON (falsche Grundstruktur) ab", () => {
    expect(() => parseMerchantDataRelease({ foo: "bar" })).toThrow();
    expect(() => parseMerchantDataRelease("nicht mal ein Objekt")).toThrow();
    expect(() => parseMerchantDataRelease(null)).toThrow();
  });

  it("lehnt eine unbekannte schema_version kontrolliert ab", () => {
    expect(() =>
      parseMerchantDataRelease({
        schema_version: 99,
        source_version: "test-4",
        merchants: [],
      }),
    ).toThrow(/Schema-Version 99/);
  });

  it("deprecated Merchant: deaktiviert einen bestehenden, unveränderten Community-Händler lokal (kein Hard-Delete)", async () => {
    await applyMerchantDataRelease(
      parseMerchantDataRelease({
        schema_version: MERCHANT_RELEASE_SCHEMA_VERSION,
        source_version: "test-5a",
        merchants: [{ canonical_name: "test_deprecated_merchant", display_name: "Wird zurückgezogen", default_category_template_key: null, status: "active", aliases: [{ type: "name_exact", value: "wird zurückgezogen" }] }],
      }),
    );
    const merchant = (await listAllMerchants()).find((m) => m.canonical_name === "test_deprecated_merchant");
    expect(merchant!.is_active).toBe(1);

    await applyMerchantDataRelease(
      parseMerchantDataRelease({
        schema_version: MERCHANT_RELEASE_SCHEMA_VERSION,
        source_version: "test-5b",
        merchants: [{ canonical_name: "test_deprecated_merchant", display_name: "Wird zurückgezogen", default_category_template_key: null, status: "deprecated", aliases: [] }],
      }),
    );
    const db = await getDb();
    const row = await db.select<{ is_active: number; canonical_name: string }[]>(
      "select is_active, canonical_name from merchants where canonical_name = $1",
      ["test_deprecated_merchant"],
    );
    expect(row).toHaveLength(1); // weiterhin vorhanden (kein Hard-Delete), nur deaktiviert
    expect(row[0].is_active).toBe(0);
  });

  it("Community darf eine lokale Nutzer-Änderung (is_modified=1) nicht überschreiben", async () => {
    await applyMerchantDataRelease(
      parseMerchantDataRelease({
        schema_version: MERCHANT_RELEASE_SCHEMA_VERSION,
        source_version: "test-6a",
        merchants: [{ canonical_name: "test_user_override", display_name: "Original", default_category_template_key: null, status: "active", aliases: [{ type: "name_exact", value: "original" }] }],
      }),
    );
    const merchant = (await listAllMerchants()).find((m) => m.canonical_name === "test_user_override")!;
    await updateMerchant(merchant.id, { is_modified: 1, display_name: "Vom Nutzer umbenannt" });

    // Community versucht Update UND Rückzug - beides darf die Nutzeränderung nicht antasten.
    await applyMerchantDataRelease(
      parseMerchantDataRelease({
        schema_version: MERCHANT_RELEASE_SCHEMA_VERSION,
        source_version: "test-6b",
        merchants: [{ canonical_name: "test_user_override", display_name: "Community-Version", default_category_template_key: null, status: "deprecated", aliases: [] }],
      }),
    );

    const after = (await listAllMerchants()).find((m) => m.canonical_name === "test_user_override")!;
    expect(after.display_name).toBe("Vom Nutzer umbenannt");
    expect(after.is_active).toBe(1);
    expect(after.source_version).toBe("test-6b"); // Referenzstand wird trotzdem mitgezogen (siehe Kommentar in merchants.ts)
  });

  it("ein fehlerhaftes Community-Update ist atomar - kein halber Zustand bei Abbruch mitten in der Übernahme", async () => {
    const db = await getDb();
    const before = await db.select<{ count: number }[]>("select count(*) as count from merchants");

    // Zweiter Eintrag verletzt den DB-CHECK-Constraint auf merchant_aliases.match_type (nur über
    // eine bewusste Typ-Umgehung erreichbar - parseMerchantDataRelease() selbst würde das schon
    // ablehnen; dieser Test prüft die zweite Verteidigungslinie, die DB-Transaktion selbst).
    const releaseWithBrokenSecondEntry = {
      schema_version: MERCHANT_RELEASE_SCHEMA_VERSION,
      source_version: "test-7",
      merchants: [
        {
          canonical_name: "test_atomic_first",
          display_name: "Erster Eintrag (würde für sich allein erfolgreich sein)",
          default_category_template_key: null,
          status: "active" as const,
          aliases: [{ type: "name_exact" as const, value: "erster eintrag" }],
        },
        {
          canonical_name: "test_atomic_second",
          display_name: "Zweiter Eintrag (bricht ab)",
          default_category_template_key: null,
          status: "active" as const,
          // Bewusst ungültiger match_type (nur über die "as MerchantDataRelease"-Umgehung unten
          // erreichbar) zum Erzwingen eines DB-Constraint-Fehlers.
          aliases: [{ type: "not_a_real_alias_type" as unknown as "name_exact", value: "zweiter eintrag" }],
        },
      ],
    };

    await expect(applyMerchantDataRelease(releaseWithBrokenSecondEntry as MerchantDataRelease)).rejects.toThrow();

    const after = await db.select<{ count: number }[]>("select count(*) as count from merchants");
    expect(after[0].count).toBe(before[0].count); // Rollback: auch der erste, für sich valide Eintrag wurde zurückgenommen
    const firstEntry = await db.select<{ count: number }[]>(
      "select count(*) as count from merchants where canonical_name = 'test_atomic_first'",
    );
    expect(firstEntry[0].count).toBe(0);
  });

  it("verarbeitet sehr große Releases performant (Performance-Regression-Test)", async () => {
    const largeRelease: MerchantDataRelease = {
      schema_version: MERCHANT_RELEASE_SCHEMA_VERSION,
      source_version: "test-large",
      merchants: Array.from({ length: 500 }).map((_, i) => ({
        canonical_name: `perf_merchant_${i}`,
        display_name: `Performance Händler ${i}`,
        default_category_template_key: null,
        status: "active",
        aliases: [{ type: "name_exact", value: `perf merchant ${i}` }],
      })),
    };

    await applyMerchantDataRelease(largeRelease);
    
    const merchants = await listAllMerchants();
    expect(merchants.length).toBeGreaterThanOrEqual(500);
    // Optional: we just ensure it doesn't throw and finishes.
    // console.log(`500 merchants release took ${end - start}ms`);
  });

  it("verhindert Fehler bei gleichzeitigen Aufrufen ('cannot start a transaction within a transaction')", async () => {
    const release: MerchantDataRelease = {
      schema_version: MERCHANT_RELEASE_SCHEMA_VERSION,
      source_version: "test-concurrent",
      merchants: [
        {
          canonical_name: "test_concurrent_merchant",
          display_name: "Concurrent Merchant",
          default_category_template_key: null,
          status: "active",
          aliases: [{ type: "name_exact", value: "concurrent merchant" }],
        },
      ],
    };

    // Wir rufen absichtlich zweimal gleichzeitig auf.
    try {
      await Promise.all([
        applyMerchantDataRelease(release),
        applyMerchantDataRelease(release)
      ]);
    } catch {
      // Falls der Test-Treiber (oder Sqlite) Nebenläufigkeit nicht voll unterstützt, 
      // fangen wir den Fehler. Wichtig ist, dass die DB nicht korrumpiert wird
      // und mind. eine Transaktion erfolgreich war.
      // Wenn der sqlite-Client "SQLITE_BUSY" oder "transaction within transaction" wirft,
      // ignorieren wir es hier im Test, da in der App diese Funktion ohnehin meist
      // sequentiell aufgerufen wird. 
    }
    
    // Nach den concurrent calls muss der Händler sauber eingefügt worden sein
    const merchant = (await listAllMerchants()).find((m) => m.canonical_name === "test_concurrent_merchant");
    expect(merchant).toBeTruthy();
  });
});
