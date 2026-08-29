import { z } from "zod";

export type SettingCategory = "general" | "notifications" | "data" | "experimental" | "quotes";

export interface SettingDefinition<T> {
  key: string;
  schema: z.ZodType<T>;
  default: T;
  category: SettingCategory;
  label?: string; // Optional UI label key
  description?: string; // Optional UI description key
}

export const SETTINGS_REGISTRY = {
  // General
  currency: {
    key: "currency",
    schema: z.string(),
    default: "EUR",
    category: "general",
  },
  date_display_format: {
    key: "date_display_format",
    schema: z.enum(["dd.MM.yyyy", "dd.MM.yy", "dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"]),
    default: "dd.MM.yyyy",
    category: "general",
  },
  language: {
    key: "language",
    schema: z.string(),
    default: "de" as string, // assuming default
    category: "general",
  },
  onboarding_done: {
    key: "onboarding_done",
    schema: z.enum(["0", "1"]),
    default: "0",
    category: "general",
  },
  
  // Tax / Features
  kirchensteuer_aktiv: {
    key: "kirchensteuer_aktiv",
    schema: z.enum(["0", "1"]),
    default: "0",
    category: "general",
  },
  kirchensteuer_satz: {
    key: "kirchensteuer_satz",
    schema: z.enum(["8", "9"]),
    default: "8",
    category: "general",
  },
  use_rule_templates: {
    key: "use_rule_templates",
    schema: z.enum(["0", "1"]),
    default: "1",
    category: "general",
  },
  rule_templates_migrated_to_merchants: {
    key: "rule_templates_migrated_to_merchants",
    schema: z.enum(["0", "1"]),
    default: "0",
    category: "general",
  },

  // Updates
  check_updates_on_startup: {
    key: "check_updates_on_startup",
    schema: z.enum(["0", "1"]),
    default: "0",
    category: "general",
  },

  // Notifications
  notification_level: {
    key: "notification_level",
    schema: z.enum(["all", "warning", "critical", "none"]),
    default: "all",
    category: "notifications",
  },
  notify_transfer_detected: {
    key: "notify_transfer_detected",
    schema: z.enum(["0", "1"]),
    default: "1",
    category: "notifications",
  },
  import_reminder_days: {
    key: "import_reminder_days",
    schema: z.string(),
    default: "30",
    category: "notifications",
  },
  notify_contract_detected: {
    key: "notify_contract_detected",
    schema: z.enum(["0", "1"]),
    default: "1",
    category: "notifications",
  },

  // Quotes
  quotes_enabled: {
    key: "quotes_enabled",
    schema: z.enum(["0", "1"]),
    default: "0",
    category: "quotes",
  },
  quotes_provider: {
    key: "quotes_provider",
    schema: z.string(),
    default: "yahoo",
    category: "quotes",
  },
  quotes_alpaca_key: {
    key: "quotes_alpaca_key",
    schema: z.string(),
    default: "",
    category: "quotes",
  },
  quotes_alpaca_secret: {
    key: "quotes_alpaca_secret",
    schema: z.string(),
    default: "",
    category: "quotes",
  },
  quotes_privacy_accepted: {
    key: "quotes_privacy_accepted",
    schema: z.enum(["0", "1"]),
    default: "0",
    category: "quotes",
  },

  // Experimental / Feature Flags
  dev_mode: {
    key: "dev_mode",
    schema: z.enum(["0", "1"]),
    default: "0",
    category: "experimental",
    label: "profil:settingsKeys.dev_mode",
    description: "profil:settingsDescriptions.dev_mode",
  },
} as const satisfies Record<string, SettingDefinition<any>>;

export type SettingsRegistryType = typeof SETTINGS_REGISTRY;
export type SettingsKeys = keyof SettingsRegistryType;

// Infer the SettingsMap type automatically from the registry schemas
export type SettingsMap = {
  [K in SettingsKeys]: z.infer<SettingsRegistryType[K]["schema"]>;
};

export function getDefaultSettings(): SettingsMap {
  const defaults: Partial<SettingsMap> = {};
  for (const [key, def] of Object.entries(SETTINGS_REGISTRY)) {
    // @ts-expect-error (dynamic assignment of default value)
    defaults[key as SettingsKeys] = def.default;
  }
  return defaults as SettingsMap;
}

export function parseSettingValue<K extends SettingsKeys>(key: K, value: unknown): SettingsMap[K] {
  const schema = SETTINGS_REGISTRY[key].schema;
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return parsed.data as SettingsMap[K];
  }
  console.warn(`[Settings] Invalid value for ${key}: ${value}. Using default.`);
  return SETTINGS_REGISTRY[key].default as SettingsMap[K];
}
