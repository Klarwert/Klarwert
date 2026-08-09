import { getDb } from "@/db/client";
import type { Rule, RuleCondition, RuleField, RuleOperator } from "@/db/types";

export interface RuleGroupWithConditions {
  id: number;
  group_order: number;
  conditions: RuleCondition[];
}

export interface RuleWithConditions extends Rule {
  groups: RuleGroupWithConditions[];
}

export interface RuleConditionInput {
  field: RuleField;
  operator: RuleOperator;
  value: string;
  value_to?: string | null;
  extra_field_key?: string | null;
  custom_field_id?: number | null;
}

/** Eine Bedingungsgruppe: Bedingungen darin sind UND-verknüpft, Gruppen selbst ODER-verknüpft. */
export interface RuleConditionGroupInput {
  conditions: RuleConditionInput[];
}

export interface RuleActionsInput {
  category_id: number | null;
  tag_id: number | null;
  mark_as_transfer: boolean;
  mark_as_saving: boolean;
  sparzweck_id: number | null;
}

/** Ein flaches Bedingungs-Array (Alt-API, weiterhin UND-verknüpft) als genau eine Gruppe. */
function wrapFlatConditions(conditions: RuleConditionInput[]): RuleConditionGroupInput[] {
  return conditions.length > 0 ? [{ conditions }] : [];
}

