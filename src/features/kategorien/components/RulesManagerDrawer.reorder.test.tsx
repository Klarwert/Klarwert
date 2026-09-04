import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import { RulesManagerDrawer } from "./RulesManagerDrawer";
import type { RuleWithConditions } from "@/db/repositories/rules";

/**
 * Gerenderter UI-Test für die Regel-Sortierung (C2). Die eigentliche dnd-kit-Ziehgeste (Pointer-
 * Events mit echter Kollisionserkennung über getBoundingClientRect) ist in jsdom notorisch
 * unzuverlässig zu simulieren - siehe RulesManagerDrawer.dnd.test.ts, das deshalb bewusst nur
 * arrayMove isoliert testet. Diese Datei testet stattdessen die tastaturbedienbaren "Hoch"/"Runter"-
 * Buttons (SortableRuleRow, onMoveUp/onMoveDown), die denselben Reorder-Pfad (swapRulePriority)
 * auslösen wie ein Drag - eine per Tastatur bedienbare Alternative zur Maus-Ziehgeste ist ohnehin
 * aus Barrierefreiheitsgründen vorhanden, und sie deckt den kompletten UI-Pfad ab (Klick -> Repo-
 * Aufruf -> Refetch), was ein reiner arrayMove-Logiktest nicht kann.
 */
const swapRulePriorityMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/db/repositories/rules", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    swapRulePriority: (...args: unknown[]) => swapRulePriorityMock(...args),
    reorderRules: vi.fn().mockResolvedValue(undefined),
    deleteRule: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/db/repositories/historyLog", () => ({
  addHistoryEntry: vi.fn().mockResolvedValue(undefined),
  logSoftDelete: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/pipeline", () => ({
  reevaluateAllRuleBasedTransactions: vi.fn().mockResolvedValue(undefined),
}));

function makeRule(id: number, priority: number): RuleWithConditions {
  return {
    id,
    priority,
    category_id: null,
    tag_id: null,
    mark_as_transfer: 0,
    mark_as_saving: 0,
    created_from: "manual",
    merchant_id: null,
    is_deleted: 0,
    groups: [{ conditions: [{ field: "counterparty", operator: "contains", value: `Regel ${id}` }] }],
  } as unknown as RuleWithConditions;
}

describe("RulesManagerDrawer – Sortierung über Hoch/Runter", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    swapRulePriorityMock.mockClear();
  });

  function renderDrawer(rules: RuleWithConditions[]) {
    queryClient.setQueryData(["rules"], rules);
    queryClient.setQueryData(["categories"], []);
    queryClient.setQueryData(["tags"], []);
    return render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <RulesManagerDrawer open={true} onOpenChange={vi.fn()} />
        </I18nextProvider>
      </QueryClientProvider>,
    );
  }

  it("ruft swapRulePriority mit Nachbar-Regel auf, wenn 'Nach oben' geklickt wird", async () => {
    const rules = [makeRule(1, 1), makeRule(2, 2), makeRule(3, 3)];
    renderDrawer(rules);

    const upButtons = await screen.findAllByRole("button", { name: /nach oben/i });
    // Erste Regel hat kein "nach oben" (disabled), also die zweite anklicken.
    fireEvent.click(upButtons[1]);

    await waitFor(() => {
      expect(swapRulePriorityMock).toHaveBeenCalledWith(2, 1);
    });
  });

  it("ruft swapRulePriority mit Nachbar-Regel auf, wenn 'Nach unten' geklickt wird", async () => {
    const rules = [makeRule(1, 1), makeRule(2, 2), makeRule(3, 3)];
    renderDrawer(rules);

    const downButtons = await screen.findAllByRole("button", { name: /nach unten/i });
    fireEvent.click(downButtons[0]);

    await waitFor(() => {
      expect(swapRulePriorityMock).toHaveBeenCalledWith(1, 2);
    });
  });

  it("deaktiviert 'Nach oben' für die erste und 'Nach unten' für die letzte Regel", async () => {
    const rules = [makeRule(1, 1), makeRule(2, 2)];
    renderDrawer(rules);

    const upButtons = await screen.findAllByRole("button", { name: /nach oben/i });
    const downButtons = await screen.findAllByRole("button", { name: /nach unten/i });

    expect(upButtons[0]).toBeDisabled();
    expect(downButtons[downButtons.length - 1]).toBeDisabled();
  });
});
