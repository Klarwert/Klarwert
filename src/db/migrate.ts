import { getDb, runInTransaction } from "@/db/client";
import { seedTemplateCategories } from "@/db/repositories/categories";
import schema001 from "@/db/migrations/001_schema.sql?raw";
import seed002 from "@/db/migrations/002_seed.sql?raw";
import extraFields003 from "@/db/migrations/003_extra_fields.sql?raw";
import tagsSeed004 from "@/db/migrations/004_tags_seed.sql?raw";
import aliasesCustomFields005 from "@/db/migrations/005_aliases_and_custom_fields.sql?raw";
import schemaRound2006 from "@/db/migrations/006_schema_round2.sql?raw";
import aliasesRound2007 from "@/db/migrations/007_aliases_round2.sql?raw";
import fixForeignKeys008 from "@/db/migrations/008_fix_foreign_keys.sql?raw";
import fixAllForeignKeys009 from "@/db/migrations/009_fix_all_foreign_keys.sql?raw";
import personKirchensteuer010 from "@/db/migrations/010_person_kirchensteuer.sql?raw";
import communityDatenbanken011 from "@/db/migrations/011_community_datenbanken.sql?raw";
import contractsDropCircularFk012 from "@/db/migrations/012_contracts_drop_circular_fk.sql?raw";
import categorizationLogAlternatives013 from "@/db/migrations/013_categorization_log_alternatives.sql?raw";
import multiAccountImport014 from "@/db/migrations/014_multi_account_import.sql?raw";
import transferIbanPersonAliases015 from "@/db/migrations/015_transfer_iban_person_aliases.sql?raw";
import fixStaleContractsReference016 from "@/db/migrations/016_fix_stale_contracts_reference.sql?raw";
import importProfileLocallyModified017 from "@/db/migrations/017_import_profile_locally_modified.sql?raw";
import transactionsContractIdIndex018 from "@/db/migrations/018_transactions_contract_id_index.sql?raw";
import ruleTemplates019 from "@/db/migrations/019_rule_templates.sql?raw";
import fixStaleFkReferences020 from "@/db/migrations/020_fix_stale_fk_references.sql?raw";
import ownAccountSuggestionNotification021 from "@/db/migrations/021_own_account_suggestion_notification.sql?raw";
import merchantRulesMerge022 from "@/db/migrations/022_merchant_rules_merge.sql?raw";
import ruleConditionGroups023 from "@/db/migrations/023_rule_condition_groups.sql?raw";
import pipelineFinalisierung024 from "@/db/migrations/024_pipeline_finalisierung.sql?raw";
import architekturFinalisierung025 from "@/db/migrations/025_architektur_finalisierung.sql?raw";
import operationsLog026 from "@/db/migrations/026_operations_log.sql?raw";
import depot027 from "@/db/migrations/027_depot.sql?raw";
import cleanupEmptyRules028 from "@/db/migrations/028_cleanup_empty_rules.sql?raw";
import rulesPriorityUnique029 from "@/db/migrations/029_rules_priority_unique.sql?raw";
import budgetPeriodsUnique030 from "@/db/migrations/030_budget_periods_unique.sql?raw";
import merchantSource031 from "@/db/migrations/031_merchant_source.sql?raw";
import steuerThemenTemplateKey032 from "@/db/migrations/032_steuer_themen_template_key.sql?raw";
import dropRuleTemplates033 from "@/db/migrations/033_drop_rule_templates.sql?raw";

interface MigrationDef {
  version: number;
  name: string;
  sql: string;
}