async function writeGroups(db: Awaited<ReturnType<typeof getDb>>, ruleId: number, groups: RuleConditionGroupInput[]): Promise<void> {
  // rule_condition_groups.rule_id -> rules(id) on delete cascade räumt beim Rebuild einer Regel
  // (Löschen aller Gruppen) auch die zugehörigen rule_conditions mit auf (deren eigener FK
  // group_id -> rule_condition_groups(id) hat ebenfalls on delete cascade).
  await db.execute("delete from rule_condition_groups where rule_id = $1", [ruleId]);
  for (const [groupOrder, group] of groups.entries()) {
    const groupResult = await db.execute(
      "insert into rule_condition_groups (rule_id, group_order) values ($1, $2)",
      [ruleId, groupOrder],
    );
    const groupId = groupResult.lastInsertId as number;
    for (const c of group.conditions) {
      await db.execute(
        `insert into rule_conditions (group_id, field, custom_field_id, extra_field_key, operator, value, value_to)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [groupId, c.field, c.custom_field_id ?? null, c.extra_field_key ?? null, c.operator, c.value, c.value_to ?? null],
      );
    }
  }
}

/** Alle Regeln in globaler Prioritätsreihenfolge (kleinste Zahl zuerst geprüft), inkl. Bedingungsgruppen. */
export async function listRules(): Promise<RuleWithConditions[]> {
  const db = await getDb();
  const rules = await db.select<Rule[]>(
    "select * from rules where is_deleted = 0 order by priority asc",
  );
  if (rules.length === 0) return [];

  const groupRows = await db.select<{ id: number; rule_id: number; group_order: number }[]>(
    "select * from rule_condition_groups where rule_id in (select id from rules where is_deleted = 0) order by group_order asc",
  );
  const conditions = groupRows.length > 0
    ? await db.select<RuleCondition[]>(
        `select * from rule_conditions where group_id in (${groupRows.map((g) => g.id).join(",")})`,
      )
    : [];

  const conditionsByGroup = new Map<number, RuleCondition[]>();
  for (const c of conditions) {
    const list = conditionsByGroup.get(c.group_id) ?? [];
    list.push(c);
    conditionsByGroup.set(c.group_id, list);
  }
  const groupsByRule = new Map<number, RuleGroupWithConditions[]>();
  for (const g of groupRows) {
    const list = groupsByRule.get(g.rule_id) ?? [];
    list.push({ id: g.id, group_order: g.group_order, conditions: conditionsByGroup.get(g.id) ?? [] });
    groupsByRule.set(g.rule_id, list);
  }
  return rules.map((r) => ({ ...r, groups: groupsByRule.get(r.id) ?? [] }));
}

export async function countRulesForCategory(categoryId: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>(
    "select count(*) as count from rules where category_id = $1 and is_deleted = 0",
    [categoryId],
  );
  return rows[0]?.count ?? 0;
}

export async function getRulesForCategory(categoryId: number): Promise<RuleWithConditions[]> {
  const all = await listRules();
  return all.filter((r) => r.category_id === categoryId);
}

/**
 * Live-Vorschau: wie viele Transaktionen matchen die Bedingungsgruppen (Gruppen ODER-, Bedingungen
 * darin UND-verknüpft)? + Stichprobe. `extra_field`-Bedingungen lesen aus extra_fields_json per
 * json_extract (SQLite json1, in Tauri wie in node:sqlite verfügbar).
 */
export async function previewRuleMatches(groups: RuleConditionGroupInput[]): Promise<{ count: number; sample: any[] }> {
  const nonEmptyGroups = groups.filter((g) => g.conditions.some((c) => c.value.trim()));
  if (nonEmptyGroups.length === 0) return { count: 0, sample: [] };
  const db = await getDb();
  const params: unknown[] = [];
  let i = 1;

  function buildGroupClause(group: RuleConditionGroupInput): string | null {
    const clauses: string[] = [];
    for (const c of group.conditions) {
      if (!c.value.trim()) continue;
      if (c.field === "amount") {
        const cents = Math.round(Number.parseFloat(c.value.replace(",", ".")) * 100);
        if (Number.isNaN(cents)) continue;
        if (c.operator === "approx") {
          const tolerance = Math.abs(cents) * 0.05;
          clauses.push(`amount_cents between $${i} and $${i + 1}`);
          params.push(cents - tolerance, cents + tolerance);
          i += 2;
        } else if (c.operator === "between") {
          const centsTo = Math.round(Number.parseFloat((c.value_to ?? "").replace(",", ".")) * 100);
          if (Number.isNaN(centsTo)) continue;
          clauses.push(`amount_cents between $${i} and $${i + 1}`);
          params.push(Math.min(cents, centsTo), Math.max(cents, centsTo));
          i += 2;
        } else if (c.operator === "greater_than") {
          clauses.push(`amount_cents > $${i}`);
          params.push(cents);
          i += 1;
        } else if (c.operator === "less_than") {
          clauses.push(`amount_cents < $${i}`);
          params.push(cents);
          i += 1;
        } else {
          clauses.push(`amount_cents = $${i}`);
          params.push(cents);
          i += 1;
        }
      } else if (c.field === "asset") {
        clauses.push(`asset_id = $${i}`);
        params.push(Number(c.value));
        i += 1;
      } else if (c.field === "extra_field") {
        if (!c.extra_field_key) continue;
        const expr = `json_extract(extra_fields_json, '$.' || $${i})`;
        params.push(c.extra_field_key);
        i += 1;
        if (c.operator === "equals") {
          clauses.push(`lower(${expr}) = lower($${i})`);
        } else {
          clauses.push(`lower(${expr}) like lower($${i})`);
          params.push(`%${c.value}%`);
          i += 1;
          continue;
        }
        params.push(c.value);
        i += 1;
      } else {
        const column = c.field === "purpose" ? "purpose" : "counterparty";
        if (c.operator === "equals") {
          clauses.push(`lower(${column}) = lower($${i})`);
        } else {
          clauses.push(`lower(${column}) like lower($${i})`);
          params.push(`%${c.value}%`);
          i += 1;
          continue;
        }
        params.push(c.value);
        i += 1;
      }
    }
    return clauses.length > 0 ? `(${clauses.join(" and ")})` : null;
  }

  const groupClauses = nonEmptyGroups.map(buildGroupClause).filter((c): c is string => c !== null);
  if (groupClauses.length === 0) return { count: 0, sample: [] };
  const whereClause = `is_deleted = 0 and (${groupClauses.join(" or ")})`;

  const countRows = await db.select<{ count: number }[]>(
    `select count(*) as count from transactions where ${whereClause}`,
    params,
  );
  const sampleRows = await db.select<{ booking_date: string; counterparty: string; purpose: string | null; amount_cents: number }[]>(
    `select booking_date, counterparty, purpose, amount_cents from transactions where ${whereClause} order by booking_date desc limit 50`,
    params,
  );
  return {
    count: countRows[0]?.count ?? 0,
    sample: sampleRows,
  };
}

async function insertRuleRow(
  db: Awaited<ReturnType<typeof getDb>>,
  actions: RuleActionsInput,
  createdFrom: "manual" | "aufraeumen" | "vertrag",
  sourceContractId: number | null,
  merchantId: number | null,
): Promise<number> {
  const maxPriority = await db.select<{ max: number | null }[]>(
    "select max(priority) as max from rules where is_deleted = 0",
  );
  const priority = (maxPriority[0]?.max ?? 0) + 1;
  const result = await db.execute(
    `insert into rules (priority, category_id, tag_id, mark_as_transfer, mark_as_saving, sparzweck_id, created_from, source_contract_id, merchant_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      priority,
      actions.category_id,
      actions.tag_id,
      actions.mark_as_transfer ? 1 : 0,
      actions.mark_as_saving ? 1 : 0,
      actions.sparzweck_id,
      createdFrom,
      sourceContractId,
      merchantId,
    ],
  );
  return result.lastInsertId as number;
}

export async function createRuleWithGroups(
  groups: RuleConditionGroupInput[],
  actions: RuleActionsInput,
  createdFrom: "manual" | "aufraeumen" | "vertrag" = "manual",
  sourceContractId: number | null = null,
): Promise<number> {
  const db = await getDb();
  const ruleId = await insertRuleRow(db, actions, createdFrom, sourceContractId, null);
  await writeGroups(db, ruleId, groups);
  return ruleId;
}

export async function updateRuleWithGroups(id: number, groups: RuleConditionGroupInput[], actions: RuleActionsInput): Promise<void> {
  const db = await getDb();
  await db.execute(
    `update rules set category_id = $1, tag_id = $2, mark_as_transfer = $3, mark_as_saving = $4, sparzweck_id = $5
     where id = $6`,
    [
      actions.category_id,
      actions.tag_id,
      actions.mark_as_transfer ? 1 : 0,
      actions.mark_as_saving ? 1 : 0,
      actions.sparzweck_id,
      id,
    ],
  );
  await writeGroups(db, id, groups);
}

/** Alt-API (weiterhin genutzt von AufraeumModus/Verträgen): flache, UND-verknüpfte Bedingungsliste. */
export async function createRule(
  conditions: RuleConditionInput[],
  actions: RuleActionsInput,
  createdFrom: "manual" | "aufraeumen" | "vertrag" = "manual",
  sourceContractId: number | null = null,
): Promise<number> {
  return createRuleWithGroups(wrapFlatConditions(conditions), actions, createdFrom, sourceContractId);
}

export async function updateRule(
  id: number,
  conditions: RuleConditionInput[],
  actions: RuleActionsInput,
): Promise<void> {
  return updateRuleWithGroups(id, wrapFlatConditions(conditions), actions);
}

/** Regeln eines Händlers in Prioritätsreihenfolge (siehe klarwert-haendler-regel-konzept-v2.md). */
export async function listRulesForMerchant(merchantId: number): Promise<RuleWithConditions[]> {
  const all = await listRules();
  return all.filter((r) => r.merchant_id === merchantId);
}

export interface MerchantRuleInput {
  conditions: RuleConditionInput[];
  category_id: number | null;
}

/** Legt eine zusätzliche Regel für einen Händler an (z. B. "Verwendungszweck enthält 'Prime' -> Streaming"). */
export async function createMerchantRule(merchantId: number, input: MerchantRuleInput): Promise<number> {
  const db = await getDb();
  const ruleId = await insertRuleRow(db, { category_id: input.category_id, tag_id: null, mark_as_transfer: false, mark_as_saving: false, sparzweck_id: null }, "manual", null, merchantId);
  await writeGroups(db, ruleId, wrapFlatConditions(input.conditions));
  return ruleId;
}

export async function updateMerchantRule(ruleId: number, input: MerchantRuleInput): Promise<void> {
  const db = await getDb();
  await db.execute("update rules set category_id = $1 where id = $2", [input.category_id, ruleId]);
  await writeGroups(db, ruleId, wrapFlatConditions(input.conditions));
}

export async function deleteMerchantRule(ruleId: number): Promise<void> {
  const db = await getDb();
  await db.execute("update rules set is_deleted = 1 where id = $1", [ruleId]);
}

export async function deleteRule(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("update rules set is_deleted = 1 where id = $1", [id]);
}

/** Vertauscht die Priorität zweier benachbarter Regeln (Pfeil-Buttons/Drag&Drop). */
export async function swapRulePriority(ruleIdA: number, ruleIdB: number): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ id: number; priority: number }[]>(
    "select id, priority from rules where id in ($1, $2)",
    [ruleIdA, ruleIdB],
  );
  const a = rows.find((r) => r.id === ruleIdA);
  const b = rows.find((r) => r.id === ruleIdB);
  if (!a || !b) return;
  await db.execute("update rules set priority = $1 where id = $2", [b.priority, a.id]);
  await db.execute("update rules set priority = $1 where id = $2", [a.priority, b.id]);
}

