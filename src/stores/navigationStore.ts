import { create } from "zustand";

export type PageKey =
  | "uebersicht"
  | "vermoegen"
  | "transaktionen"
  | "kategorien"
  | "vertraege"
  | "sammlungen"
  | "budgets"
  | "steuer"
  | "rechner"
  | "profil";

interface NavigationState {
  currentPage: PageKey;
  navigate: (page: PageKey) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentPage: "vermoegen",
  navigate: (page) => set({ currentPage: page }),
}));
