import { getDb, runInTransaction } from "@/db/client";
import type { Rule, RuleCondition, RuleField, RuleOperator } from "@/db/types";
import { logOperation } from "./operations";

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

/** Entfernt leere Bedingungen/Gruppen (z. B. angefangene, nie ausgefüllte Zeilen im Regel-Builder). */
function cleanGroups(groups: RuleConditionGroupInput[]): RuleConditionGroupInput[] {
  return groups
    .map((g) => ({ conditions: g.conditions.filter((c) => c.value.trim()) }))
    .filter((g) => g.conditions.length > 0);
}

/**
 * Für normale Benutzerregeln: mindestens eine Bedingung ist Pflicht (sonst ist die Regel bedeutungslos
 * und riskiert dieselbe "Regel ohne Bedingung"-Datenqualitätslücke, die Migration
 * 028_cleanup_empty_rules.sql nachträglich bereinigen musste).
 */
function validateNonEmptyGroups(groups: RuleConditionGroupInput[]): RuleConditionGroupInput[] {
  const cleaned = cleanGroups(groups);
  if (cleaned.length === 0) {
    throw new Error("Eine Regel braucht mindestens eine Bedingung.");
  }
  return cleaned;
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
  const id = result.lastInsertId as number;
  await logOperation(db, "insert", "rules", id, { 
    priority, category_id: actions.category_id, tag_id: actions.tag_id, 
    mark_as_transfer: actions.mark_as_transfer ? 1 : 0, 
    mark_as_saving: actions.mark_as_saving ? 1 : 0, 
    sparzweck_id: actions.sparzweck_id, created_from: createdFrom, 
    source_contract_id: sourceContractId, merchant_id: merchantId 
  }, null);
  return id;
}

/**
 * writeGroups() löscht erst alle bisherigen Gruppen/Bedingungen einer Regel und fügt sie danach neu
 * ein (kein partielles Update, da UND/ODER-Struktur beliebig umgebaut werden kann). Beide Schritte
 * müssen atomar sein: ohne Transaktion hinterließ ein Abbruch dazwischen (Fehler, Crash, ungültige
 * Bedingung) eine Regel ganz ohne Gruppen – vermutlich die Ursache der in Migration
 * 028_cleanup_empty_rules.sql nachträglich bereinigten verwaisten Regeln.
 */
export async function createRuleWithGroups(
  groups: RuleConditionGroupInput[],
  actions: RuleActionsInput,
  createdFrom: "manual" | "aufraeumen" | "vertrag" = "manual",
  sourceContractId: number | null = null,
): Promise<number> {
  const cleanedGroups = validateNonEmptyGroups(groups);
  return runInTransaction(async (db) => {
    const ruleId = await insertRuleRow(db, actions, createdFrom, sourceContractId, null);
    await writeGroups(db, ruleId, cleanedGroups);
    return ruleId;
  });
}

export async function updateRuleWithGroups(id: number, groups: RuleConditionGroupInput[], actions: RuleActionsInput): Promise<void> {
  const cleanedGroups = validateNonEmptyGroups(groups);
  await runInTransaction(async (db) => {
    const oldRows = await db.select<Rule[]>("select * from rules where id = $1", [id]);
    if (!oldRows[0]) return;
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
    await writeGroups(db, id, cleanedGroups);
    await logOperation(db, "update", "rules", id, { ...actions }, oldRows[0]);
  });
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
  conditions?: RuleConditionInput[];
  groups?: RuleConditionGroupInput[];
  category_id: number | null;
}

/**
 * Legt eine zusätzliche Regel für einen Händler an (z. B. "Verwendungszweck enthält 'Prime' -> Streaming").
 * Anders als bei normalen Benutzerregeln ist hier eine Regel ganz ohne Bedingungen gültig: sie gilt als
 * Default-Treffer für den Händler (siehe resolveMerchantCategory()/evaluateConditionGroups() in
 * pipeline.ts bzw. suggest-category.ts) – deshalb cleanGroups() statt validateNonEmptyGroups() (kein Wurf
 * bei leerem Ergebnis). Der aktuelle Regel-Builder (MerchantEditorModal.tsx) legt eine solche Regel selbst
 * nicht mehr an (er überspringt leere Zeilen clientseitig), das Repository unterstützt es aber weiterhin,
 * da die Pipeline-Logik explizit darauf aufbaut.
 */
export async function createMerchantRule(merchantId: number, input: MerchantRuleInput): Promise<number> {
  const groups = cleanGroups(input.groups ?? wrapFlatConditions(input.conditions ?? []));
  return runInTransaction(async (db) => {
    const ruleId = await insertRuleRow(db, { category_id: input.category_id, tag_id: null, mark_as_transfer: false, mark_as_saving: false, sparzweck_id: null }, "manual", null, merchantId);
    await writeGroups(db, ruleId, groups);
    return ruleId;
  });
}