/** Setzt die Priorität aller Regeln gemäß der übergebenen Reihenfolge (Drag&Drop-Reorder). */
export async function reorderRules(orderedIds: number[]): Promise<void> {
  const db = await getDb();
  for (let i = 0; i < orderedIds.length; i += 1) {
    await db.execute("update rules set priority = $1 where id = $2", [i + 1, orderedIds[i]]);
  }
}

/** Durchsuchbarer Werte-Picker: häufigste tatsächlich vorkommende Werte eines Feldes (Bugfix-Runde 3, Regelbuilder 4). */
export async function listDistinctValuesForField(field: "counterparty" | "purpose", search: string, limit = 50): Promise<string[]> {
  const db = await getDb();
  const column = field === "purpose" ? "purpose" : "counterparty";
  const rows = await db.select<{ value: string; cnt: number }[]>(
    `select ${column} as value, count(*) as cnt from transactions
     where is_deleted = 0 and ${column} is not null and ${column} != ''
       and lower(${column}) like lower($1)
     group by ${column} order by cnt desc limit $2`,
    [`%${search.trim()}%`, limit],
  );
  return rows.map((r) => r.value);
}

/** Über die zuletzt importierten Buchungen hinweg tatsächlich vorkommende extra_fields_json-Schlüssel. */
export async function listExtraFieldKeys(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ extra_fields_json: string }[]>(
    "select extra_fields_json from transactions where is_deleted = 0 and extra_fields_json is not null order by id desc limit 500",
  );
  const keys = new Set<string>();
  for (const r of rows) {
    try {
      const obj = JSON.parse(r.extra_fields_json);
      for (const k of Object.keys(obj)) keys.add(k);
    } catch {
      // ignorieren
    }
  }
  return [...keys].sort();
}
