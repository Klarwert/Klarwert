/**
 * T15.2 – Regel-Builder Komponententest
 *
 * Testet die RuleConditionGroupsEditor-Kernlogik (newRuleCondition, ruleGroupsToDraft,
 * cleanRuleGroups) und die wichtigsten Zustandsübergänge des Editors isoliert.
 * DB-Zugriffe sind gemockt.
 */
import { describe, it, expect, vi } from "vitest";
import {
  newRuleCondition,
  ruleGroupsToDraft,
  cleanRuleGroups,
} from "@/features/kategorien/components/RuleConditionGroupsEditor";
import type { RuleWithConditions } from "@/db/repositories/rules";

describe("newRuleCondition", () => {
  it("gibt eine neue Bedingung mit Standard-Feld und leerem Wert zurück", () => {
    const cond = newRuleCondition();
    expect(cond.field).toBe("counterparty");
    expect(cond.operator).toBe("contains");
    expect(cond.value).toBe("");
  });
});

describe("ruleGroupsToDraft", () => {
  it("bildet eine Regel mit Gruppen auf den Draft-State ab", () => {
    const rule: RuleWithConditions = {
      id: 1,
      name: "Test",
      enabled: 1,
      is_deleted: 0,
      category_id: null,
      tag_id: null,
      mark_as_transfer: 0,
      mark_as_saving: 0,
      sparzweck_id: null,
      merchant_id: null,
      priority: 1,
      created_at: "",
      groups: [
        {
          id: 1,
          rule_id: 1,
          group_index: 0,
          conditions: [
            { id: 1, group_id: 1, field: "counterparty", operator: "contains", value: "REWE", value_to: null, extra_field_key: null },
          ],
        },
      ],
    };

    const draft = ruleGroupsToDraft(rule);
    expect(draft).toHaveLength(1);
    expect(draft[0]).toHaveLength(1);
    expect(draft[0][0].field).toBe("counterparty");
    expect(draft[0][0].value).toBe("REWE");
  });

  it("gibt eine leere Gruppe zurück wenn die Regel keine Gruppen hat", () => {
    const rule: RuleWithConditions = {
      id: 2,
      name: "Leer",
      enabled: 1,
      is_deleted: 0,
      category_id: null,
      tag_id: null,
      mark_as_transfer: 0,
      mark_as_saving: 0,
      sparzweck_id: null,
      merchant_id: null,
      priority: 1,
      created_at: "",
      groups: [],
    };
    const draft = ruleGroupsToDraft(rule);
    expect(draft).toHaveLength(1);
    expect(draft[0][0]).toEqual(newRuleCondition());
  });
});

describe("cleanRuleGroups", () => {
  it("filtert leere Bedingungen und leere Gruppen heraus", () => {
    const groups = [
      [
        { field: "counterparty" as const, operator: "contains" as const, value: "REWE" },
        { field: "counterparty" as const, operator: "contains" as const, value: "" }, // leer
      ],
      [
        { field: "counterparty" as const, operator: "contains" as const, value: "" }, // nur leer → Gruppe wird gefiltert
      ],
    ];

    const cleaned = cleanRuleGroups(groups);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].conditions).toHaveLength(1);
    expect(cleaned[0].conditions[0].value).toBe("REWE");
  });

  it("gibt leeres Array zurück wenn alle Bedingungen leer sind", () => {
    const groups = [
      [{ field: "counterparty" as const, operator: "contains" as const, value: "" }],
    ];
    expect(cleanRuleGroups(groups)).toHaveLength(0);
  });
});