export async function updateMerchantRule(ruleId: number, input: MerchantRuleInput): Promise<void> {
  const groups = cleanGroups(input.groups ?? wrapFlatConditions(input.conditions ?? []));
  await runInTransaction(async (db) => {
    const oldRows = await db.select<Rule[]>("select * from rules where id = $1", [ruleId]);
    if (!oldRows[0]) return;
    await db.execute("update rules set category_id = $1 where id = $2", [input.category_id, ruleId]);
    await writeGroups(db, ruleId, groups);
    await logOperation(db, "update", "rules", ruleId, { category_id: input.category_id }, oldRows[0]);
  });
}

export async function deleteMerchantRule(ruleId: number): Promise<void> {
  const db = await getDb();
  const oldRows = await db.select<Rule[]>("select * from rules where id = $1", [ruleId]);
  if (!oldRows[0]) return;
  await db.execute("update rules set is_deleted = 1 where id = $1", [ruleId]);
  await logOperation(db, "delete", "rules", ruleId, {}, oldRows[0]);
}

export async function deleteRule(id: number): Promise<void> {
  const db = await getDb();
  const oldRows = await db.select<Rule[]>("select * from rules where id = $1", [id]);
  if (!oldRows[0]) return;
  await db.execute("update rules set is_deleted = 1 where id = $1", [id]);
  await logOperation(db, "delete", "rules", id, {}, oldRows[0]);
}

/** Garantiert kollisionsfreier Platzhalter für den partiellen Unique-Index auf rules.priority
 *  (Migration 029): der Index wird pro Statement sofort geprüft, ein direktes Vertauschen/Neusortieren
 *  würde also kurzzeitig zwei aktive Regeln mit derselben Priorität erzeugen und fehlschlagen. */
function priorityPlaceholder(ruleId: number): number {
  return -(1_000_000 + ruleId);
}

/** Vertauscht die Priorität zweier benachbarter Regeln (Pfeil-Buttons/Drag&Drop). */
export async function swapRulePriority(ruleIdA: number, ruleIdB: number): Promise<void> {
  await runInTransaction(async (db) => {
    const rows = await db.select<{ id: number; priority: number }[]>(
      "select id, priority from rules where id in ($1, $2)",
      [ruleIdA, ruleIdB],
    );
    const a = rows.find((r) => r.id === ruleIdA);
    const b = rows.find((r) => r.id === ruleIdB);
    if (!a || !b) return;
    await db.execute("update rules set priority = $1 where id = $2", [priorityPlaceholder(a.id), a.id]);
    await db.execute("update rules set priority = $1 where id = $2", [priorityPlaceholder(b.id), b.id]);
    await db.execute("update rules set priority = $1 where id = $2", [b.priority, a.id]);
    await db.execute("update rules set priority = $1 where id = $2", [a.priority, b.id]);
    await logOperation(db, "update", "rules", a.id, { priority: b.priority }, a);
    await logOperation(db, "update", "rules", b.id, { priority: a.priority }, b);
  });
}

/**
 * Setzt die Priorität aller Regeln gemäß der übergebenen Reihenfolge (Drag&Drop-Reorder).
 * Erwartet, dass `orderedIds` ALLE aktiven Regel-ids enthält (so wie es der einzige Aufrufer,
 * `useRules()`/`listRules()`, liefert) – Phase 2 vergibt dichte Prioritäten 1..N und würde bei einer
 * echten Teilmenge mit der Priorität einer nicht mitgelieferten, unveränderten Regel kollidieren.
 */
export async function reorderRules(orderedIds: number[]): Promise<void> {
  if (orderedIds.length === 0) return;
  await runInTransaction(async (db) => {
    const placeholdersQuery = orderedIds.map((_, i) => `$${i + 1}`).join(", ");
    const oldRows = await db.select<Rule[]>(`select * from rules where id in (${placeholdersQuery})`, orderedIds);

    // Phase 1: alle betroffenen Regeln auf kollisionsfreie Platzhalter setzen (siehe priorityPlaceholder),
    // bevor Phase 2 die finalen, dichten Prioritäten (1..N) vergibt – sonst kann die Zielpriorität einer
    // Regel mit der noch nicht aktualisierten Priorität einer anderen Regel in derselben Liste kollidieren.
    for (const id of orderedIds) {
      await db.execute("update rules set priority = $1 where id = $2", [priorityPlaceholder(id), id]);
    }
    for (let i = 0; i < orderedIds.length; i += 1) {
      await db.execute("update rules set priority = $1 where id = $2", [i + 1, orderedIds[i]]);
      const row = oldRows.find(r => r.id === orderedIds[i]);
      if (row) await logOperation(db, "update", "rules", orderedIds[i], { priority: i + 1 }, row);
    }
  });
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

import { z } from "zod";

const ExtraFieldsSchema = z.record(z.string(), z.string());

/** Über die zuletzt importierten Buchungen hinweg tatsächlich vorkommende extra_fields_json-Schlüssel. */
export async function listExtraFieldKeys(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ extra_fields_json: string }[]>(
    "select extra_fields_json from transactions where is_deleted = 0 and extra_fields_json is not null order by id desc limit 500",
  );
  const keys = new Set<string>();
  for (const r of rows) {
    try {
      const obj = ExtraFieldsSchema.parse(JSON.parse(r.extra_fields_json));
      for (const k of Object.keys(obj)) keys.add(k);
    } catch {
      // ignorieren
    }
  }
  return [...keys].sort();
}
