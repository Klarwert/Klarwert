import { create } from "zustand";
import { getAllSettings, setSetting } from "@/db/repositories/settings";

interface SettingsState {
  loaded: boolean;
  currency: string;
  importReminderDays: number;
  kirchensteuerAktiv: boolean;
  kirchensteuerSatz: 8 | 9;
  onboardingDone: boolean;
  dateDisplayFormat: "dd.MM.yyyy" | "yyyy-MM-dd";
  useRuleTemplates: boolean;
  load: () => Promise<void>;
  setCurrency: (currency: string) => Promise<void>;
  setImportReminderDays: (days: number) => Promise<void>;
  setKirchensteuer: (aktiv: boolean, satz: 8 | 9) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  setDateDisplayFormat: (format: "dd.MM.yyyy" | "yyyy-MM-dd") => Promise<void>;
  setUseRuleTemplates: (enabled: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  loaded: false,
  currency: "EUR",
  importReminderDays: 30,
  kirchensteuerAktiv: false,
  kirchensteuerSatz: 8,
  onboardingDone: false,
  dateDisplayFormat: "dd.MM.yyyy",
  useRuleTemplates: true,

  load: async () => {
    const all = await getAllSettings();
    set({
      loaded: true,
      currency: all.currency ?? "EUR",
      importReminderDays: Number(all.import_reminder_days ?? "30"),
      kirchensteuerAktiv: all.kirchensteuer_aktiv === "1",
      kirchensteuerSatz: all.kirchensteuer_satz === "9" ? 9 : 8,
      onboardingDone: all.onboarding_done === "1",
      dateDisplayFormat: all.date_display_format ?? "dd.MM.yyyy",
      useRuleTemplates: (all.use_rule_templates ?? "1") === "1",
    });
  },

  setCurrency: async (currency) => {
    await setSetting("currency", currency);
    set({ currency });
  },

  setImportReminderDays: async (days) => {
    await setSetting("import_reminder_days", String(days));
    set({ importReminderDays: days });
  },

  setKirchensteuer: async (aktiv, satz) => {
    await setSetting("kirchensteuer_aktiv", aktiv ? "1" : "0");
    await setSetting("kirchensteuer_satz", String(satz) as "8" | "9");
    set({ kirchensteuerAktiv: aktiv, kirchensteuerSatz: satz });
  },

  completeOnboarding: async () => {
    await setSetting("onboarding_done", "1");
    set({ onboardingDone: true });
  },

  setDateDisplayFormat: async (format) => {
    await setSetting("date_display_format", format);
    set({ dateDisplayFormat: format });
  },

  setUseRuleTemplates: async (enabled) => {
    await setSetting("use_rule_templates", enabled ? "1" : "0");
    set({ useRuleTemplates: enabled });
  },
}));