const MIGRATIONS: MigrationDef[] = [
  { version: 1, name: "schema", sql: schema001 },
  { version: 2, name: "seed", sql: seed002 },
  { version: 3, name: "extra_fields", sql: extraFields003 },
  { version: 4, name: "tags_seed", sql: tagsSeed004 },
  { version: 5, name: "aliases_and_custom_fields", sql: aliasesCustomFields005 },
  { version: 6, name: "schema_round2", sql: schemaRound2006 },
  { version: 7, name: "aliases_round2", sql: aliasesRound2007 },
  { version: 8, name: "fix_foreign_keys", sql: fixForeignKeys008 },
  { version: 9, name: "fix_all_foreign_keys", sql: fixAllForeignKeys009 },
  { version: 10, name: "person_kirchensteuer", sql: personKirchensteuer010 },
  { version: 11, name: "community_datenbanken", sql: communityDatenbanken011 },
  { version: 12, name: "contracts_drop_circular_fk", sql: contractsDropCircularFk012 },
  { version: 13, name: "categorization_log_alternatives", sql: categorizationLogAlternatives013 },
  { version: 14, name: "multi_account_import", sql: multiAccountImport014 },
  { version: 15, name: "transfer_iban_person_aliases", sql: transferIbanPersonAliases015 },
  { version: 16, name: "fix_stale_contracts_reference", sql: fixStaleContractsReference016 },
  { version: 17, name: "import_profile_locally_modified", sql: importProfileLocallyModified017 },
  { version: 18, name: "transactions_contract_id_index", sql: transactionsContractIdIndex018 },
  { version: 19, name: "rule_templates", sql: ruleTemplates019 },
  { version: 20, name: "fix_stale_fk_references", sql: fixStaleFkReferences020 },
  { version: 21, name: "own_account_suggestion_notification", sql: ownAccountSuggestionNotification021 },
  { version: 22, name: "merchant_rules_merge", sql: merchantRulesMerge022 },
  { version: 23, name: "rule_condition_groups", sql: ruleConditionGroups023 },
  { version: 24, name: "pipeline_finalisierung", sql: pipelineFinalisierung024 },
  { version: 25, name: "architektur_finalisierung", sql: architekturFinalisierung025 },
  { version: 26, name: "operations_log", sql: operationsLog026 },
  { version: 27, name: "depot", sql: depot027 },
  { version: 28, name: "cleanup_empty_rules", sql: cleanupEmptyRules028 },
  { version: 29, name: "rules_priority_unique", sql: rulesPriorityUnique029 },
  { version: 30, name: "budget_periods_unique", sql: budgetPeriodsUnique030 },
  { version: 31, name: "merchant_source", sql: merchantSource031 },
  { version: 32, name: "steuer_themen_template_key", sql: steuerThemenTemplateKey032 },
  { version: 33, name: "drop_rule_templates", sql: dropRuleTemplates033 },
];

/**
 * Teilt ein SQL-Skript an Top-Level-Semikola in Einzelstatements auf.
 * Berücksichtigt Semikola innerhalb von '...'-String-Literalen (inkl. '' als
 * escapetes Anführungszeichen) sowie innerhalb von `--`-Zeilenkommentaren,
 * damit z. B. `check (x in (';'))` oder `-- hex; ...` nicht fälschlich brechen.
 */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inString = false;
  let inLineComment = false;

  for (let idx = 0; idx < sql.length; idx += 1) {
    const char = sql[idx];
    current += char;

    if (inLineComment) {
      if (char === "\n") inLineComment = false;
      continue;
    }

    if (char === "'") {
      if (inString && sql[idx + 1] === "'") {
        current += sql[idx + 1];
        idx += 1;
      } else {
        inString = !inString;
      }
    } else if (!inString && char === "-" && sql[idx + 1] === "-") {
      inLineComment = true;
      current += sql[idx + 1];
      idx += 1;
    } else if (char === ";" && !inString) {
      const trimmed = current.slice(0, -1).trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = "";
    }
  }

  const rest = current.trim();
  if (rest.length > 0) statements.push(rest);

  return statements;
}

/**
 * Stellt sicher, dass nach einem abgebrochenen oder fehlgeschlagenen Migrationsversuch
 * (z. B. wenn _fix_temp oder _clean_temp-Tabellen existieren) die Datenbank vor dem
 * Ausführen ausstehender Migrationen in einen sauberen Zustand zurückversetzt wird.
 */
