import { getDb } from "@/db/client";
import { getSetting, setSetting } from "@/db/repositories/settings";

/**
 * Einmalige Datenmigration (Bugfix-Runde 3, "Händler & Regel-Vorlagen zusammenführen"): jede
 * bestehende Regel-Vorlage wird zu einem Händler (bzw. zu einer zusätzlichen Regel eines bereits
 * existierenden Händlers, falls Alias/Name schon vorhanden – verhindert Duplikate mit den seit
 * Migration 011 mitgelieferten Händlern wie Rewe/Amazon/Netflix) mit einer verknüpften `rules`-Zeile.
 * Läuft genau einmal (Guard über `settings`, nicht über die _migrations-Versionstabelle, da es sich
 * um eine Datenmigration mit TS-Logik handelt, nicht um reines DDL). Keine Datenverluste: die
 * `rule_templates`-Tabelle bleibt unangetastet erhalten, nur die separate Pipeline-Stufe entfällt.
 */
export async function migrateRuleTemplatesToMerchants(): Promise<void> {
  const done = await getSetting("rule_templates_migrated_to_merchants");
  if (done === "1") return;

  const db = await getDb();
  const templates = await db.select<
    { id: number; label: string; category_template_key: string; field: string; value: string }[]
  >("select id, label, category_template_key, field, value from rule_templates where is_deleted = 0");

  for (const t of templates) {
    const normalizedValue = t.value.trim().toLowerCase();

    const categoryRows = await db.select<{ id: number }[]>(
      "select id from categories where template_key = $1",
      [t.category_template_key],
    );
    const categoryId = categoryRows[0]?.id ?? null;
    if (categoryId === null) continue;

    let merchantId: number | null = null;
    const aliasMatch = await db.select<{ merchant_id: number }[]>(
      "select merchant_id from merchant_aliases where match_value = $1 limit 1",
      [normalizedValue],
    );
    if (aliasMatch.length > 0) {
      merchantId = aliasMatch[0].merchant_id;
    } else {
      const merchantMatch = await db.select<{ id: number }[]>(
        "select id from merchants where canonical_name = $1",
        [normalizedValue],
      );
      if (merchantMatch.length > 0) {
        merchantId = merchantMatch[0].id;
      } else {
        const res = await db.execute(
          `insert into merchants (canonical_name, display_name, default_category_id, source_version, is_builtin, is_active)
           values ($1, $2, $3, 'migrated-rule-template', 1, 1)`,
          [normalizedValue, t.label, categoryId],
        );
        merchantId = res.lastInsertId as number;
        await db.execute(
          "insert into merchant_aliases (merchant_id, match_type, match_value, priority) values ($1, 'name_fuzzy', $2, 50)",
          [merchantId, normalizedValue],
        );
      }
    }

    const existingRule = await db.select<{ id: number }[]>(
      "select id from rules where merchant_id = $1 and category_id = $2 and is_deleted = 0",
      [merchantId, categoryId],
    );
    if (existingRule.length > 0) continue;

    const maxPriority = await db.select<{ max: number | null }[]>(
      "select max(priority) as max from rules where is_deleted = 0",
    );
    const priority = (maxPriority[0]?.max ?? 0) + 1;
    await db.execute(
      `insert into rules (priority, category_id, merchant_id, created_from) values ($1, $2, $3, 'manual')`,
      [priority, categoryId, merchantId],
    );
  }

  await setSetting("rule_templates_migrated_to_merchants", "1");
}
