import { describe, it, expect } from "vitest";
import { conditionMatches, findMatchingRule } from "@/lib/pipeline/suggest-category";
import type { RuleWithConditions } from "@/db/repositories/rules";

function tx(overrides: Partial<{ asset_id: number; counterparty: string; purpose: string | null; amount_cents: number }> = {}) {
  return { asset_id: 1, counterparty: "REWE Markt Berlin", purpose: "Einkauf", amount_cents: -2599, ...overrides };
}

describe("conditionMatches", () => {
  it("counterparty 'contains' ist case-insensitiv", () => {
    expect(conditionMatches("counterparty", "contains", "rewe", tx())).toBe(true);
    expect(conditionMatches("counterparty", "contains", "ALDI", tx())).toBe(false);
  });

  it("counterparty 'equals' verlangt exakte Übereinstimmung (normalisiert)", () => {
    expect(conditionMatches("counterparty", "equals", "rewe markt berlin", tx())).toBe(true);
    expect(conditionMatches("counterparty", "equals", "rewe", tx())).toBe(false);
  });

  it("purpose-Feld greift auf t.purpose zu, auch wenn null", () => {
    expect(conditionMatches("purpose", "contains", "einkauf", tx())).toBe(true);
    expect(conditionMatches("purpose", "contains", "einkauf", tx({ purpose: null }))).toBe(false);
  });

  it("amount 'approx' erlaubt 5% Toleranz, 'equals'-Vergleich nicht", () => {
    expect(conditionMatches("amount", "approx", "-26,00", tx({ amount_cents: -2599 }))).toBe(true);
    expect(conditionMatches("amount", "equals", "-26,00", tx({ amount_cents: -2599 }))).toBe(false);
  });

  it("asset-Feld vergleicht die Konto-ID", () => {
    expect(conditionMatches("asset", "equals", "1", tx({ asset_id: 1 }))).toBe(true);
    expect(conditionMatches("asset", "equals", "2", tx({ asset_id: 1 }))).toBe(false);
  });
});

function makeCondition(field: string, operator: string, value: string) {
  return { id: 1, group_id: 1, field, custom_field_id: null, extra_field_key: null, operator, value, value_to: null } as any;
}

function makeRule(id: number, priority: number, groups: { conditions: ReturnType<typeof makeCondition>[] }[]): RuleWithConditions {
  return {
    id,
    priority,
    category_id: 100 + id,
    tag_id: null,
    mark_as_transfer: 0,
    mark_as_saving: 0,
    sparzweck_id: null,
    created_from: "manual",
    source_contract_id: null,
    merchant_id: null,
    is_deleted: 0,
    groups: groups.map((g, i) => ({ id: i + 1, group_order: i, conditions: g.conditions })),
  } as unknown as RuleWithConditions;
}

describe("findMatchingRule (Determinismus der Priorität)", () => {
  it("wählt bei mehreren passenden Regeln zuverlässig die mit der niedrigeren priority-Zahl (zuerst in der Liste)", () => {
    const rules: RuleWithConditions[] = [
      makeRule(1, 1, [{ conditions: [makeCondition("counterparty", "contains", "rewe")] }]),
      makeRule(2, 2, [{ conditions: [makeCondition("counterparty", "contains", "markt")] }]),
    ];
    // Beide Regeln würden auf dieselbe Buchung passen ("REWE Markt Berlin") - die Reihenfolge in
    // der übergebenen Liste (bereits nach priority sortiert von listRules) muss allein entscheiden,
    // damit dieselbe Buchung bei jedem Pipeline-Lauf zuverlässig dieselbe Regel bekommt.
    const match = findMatchingRule(rules, tx());
    expect(match?.id).toBe(1);
  });

  it("ignoriert Regeln ohne Bedingungsgruppen (würden sonst alles matchen)", () => {
    const rules: RuleWithConditions[] = [makeRule(1, 1, [])];
    expect(findMatchingRule(rules, tx())).toBeNull();
  });

  it("verlangt, dass ALLE Bedingungen EINER Gruppe zutreffen (UND-Verknüpfung)", () => {
    const rules: RuleWithConditions[] = [
      makeRule(1, 1, [
        {
          conditions: [
            makeCondition("counterparty", "contains", "rewe"),
            makeCondition("amount", "equals", "-99,99"),
          ],
        },
      ]),
    ];
    expect(findMatchingRule(rules, tx())).toBeNull();
  });

  it("liefert null, wenn keine Regel passt", () => {
    const rules: RuleWithConditions[] = [
      makeRule(1, 1, [{ conditions: [makeCondition("counterparty", "contains", "aldi")] }]),
    ];
    expect(findMatchingRule(rules, tx())).toBeNull();
  });

  it("zweite Gruppe (ODER) reicht, wenn die erste nicht passt", () => {
    const rules: RuleWithConditions[] = [
      makeRule(1, 1, [
        { conditions: [makeCondition("counterparty", "contains", "aldi")] },
        { conditions: [makeCondition("purpose", "contains", "einkauf")] },
      ]),
    ];
    expect(findMatchingRule(rules, tx())?.id).toBe(1);
  });
});
