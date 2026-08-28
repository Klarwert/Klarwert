import { create } from "zustand";

interface GlobalFilterState {
  selectedAccountId: number | null;
  selectedPersonId: number | null;
  setSelectedAccountId: (id: number | null) => void;
  setSelectedPersonId: (id: number | null) => void;
}

/** Session-Filter (Konto/Person). Bewusst nicht persistiert – Reset bei App-Neustart. */
export const useGlobalFilterStore = create<GlobalFilterState>((set) => ({
  selectedAccountId: null,
  selectedPersonId: null,
  setSelectedAccountId: (id) => set({ selectedAccountId: id }),
  setSelectedPersonId: (id) => set({ selectedPersonId: id }),
}));