async function sanitizeDatabaseState(): Promise<void> {
  const db = await getDb();
  await db.execute("PRAGMA foreign_keys = OFF;");
  try {
    // "_rebuild_old" deckt Leichen aus Table-Rebuild-Migrationen ab (z. B. rules_rebuild_old aus
    // Migration 016), die vor dem Transaktions-Fix in migrate.ts (siehe applyMigrations) bei einem
    // mittendrin fehlschlagenden Rebuild dauerhaft liegen bleiben konnten. Bereits betroffene
    // Installationen heilen sich damit beim nächsten Start selbst, ohne die Migration erneut
    // ausführen zu müssen (die ohnehin idempotent wäre, aber so schneller wieder lauffähig ist).
    const tempTables = await db.select<{ name: string }[]>(
      "select name from sqlite_master where type = 'table' and (name like '%_fix_temp%' or name like '%_clean_temp%' or name like '%_temp' or name like '%_rebuild_old')",
    );

    for (const tempTable of tempTables) {
      const tempName = tempTable.name;
      const baseName = tempName
        .replace("_fix_temp", "")
        .replace("_clean_temp", "")
        .replace("_rebuild_old", "")
        .replace("_temp", "");

      if (!baseName) continue;

      const mainTableCheck = await db.select<{ count: number }[]>(
        `select count(*) as count from sqlite_master where type = 'table' and name = '${baseName}'`,
      );

      const mainExists = mainTableCheck.length > 0 && mainTableCheck[0].count > 0;

      if (mainExists) {
        let mainCount = 0;
        let tempCount = 0;
        try {
          const resM = await db.select<{ count: number }[]>(`select count(*) as count from ${baseName}`);
          mainCount = resM[0]?.count ?? 0;
        } catch {
          // Tabelle existiert nicht (mehr) oder ist nicht lesbar, mainCount bleibt 0
        }
        try {
          const resT = await db.select<{ count: number }[]>(`select count(*) as count from ${tempName}`);
          tempCount = resT[0]?.count ?? 0;
        } catch {
          // Temp-Tabelle existiert nicht (mehr) oder ist nicht lesbar, tempCount bleibt 0
        }

        if (mainCount === 0 && tempCount > 0) {
          await db.execute(`drop table if exists ${baseName}`);
          await db.execute(`alter table ${tempName} rename to ${baseName}`);
        } else {
          await db.execute(`drop table if exists ${tempName}`);
        }
      } else {
        await db.execute(`alter table ${tempName} rename to ${baseName}`);
      }
    }
  } catch (e) {
    console.warn("Sanitize database state notice:", e);
  } finally {
    await db.execute("PRAGMA foreign_keys = ON;");
  }
}

let migrationsRun: Promise<void> | null = null;

/** Führt alle noch nicht angewendeten, nummerierten Migrationen beim App-Start aus. */
export async function runMigrations(): Promise<void> {
  if (!migrationsRun) {
    migrationsRun = applyMigrations();
  }
  return migrationsRun;
}

async function ensureEssentialColumnsExist(): Promise<void> {
  const db = await getDb();
  const alterStatements = [
    // categories
    "alter table categories add column is_hidden integer not null default 0",
    "alter table categories add column is_template integer not null default 0",
    "alter table categories add column is_system integer not null default 0",
    "alter table categories add column sort_order integer not null default 0",
    "alter table categories add column is_deleted integer not null default 0",
    "alter table categories add column template_key text",

    // transactions
    "alter table transactions add column value_date text",
    "alter table transactions add column extra_fields_json text",
    "alter table transactions add column fingerprint text",
    "alter table transactions add column import_id integer",
    "alter table transactions add column category_id integer",
    "alter table transactions add column categorization_source text default 'none'",
    "alter table transactions add column applied_rule_id integer",
    "alter table transactions add column merchant_id integer",
    "alter table transactions add column categorization_confidence real",
    "alter table transactions add column is_reviewed integer default 1",
    "alter table transactions add column is_transfer integer default 0",
    "alter table transactions add column transfer_pair_id integer",
    "alter table transactions add column transfer_status text",
    "alter table transactions add column is_saving integer default 0",
    "alter table transactions add column sparzweck_id integer",
    "alter table transactions add column exclude_from_stats integer default 0",
    "alter table transactions add column contract_id integer",
    "alter table transactions add column recurring_payment_id integer",
    "alter table transactions add column is_deleted integer default 0",

    // import_profiles
    "alter table import_profiles add column source_version text",
    "alter table import_profiles add column import_all_columns integer not null default 0",
    "alter table import_profiles add column account_column_index integer",
    "alter table import_profiles add column locally_modified integer not null default 0",

    // assets
    "alter table assets add column iban text",

    // rules
    "alter table rules add column created_from text not null default 'manual'",
    "alter table rules add column source_contract_id integer",

    // categorization_log
    "alter table categorization_log add column alternatives_json text",

    // contracts
    "alter table contracts add column is_manual integer not null default 0",
    "alter table contracts add column amount_tolerance_percent real not null default 5",
    "alter table contracts add column merchant_id integer",
    "alter table contracts add column confidence real",

    // recurring_payments
    "alter table recurring_payments add column category_id integer",

    // persons
    "alter table persons add column birth_year integer",
    "alter table persons add column kirchensteuer_aktiv integer not null default 0",
    "alter table persons add column bundesland text",
  ];

  for (const stmt of alterStatements) {
    try {
      await db.execute(stmt);
    } catch {
      // Ignoriere Fehler wie "duplicate column name" oder "no such table"
    }
  }
}

