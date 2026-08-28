import { create } from "zustand";

export interface AssetCreatePrefill {
  name?: string;
  iban?: string;
  ibanLocked?: boolean;
}

interface UiState {
  /** Vom Onboarding (Schritt 3) gesetzt; die Vermögen-Seite öffnet daraufhin einmalig Modal 5.1. */
  pendingOpenCreateAsset: boolean;
  /** Vorbefüllung für den nächsten CreateAssetModal-Öffnungsvorgang (z. B. Auto-Konto-Vorschlag). */
  pendingAssetPrefill: AssetCreatePrefill | null;
  requestOpenCreateAsset: (prefill?: AssetCreatePrefill) => void;
  consumeOpenCreateAssetRequest: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  pendingOpenCreateAsset: false,
  pendingAssetPrefill: null,
  requestOpenCreateAsset: (prefill) => set({ pendingOpenCreateAsset: true, pendingAssetPrefill: prefill ?? null }),
  consumeOpenCreateAssetRequest: () => set({ pendingOpenCreateAsset: false, pendingAssetPrefill: null }),
}));
