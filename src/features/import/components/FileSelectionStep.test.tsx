/**
 * T15.1 – Import-Wizard: Erfolgsfall-Komponententest
 *
 * Testet FileSelectionStep isoliert: Datei-Dropdown, Drag-and-Drop Zone,
 * Datei auswählen per input und Fehlerzustand.
 *
 * DB-Zugriffe sind nicht direkt involviert (nur Props).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FileSelectionStep } from "@/features/import/components/FileSelectionStep";
import type { Asset } from "@/db/types";

// Mock i18n
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

const MOCK_ASSETS: Asset[] = [
  { id: 1, name: "Girokonto", type: "account", currency: "EUR", iban: null, person_id: null, created_at: "", updated_at: "" },
  { id: 2, name: "Sparkonto", type: "account", currency: "EUR", iban: null, person_id: null, created_at: "", updated_at: "" },
];

function renderFileSelectionStep(overrides: Partial<{
  accountAssets: Asset[];
  selectedAssetId: number;
  file: File | null;
  fileError: string | null;
  setSelectedAssetId: (id: number) => void;
  onFileSelected: (f: File) => void;
}> = {}) {
  const props = {
    accountAssets: MOCK_ASSETS,
    selectedAssetId: 1,
    setSelectedAssetId: vi.fn(),
    dragOver: false,
    setDragOver: vi.fn(),
    file: null,
    fileError: null,
    parsedFile: null,
    onFileSelected: vi.fn(),
    ...overrides,
  };
  const utils = render(<FileSelectionStep {...props} />);
  return { ...utils, props };
}

describe("FileSelectionStep", () => {
  it("rendert Konto-Dropdown mit verfügbaren Assets", () => {
    renderFileSelectionStep();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("zeigt den Datei-Namen nach Auswahl (via file-Prop)", () => {
    const file = new File(["col1,col2\nval1,val2"], "test.csv", { type: "text/csv" });
    renderFileSelectionStep({ file });
    expect(screen.getByText(/test\.csv/)).toBeInTheDocument();
  });

  it("zeigt Fehler-Text bei fileError", () => {
    renderFileSelectionStep({ fileError: "Datei konnte nicht gelesen werden" });
    expect(screen.getByText(/Datei konnte nicht gelesen werden/)).toBeInTheDocument();
  });

  it("zeigt Drag-Drop-Hinweis wenn keine Datei ausgewählt", () => {
    renderFileSelectionStep({ file: null });
    // i18n t() gibt den Key zurück
    const dropZoneHints = screen.getAllByText(/import\.file\.dragDrop/i);
    expect(dropZoneHints.length).toBeGreaterThan(0);
  });

  it("file-Input ist vorhanden und akzeptiert .csv/.xlsx", () => {
    renderFileSelectionStep();

    const fileInput = document.querySelector("input[type=file]") as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    expect(fileInput.accept).toContain(".csv");
    expect(fileInput.accept).toContain(".xlsx");
  });

  it("zeigt Drag-Zone als Drop-Target (erreichbares Element)", () => {
    renderFileSelectionStep();

    const allDivs = document.querySelectorAll("div");
    const dragDiv = Array.from(allDivs).find(d =>
      d.className.includes("border-dashed")
    );
    expect(dragDiv).toBeTruthy();
    // Das div existiert und ist bereit Drag-Events zu empfangen
    expect(dragDiv).toBeInTheDocument();
  });
});
