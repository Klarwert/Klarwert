import { getDb } from "@/db/client";
import { listRules, type RuleWithConditions } from "@/db/repositories/rules";
import type Database from "@tauri-apps/plugin-sql";
import type { RuleCondition, RuleField, RuleOperator } from "@/db/types";

export interface SuggestTx {
  asset_id: number;
  counterparty: string;
  purpose: string | null;
  amount_cents: number;
  /** Geparste transactions.extra_fields_json – für Bedingungen auf Import-Custom-Spalten (field='extra_field'). */
  extraFields?: Record<string, string>;
}

export function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/** Zusatzangaben, die nur bei bestimmten Feldern/Operatoren gebraucht werden (siehe RuleCondition). */
export interface ConditionExtras {
  valueTo?: string | null;
  extraFieldKey?: string | null;
}

export function conditionMatches(
  field: RuleField,
  operator: RuleOperator,
  value: string,
  tx: SuggestTx,
  extras?: ConditionExtras,
): boolean {
  if (field === "extra_field") {
    const key = extras?.extraFieldKey;
    if (!key) return false;
    const raw = tx.extraFields?.[key] ?? "";
    if (operator === "equals") return normalize(raw) === normalize(value);
    if (operator === "between") {
      const n = Number.parseFloat(raw.replace(",", "."));
      const lo = Number.parseFloat(value.replace(",", "."));
      const hi = Number.parseFloat((extras?.valueTo ?? "").replace(",", "."));
      if (Number.isNaN(n) || Number.isNaN(lo) || Number.isNaN(hi)) return false;
      return n >= Math.min(lo, hi) && n <= Math.max(lo, hi);
    }
    return normalize(raw).includes(normalize(value));
  }
  if (field === "amount") {
    const target = Math.round(Number.parseFloat(value.replace(",", ".")) * 100);
    if (operator === "between") {
      const targetTo = Math.round(Number.parseFloat((extras?.valueTo ?? "").replace(",", ".")) * 100);
      if (Number.isNaN(target) || Number.isNaN(targetTo)) return false;
      return tx.amount_cents >= Math.min(target, targetTo) && tx.amount_cents <= Math.max(target, targetTo);
    }
    if (Number.isNaN(target)) return false;
    if (operator === "approx") return Math.abs(tx.amount_cents - target) <= Math.abs(target) * 0.05;
    if (operator === "greater_than") return tx.amount_cents > target;
    if (operator === "less_than") return tx.amount_cents < target;
    return tx.amount_cents === target;
  }
  if (field === "asset") {
    return tx.asset_id === Number(value);
  }
  const column = field === "purpose" ? tx.purpose ?? "" : tx.counterparty;
  if (operator === "equals") return normalize(column) === normalize(value);
  return normalize(column).includes(normalize(value));
}

function conditionExtras(c: RuleCondition): ConditionExtras {
  return { valueTo: c.value_to, extraFieldKey: c.extra_field_key };
}

/**
 * Bedingungsgruppen sind ODER-verknüpft, Bedingungen INNERHALB einer Gruppe UND-verknüpft (siehe
 * klarwert-regelbuilder-erweiterung, zweistufig, bewusst nicht beliebig verschachtelt). Keine
 * Gruppen ("leer") gilt als unconditional Treffer – das nutzen Händler-Regeln ohne eigene
 * Bedingung als Default-Fallback (siehe pipeline.ts#resolveMerchantCategory).
 */
export function evaluateConditionGroups(
  groups: { conditions: RuleCondition[] }[],
  tx: SuggestTx,
): boolean {
  if (groups.length === 0) return true;
  return groups.some(
    (g) => g.conditions.length > 0 && g.conditions.every((c) => conditionMatches(c.field, c.operator, c.value, tx, conditionExtras(c))),
  );
}

/**
 * Benutzerregeln (Pipeline-Stufe 4): eine Regel ganz ohne Bedingungsgruppen wird bewusst
 * übersprungen (nie als Wildcard behandelt) – anders als bei Händler-Regeln, wo das der
 * gewollte Default-Fallback ist.
 */
export function findMatchingRule(rules: RuleWithConditions[], tx: SuggestTx): RuleWithConditions | null {
  for (const rule of rules) {
    if (rule.groups.length === 0) continue;
    if (evaluateConditionGroups(rule.groups, tx)) return rule;
  }
  return null;
}

/**
 * Vorschlagslogik (Product Spec 4.3b):
 * 1. Regel-Match (liefert category_id)
 * 2. Letzte manuelle Kategorisierung desselben normalisierten Empfängers
 * 3. Alias-Match (Kategorie-Namen oder in der DB definierte Aliase)
 */
export async function suggestCategory(
  tx: SuggestTx,
  dbOrNull?: Database
): Promise<number | null> {
  const db = dbOrNull ?? (await getDb());

  // 1. Regel-Match
  const rules = await listRules();
  const ruleMatch = findMatchingRule(rules, tx);
  if (ruleMatch && ruleMatch.category_id !== null) {
    return ruleMatch.category_id;
  }

  const cpNorm = normalize(tx.counterparty);
  if (!cpNorm) return null;

  // 2. Letzte manuelle Kategorisierung
  const manualMatches = await db.select<{ category_id: number }[]>(
    `select category_id from transactions
     where is_deleted = 0
       and categorization_source = 'manual'
       and lower(trim(counterparty)) = $1
       and category_id is not null
     order by booking_date desc, id desc limit 1`,
    [cpNorm]
  );
  if (manualMatches.length > 0) {
    return manualMatches[0].category_id;
  }

  // 3. Alias-Match (Kategorie-Namen oder in categories_aliases definiert)
  const categories = await db.select<{ id: number; name: string }[]>(
    "select id, name from categories where is_deleted = 0"
  );

  // Exakter Match mit Kategorienamen
  const nameMatch = categories.find(c => normalize(c.name) === cpNorm);
  if (nameMatch) return nameMatch.id;

  // Teilwort-Match mit Aliases
  // Alias-Table check
  let aliases: { category_id: number; alias: string }[] = [];
  try {
    aliases = await db.select<{ category_id: number; alias: string }[]>(
      "select category_id, alias from category_aliases"
    );
  } catch (e) {
    // category_aliases might not exist in old schemas, ignore
  }

  for (const alias of aliases) {
    if (cpNorm.includes(normalize(alias.alias))) {
      return alias.category_id;
    }
  }

  return null;
}
