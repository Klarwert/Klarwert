import { create } from "zustand";
import type { PeriodType } from "@/lib/periods";

export type PeriodScope = "uebersicht" | "transaktionen" | "budgets";

interface ScopePeriod {
  type: PeriodType;
  anchorIso: string;
}

interface PeriodState {
  scopes: Record<PeriodScope, ScopePeriod>;
  setType: (scope: PeriodScope, type: PeriodType) => void;
  setAnchorIso: (scope: PeriodScope, iso: string) => void;
  type: PeriodType;
  anchorIso: string;
}

const initialDate = new Date().toISOString().slice(0, 10);

const defaultScope = (): ScopePeriod => ({
  type: "month",
  anchorIso: initialDate,
});

/** Unabhängiger Zeitraum-Zustand je Bereich (Übersicht / Transaktionen / Budgets). */
export const usePeriodStore = create<PeriodState>((set) => ({
  scopes: {
    uebersicht: defaultScope(),
    transaktionen: defaultScope(),
    budgets: defaultScope(),
  },
  type: "month",
  anchorIso: initialDate,
  setType: (scope, type) =>
    set((state) => ({
      scopes: {
        ...state.scopes,
        [scope]: { ...state.scopes[scope], type },
      },
      type,
    })),
  setAnchorIso: (scope, anchorIso) =>
    set((state) => ({
      scopes: {
        ...state.scopes,
        [scope]: { ...state.scopes[scope], anchorIso },
      },
      anchorIso,
    })),
}));

