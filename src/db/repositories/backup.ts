import { getDb, runInTransaction } from "@/db/client";
import { seedTemplateCategories } from "@/db/repositories/categories";
import { appDataDir, documentDir, join } from "@tauri-apps/api/path";
import { copyFile, exists, mkdir, readDir, remove, writeTextFile } from "@tauri-apps/plugin-fs";

export interface BackupData {
  version: number;
  exported_at: string;
  tables: Record<string, any[]>;
}

// Reihenfolge orientiert sich (grob) an den Fremdschlüssel-Abhängigkeiten, damit Backups auch ohne
// PRAGMA defer_foreign_keys lesbar blieben – verbindlich abgesichert wird das aber unten in
// importBackupJson()/deleteAllData() über defer_foreign_keys, weil sich bei ~30 Tabellen eine von
// Hand gepflegte, perfekt zyklenfreie Reihenfolge nicht zuverlässig garantieren lässt (siehe z. B.
// rules.source_contract_id -> contracts, aber contracts.merchant_id -> merchants, während transactions
// wiederum auf rules, contracts, merchants UND sich selbst (transfer_pair_id) verweist).
//
// Achtung beim Ergänzen künftiger Tabellen: diese Liste muss vollständig sein. Vergessene Tabellen
// werden beim Export lautlos leer geschrieben (siehe try/catch in exportBackupJson) – das genau war
// der Fehler, der hier behoben wurde ("import_records" statt "imports", u.a. das komplette
// Wertpapierdepot fehlte). `_migrations` und `meta` sind bewusst ausgeschlossen: beides ist
// installationsgebundene Schema-Verwaltung, kein Nutzerdaten (meta wird von der App nirgends
// gelesen, siehe migrate.ts), ein Restore soll die Ziel-Installation dort nicht überschreiben.
const BACKUP_TABLES = [
  "persons",
  "sparzwecke",
  "import_profiles",
  "tags",
  "custom_fields",
  "categories",
  "category_aliases",
  "merchants",
  "merchant_aliases",
  "merchant_suppressions",
  "rule_templates",
  "assets",
  "asset_owners",
  "value_history",
  "import_profile_account_map",
  "imports",
  "contracts",
  "recurring_payments",
  "rules",
  "rule_condition_groups",
  "rule_conditions",
  "transactions",
  "transaction_splits",
  "transaction_tags",
  "transaction_custom_values",
  "categorization_log",
  "collections",
  "collection_transactions",
  "dismissed_transfer_patterns",
  "person_aliases",
  "budgets",
  "budget_periods",
  "steuer_themen",
  "steuer_thema_categories",
  "steuer_thema_keywords",
  "depot_positions",
  "depot_prices",
  "notifications",
  "history_log",
  "operations",
  "exports",
  "calculator_scenarios",
  "widgets",
  "settings",
];

export async function exportBackupJson(): Promise<string> {
  const db = await getDb();
  const tablesData: Record<string, any[]> = {};

  for (const table of BACKUP_TABLES) {
    try {
      const rows = await db.select<any[]>(`select * from ${table}`);
      tablesData[table] = rows;
    } catch {
      tablesData[table] = [];
    }
  }

  const backup: BackupData = {
    version: 1,
    exported_at: new Date().toISOString(),
    tables: tablesData,
  };

  return JSON.stringify(backup, null, 2);
}

export async function createAutoBackup(): Promise<void> {
  try {
    const appData = await appDataDir();
    const dbPath = await join(appData, "klarwert.db");
  
    const docDir = await documentDir();
    const backupDir = await join(docDir, "Klarwert", "Backups");
    
    if (!(await exists(backupDir))) {
      await mkdir(backupDir, { recursive: true });
    }
  
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFileName = `klarwert-${timestamp}.db`;
    const backupPath = await join(backupDir, backupFileName);
  
    await copyFile(dbPath, backupPath);
  
    // Rotation: Keep last 10 backups
    const entries = await readDir(backupDir);
    const dbFiles = entries.filter(e => e.name?.endsWith('.db')).sort((a, b) => (a.name > b.name ? 1 : -1));
    
    if (dbFiles.length > 10) {
      const toDelete = dbFiles.slice(0, dbFiles.length - 10);
      for (const file of toDelete) {
        if (file.name) {
          const pathToDelete = await join(backupDir, file.name);
          await remove(pathToDelete);
        }
      }
    }
  } catch (e) {
    console.error("Auto backup failed", e);
  }
}

