import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ImportWizard } from "./ImportWizard";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mocking external dependencies
vi.mock("@/hooks/useAssets", () => ({
  useAssets: () => ({ data: [{ id: 1, name: "Girokonto", currency: "EUR" }] }),
}));

vi.mock("@/hooks/usePersons", () => ({
  usePersons: () => ({ data: [] }),
}));

vi.mock("@/db/repositories/assets", () => ({
  createAsset: vi.fn().mockResolvedValue(2),
}));

vi.mock("@/db/repositories/valueHistory", () => ({
  getAnchor: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/db/repositories/importProfiles", () => ({
  findByFingerprint: vi.fn().mockResolvedValue({
    id: 99,
    name: "Mock Profile",
    column_map_json: {
      date: "Datum",
      amount: "Betrag",
      counterparty: "Empfänger",
      purpose: "Zweck"
    }
  }),
  createImportProfile: vi.fn().mockReturnValue(1),
  updateImportProfile: vi.fn(),
  listAccountMapForProfile: vi.fn().mockReturnValue([]),
  setAccountMapping: vi.fn(),
}));

vi.mock("@/lib/import/runImport", () => ({
  runImport: vi.fn().mockResolvedValue({
    status: "success",
    transactionsImported: 2,
    transactionsUpdated: 0,
    transactionsSkipped: 0,
    ignoredRows: 0,
    errors: [],
  }),
  runMultiAccountImport: vi.fn().mockResolvedValue({
    status: "success",
    transactionsImported: 2,
    transactionsUpdated: 0,
    transactionsSkipped: 0,
    ignoredRows: 0,
    errors: [],
    accountCreationErrors: [],
  }),
  detectBankAccountLabels: vi.fn().mockReturnValue(["DE123"]),
  detectAmountChanges: vi.fn().mockReturnValue([]),
  detectAmountChangesMultiAccount: vi.fn().mockReturnValue([]),
  parseRows: vi.fn().mockReturnValue([]),
}));

describe("ImportWizard", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
  });

  const renderWizard = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ImportWizard open={true} assetId={1} onOpenChange={vi.fn()} onCompleted={vi.fn()} />
        </I18nextProvider>
      </QueryClientProvider>
    );
  };

  it("durchläuft den gesamten Import-Prozess", async () => {
    renderWizard();

    // 1. Datei wählen
    const fileInput = document.querySelector("input[type=file]") as HTMLInputElement;
    const fileContent = "Datum,Betrag,Empfänger,Zweck\n01.01.2024,100.00,ALDI,Dies ist ein sehr langer Verwendungszweck";
    const file = new File([fileContent], "test.csv", { type: "text/csv" });
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);

    // 2. Erwartet Wechsel zum Mapping-Schritt
    let weiterBtn1: HTMLElement | null = null;
    await waitFor(() => {
      weiterBtn1 = screen.getByRole("button", { name: /Weiter/i });
      expect(weiterBtn1).not.toBeDisabled();
    }, { timeout: 2000 });
    
    if (weiterBtn1) {
      act(() => {
        fireEvent.click(weiterBtn1!);
      });
    }

    // 3. Erwartet Wechsel zum Preview-Schritt
    let weiterBtn2: HTMLElement | null = null;
    await waitFor(() => {
      weiterBtn2 = screen.getByRole("button", { name: /Weiter/i });
      expect(weiterBtn2).not.toBeDisabled();
    }, { timeout: 2000 });
    
    if (weiterBtn2) {
      act(() => {
        fireEvent.click(weiterBtn2!);
      });
    }

    // 4. Zusammenfassung (PreviewStep)
    const importStartBtn = await screen.findByRole("button", { name: /Import starten/i });
    expect(importStartBtn).not.toBeNull();
    
    // Balance bypass klicken
    const unknownBtn = await screen.findByRole("button", { name: /Weiß ich gerade nicht/i });
    act(() => {
      fireEvent.click(unknownBtn);
    });

    expect(importStartBtn).not.toBeDisabled();
    act(() => {
      fireEvent.click(importStartBtn);
    });

    // 5. ResultStep
    const closeBtn = await screen.findByRole("button", { name: /Fertig/i });
    expect(closeBtn).not.toBeNull();
  });
});
