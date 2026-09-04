import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RuleConditionGroupsEditor } from "./RuleConditionGroupsEditor";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import type { RuleConditionInput } from "@/db/repositories/rules";

// Mocking useAssets and previewRuleMatches
vi.mock("@/hooks/useAssets", () => ({
  useAssets: () => ({ data: [] }),
}));
vi.mock("@/db/repositories/rules", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    previewRuleMatches: vi.fn().mockResolvedValue({ count: 0, sample: [] }),
    listDistinctValuesForField: vi.fn().mockResolvedValue(["REWE", "ALDI"]),
    listExtraFieldKeys: vi.fn().mockResolvedValue([]),
  };
});

describe("RuleConditionGroupsEditor UI", () => {
  it("rendert eine existierende Gruppe und erlaubt Änderungen", async () => {
    const mockOnChange = vi.fn();
    const initialGroups: RuleConditionInput[][] = [
      [
        { field: "counterparty", operator: "contains", value: "Edeka" }
      ]
    ];

    render(
      <I18nextProvider i18n={i18n}>
        <RuleConditionGroupsEditor groups={initialGroups} onChange={mockOnChange} />
      </I18nextProvider>
    );

    // Existierende Bedingung ist sichtbar
    expect(screen.getByDisplayValue("Edeka")).not.toBeNull();

    // UND-Bedingung hinzufügen
    const addAndButtons = screen.getAllByRole("button", { name: /UND-Bedingung/i });
    fireEvent.click(addAndButtons[0]);

    // ODER-Gruppe hinzufügen
    const addOrButton = screen.getByRole("button", { name: /ODER-Gruppe/i });
    fireEvent.click(addOrButton);

    // Wir erwarten, dass onChange aufgerufen wurde mit der neuen leeren Gruppe
    // Da onChange direkt bei jeder Manipulation aufgerufen wird.
    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalled();
      const lastCall = mockOnChange.mock.lastCall?.[0] as RuleConditionInput[][];
      expect(lastCall.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("kann Operatoren und Werte ändern", async () => {
    const mockOnChange = vi.fn();
    const initialGroups: RuleConditionInput[][] = [
      [
        { field: "counterparty", operator: "contains", value: "" }
      ]
    ];

    render(
      <I18nextProvider i18n={i18n}>
        <RuleConditionGroupsEditor groups={initialGroups} onChange={mockOnChange} />
      </I18nextProvider>
    );

    const input = screen.getAllByPlaceholderText(/Wert/i)[0];
    fireEvent.change(input, { target: { value: "Neu" } });

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalled();
      const lastCall = mockOnChange.mock.lastCall?.[0] as RuleConditionInput[][];
      expect(lastCall[0][0].value).toBe("Neu");
    });
  });
});