export async function exportCsvBackup(): Promise<void> {
  const db = await getDb();
  const docDir = await documentDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const exportDir = await join(docDir, "Klarwert", `Export-CSV-${timestamp}`);
  
  if (!(await exists(exportDir))) {
    await mkdir(exportDir, { recursive: true });
  }

  for (const table of BACKUP_TABLES) {
    try {
      const rows = await db.select<any[]>(`select * from ${table}`);
      if (rows.length === 0) continue;
      
      const headers = Object.keys(rows[0]);
      const csvLines = [
        headers.join(","),
        ...rows.map(row => 
          headers.map(h => {
            let val = row[h];
            if (val === null || val === undefined) return "";
            val = String(val).replace(/"/g, '""');
            if (val.includes(",") || val.includes('"') || val.includes("\n")) {
              return `"${val}"`;
            }
            return val;
          }).join(",")
        )
      ];
      
      const csvPath = await join(exportDir, `${table}.csv`);
      await writeTextFile(csvPath, csvLines.join("\n"));
    } catch (e) {
      console.warn(`CSV Export failed for table ${table}`, e);
    }
  }
}

export async function importBackupJson(jsonContent: string): Promise<void> {
  let data: BackupData;
  try {
    data = JSON.parse(jsonContent);
  } catch (e) {
    throw new Error(`Ungültiges JSON-Format: ${String(e)}`, { cause: e });
  }

  if (!data || typeof data !== "object" || !data.tables) {
    throw new Error("Ungültiges Backup-Schema: 'tables' Eigenschaft fehlt.");
  }

  await runInTransaction(async (db) => {
    // defer_foreign_keys verschiebt alle Fremdschlüsselprüfungen ans Transaktionsende: ohne das
    // müsste BACKUP_TABLES exakt in Fremdschlüssel-Reihenfolge vorliegen (inkl. Sonderfällen wie
    // rules -> contracts -> merchants -> rules-artige Querverweise und transactions.transfer_pair_id,
    // das auf eine andere, ggf. noch nicht eingefügte Zeile derselben Tabelle zeigt) – das ist bei
    // dieser Tabellenzahl von Hand nicht zuverlässig zu pflegen. Gilt nur für die aktuelle Transaktion,
    // SQLite schaltet es beim Commit automatisch wieder ab.
    await db.execute("PRAGMA defer_foreign_keys = ON;");

    // Clear existing tables (Reihenfolge egal dank defer_foreign_keys)
    for (const table of [...BACKUP_TABLES].reverse()) {
      try {
        await db.execute(`delete from ${table}`);
      } catch {
        /* table might not exist (altes Backup-Format / neuere App-Version) */
      }
    }

    // Insert backup rows
    for (const table of BACKUP_TABLES) {
      const rows = data.tables[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      for (const row of rows) {
        const keys = Object.keys(row);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
        const columns = keys.join(", ");
        const values = keys.map((k) => row[k]);

        await db.execute(
          `insert into ${table} (${columns}) values (${placeholders})`,
          values,
        );
      }
    }

    // Explizite Prüfung statt auf den (später schwer zu diagnostizierenden) Commit-Fehler zu warten:
    // bei einem unvollständigen/fremden Backup (z. B. eine Tabelle wurde nicht mitgeliefert) bricht
    // der Restore hier kontrolliert mit einer verständlichen Fehlermeldung ab, statt eine Datenbank
    // mit hängenden Fremdschlüsseln zu hinterlassen.
    const violations = await db.select<{ table: string; rowid: number }[]>("PRAGMA foreign_key_check;");
    if (violations.length > 0) {
      throw new Error(
        `Backup unvollständig oder inkonsistent: ${violations.length} Fremdschlüssel-Verletzung(en) ` +
          `(u. a. Tabelle "${violations[0].table}"). Restore wurde abgebrochen, keine Daten wurden übernommen.`,
      );
    }
  });

  await seedTemplateCategories();
}

export async function deleteAllData(): Promise<void> {
  await runInTransaction(async (db) => {
    await db.execute("PRAGMA defer_foreign_keys = ON;");
    for (const table of [...BACKUP_TABLES].reverse()) {
      try {
        await db.execute(`delete from ${table}`);
      } catch {
        /* ignore */
      }
    }
    // Set onboarding_done to false in settings
    await db.execute("insert or replace into settings (key, value) values ('onboarding_done', '0')");
  });

  await seedTemplateCategories();
}