async function verifySchemaIntegrity(): Promise<void> {
  const db = await getDb();
  const tables = await db.select<{ name: string; sql: string }[]>(
    "select name, sql from sqlite_master where type='table'",
  );

  const expectedChecks: Record<string, string[]> = {
    transactions: ["'merchant'", "'similarity'", "'rule'", "'contract'", "'manual'"],
    contracts: ["'suggested_ended'", "'detected'", "'confirmed'", "'price_changed'", "'paused'", "'ended'"],
    assets: ["'account'", "'valuable'", "'giro'", "'tagesgeld'", "'kreditkarte'", "'depot'", "'darlehen'"],
    persons: ["'adult'", "'child'"],
  };

  for (const [tableName, checks] of Object.entries(expectedChecks)) {
    const tableDef = tables.find((t) => t.name === tableName);
    if (!tableDef) continue;
    for (const check of checks) {
      if (!tableDef.sql.includes(check)) {
        throw new Error(
          `Schema-Integritätsprüfung fehlgeschlagen: Tabelle '${tableName}' Check-Constraint fehlt '${check}' (Veraltetes Schema).`,
        );
      }
    }
  }
}

async function applyMigrations(): Promise<void> {
  const db = await getDb();
  const { createAutoBackup } = await import("@/db/repositories/backup");

  // Bereinige evtl. vorhandene temporäre Tabellen aus vorherigen abgebrochenen Durchläufen
  await sanitizeDatabaseState();

  // Stellt sicher, dass neuere Spalten existieren, selbst bei unvollständigen/älteren DB-Ständen
  await ensureEssentialColumnsExist();

  await db.execute(
    `create table if not exists _migrations (
      version integer primary key
    , name text not null
    , applied_at text not null default (datetime('now'))
    )`,
  );

  const applied = await db.select<{ version: number }[]>(
    "select version from _migrations",
  );
  const appliedVersions = new Set(applied.map((row) => row.version));
  
  const currentMaxVersion = MIGRATIONS.length > 0 ? MIGRATIONS[MIGRATIONS.length - 1].version : 0;
  const dbMaxVersion = Math.max(0, ...applied.map(r => r.version));

  if (dbMaxVersion > currentMaxVersion) {
    const { MigrationError } = await import("@/lib/errors");
    throw new MigrationError(
      `Die Datenbank (Version ${dbMaxVersion}) ist neuer als diese App (unterstützt bis ${currentMaxVersion}). Bitte installiere ein Update der App.`,
      "Schema-Version in _migrations ist größer als die in MIGRATIONS definierte Version."
    );
  }

  try {
    // Führe die einmalige TS-Migration aus, BEVOR neue SQL-Migrationen laufen.
    // So kann sie auf Tabellen (wie rule_templates) zugreifen, bevor diese ggf. in neuen Migrationen gedroppt werden.
    const { migrateRuleTemplatesToMerchants } = await import("@/db/repositories/migrateRuleTemplates");
    await migrateRuleTemplatesToMerchants();
  } catch (e) {
    // Wenn die Tabelle z.B. schon gedroppt wurde oder ein anderer Fehler auftritt.
    console.warn("Rule-template -> merchant migration notice:", e);
  }

  const pending = MIGRATIONS.filter((m) => !appliedVersions.has(m.version)).sort(
    (a, b) => a.version - b.version,
  );

  if (pending.length > 0) {
    await createAutoBackup();
    await db.execute("PRAGMA foreign_keys = OFF;");
    try {
      for (const migration of pending) {
        // CLAUDE.md "Daten-Robustheit": jede Migration läuft in EINER Transaktion, Rollback bei
        // Fehler, kein Teilzustand. Vorher fehlte das hier komplett – ein mitten in einem
        // Table-Rebuild (z. B. Migration 016, rules -> rules_rebuild_old -> rules) fehlschlagender
        // Schritt hinterließ die Zwischentabelle dauerhaft, weil nichts zurückgerollt wurde
        // ("no such table: main.rules_rebuild_old" bei jedem folgenden Start). Mit echtem
        // BEGIN/COMMIT/ROLLBACK pro Migration bleibt bei einem Fehler der Vorzustand vollständig
        // erhalten und dieselbe, korrekte Migration wird beim nächsten Start einfach erneut versucht.
        await runInTransaction(async (txDb) => {
          // Erneut aufrufen (nicht nur einmal vor der Schleife): bei einer wirklich frischen
          // Installation existiert z. B. `transactions` beim ersten Aufruf ganz oben noch nicht
          // (Migration 1 legt die Tabelle erst an) – die dortigen ALTER TABLE-Versuche schlagen
          // dann mit "no such table" fehl (stillschweigend ignoriert) und Spalten wie `value_date`
          // fehlen dadurch tatsächlich, wenn ein späteres Rebuild (z. B. Migration 008/009) sie schon
          // beim Kopieren aus der alten Tabelle braucht ("no such column: value_date"). Idempotent
          // und billig genug, um vor jeder Migration erneut zu laufen.
          await ensureEssentialColumnsExist();
          for (const statement of splitStatements(migration.sql)) {
            try {
              await txDb.execute(statement);
            } catch (e) {
              const errStr = String(e).toLowerCase();
              // Ignoriere unschädliche Fehler, wenn Spalten/Tabellen/Indizes bereits existieren
              if (
                errStr.includes("duplicate column name") ||
                errStr.includes("already exists")
              ) {
                console.warn(
                  `[Migration v${migration.version} '${migration.name}'] Ignoriere redundantes DDL:`,
                  statement,
                );
              } else {
                throw e;
              }
            }
          }
          await txDb.execute(
            "insert into _migrations (version, name) values ($1, $2)",
            [migration.version, migration.name],
          );
        });
      }
    } finally {
      await db.execute("PRAGMA foreign_keys = ON;");
    }
  }

  // HINWEIS: Der frühere "Self-healing check" hier wurde entfernt (verursachte selbst einen Bug).
  // Er suchte per `sql like '%_old%'` nach vermeintlich verwaisten Tabellen und spielte bei jedem
  // App-Start pauschal fixAllForeignKeys009 erneut ein. Problem: `rules.source_contract_id` enthielt
  // dauerhaft die Textreferenz "contracts_old" (Altlast einer früheren Rename-Migration) – das ließ
  // die Prüfung auf JEDEM Start anschlagen und den alten (Vor-012-)contracts-Rebuild erneut laufen,
  // wodurch migrate.ts Migration 012 (merchant_id/confidence/amount_tolerance_percent) bei jedem
  // Neustart wieder rückgängig gemacht wurde ("no such column: merchant_id" beim Import). Migration
  // 016 behebt den Ist-Zustand einmalig und endgültig; ein pauschaler Text-Scan über alle Tabellen
  // ist zu fehleranfällig, um ihn als wiederkehrenden Automatismus zu behalten.

  // Stellt sicher, dass Standard-Kategorien und Händler immer existieren (idempotent, siehe CLAUDE.md "Daten-Robustheit")
  await seedTemplateCategories();
  try {
    const { seedDefaultMerchants } = await import("@/db/repositories/merchants");
    await seedDefaultMerchants();
  } catch (e) {
    console.warn("Merchant seed notice:", e);
  }

  // B3: Migrations-Integritätsprüfung beim Start
  await verifySchemaIntegrity();
}

/**
 * Repariert die Datenbank: Führt Bereinigung verwaister Temp-Tabellen aus,
 * wendet ausstehende Migrationen an und führt ein PRAGMA quick_check aus.
 */
export async function repairDatabase(): Promise<void> {
  migrationsRun = null;
  const db = await getDb();
  await sanitizeDatabaseState();
  await applyMigrations();
  const checkResult = await db.select<{ quick_check: string }[]>("PRAGMA quick_check;");
  if (checkResult.length > 0 && checkResult[0].quick_check !== "ok") {
    throw new Error(`Integritätsprüfung fehlgeschlagen: ${checkResult[0].quick_check}`);
  }
}

/**
 * Setzt die komplette Datenbank auf Werkszustand zurück.
 * Löscht alle Benutzertabellen, führt Migrationen neu aus und setzt Onboarding zurück.
 */
export async function resetDatabase(): Promise<void> {
  migrationsRun = null;
  const db = await getDb();

  await db.execute("PRAGMA foreign_keys = OFF;");
  try {
    const tables = await db.select<{ name: string }[]>(
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%'",
    );
    for (const { name } of tables) {
      await db.execute(`drop table if exists ${name}`);
    }
  } finally {
    await db.execute("PRAGMA foreign_keys = ON;");
  }

  await applyMigrations();

  await db.execute(
    "insert or replace into settings (key, value) values ('onboarding_done', '0')",
  );
}

