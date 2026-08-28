import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SETTINGS_REGISTRY, type SettingsMap, type SettingsKeys, type SettingCategory, type SettingDefinition } from "@/lib/settings/registry";
import { getAllSettings, setSetting } from "@/db/repositories/settings";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/stores/settingsStore";

const CATEGORY_ORDER: SettingCategory[] = ["general", "notifications", "quotes", "experimental", "data"];

export function DynamicSettings() {
  const { t } = useTranslation(["profil", "app"]);
  const [settings, setSettings] = useState<Partial<SettingsMap>>({});
  const [loading, setLoading] = useState(true);
  
  // To keep the store synced for components relying on it immediately
  const loadStore = useSettingsStore(s => s.load);

  useEffect(() => {
    void getAllSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  async function updateSetting<K extends SettingsKeys>(key: K, value: SettingsMap[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    await setSetting(key, value);
    void loadStore(); // resync zustand store
  }

  if (loading) return null;

  // Group settings by category
  const grouped: Record<SettingCategory, SettingsKeys[]> = {
    general: [],
    notifications: [],
    data: [],
    experimental: [],
    quotes: [],
  };

  for (const [key, def] of Object.entries(SETTINGS_REGISTRY)) {
    // skip internal / complex settings that are handled custom in ProfilPage
    if (["quotes_provider", "quotes_alpaca_key", "quotes_alpaca_secret", "quotes_privacy_accepted"].includes(key)) {
      continue; 
    }
    grouped[def.category].push(key as SettingsKeys);
  }

  return (
    <div className="space-y-6">
      {CATEGORY_ORDER.map((category) => {
        const keys = grouped[category];
        if (keys.length === 0) return null;

        return (
          <div key={category} className="space-y-4 rounded-card border border-border bg-card p-6">
            <h2 className="font-heading text-lg text-charcoal">
              {t(`settingsCategories.${category}`, category.charAt(0).toUpperCase() + category.slice(1))}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {keys.map((key) => {
                const def = SETTINGS_REGISTRY[key] as unknown as SettingDefinition<any>;
                const value = settings[key] ?? def.default;
                
                // Determine input type based on schema/default
                let inputType = "text";
                if (typeof def.default === "boolean" || (def.schema.isOptional() === false && (def.default === "0" || def.default === "1"))) {
                   inputType = "switch";
                } else if (def.default === "de" || def.default === "en" || key === "language") {
                   inputType = "language";
                } else if (key === "currency") {
                   inputType = "currency";
                } else if (key === "date_display_format") {
                   inputType = "date_format";
                } else if (key === "notification_level") {
                   inputType = "notification_level";
                } else if (!isNaN(Number(def.default))) {
                   inputType = "number";
                }
                
                // Try to resolve label via i18n
                const label = (def.label ? (t as any)(def.label) : (t as any)(`settingsKeys.${key}`, key.replace(/_/g, " "))) as string;
                const description = def.description ? ((t as any)(def.description) as string) : null;

                return (
                  <div key={key} className="space-y-1.5 flex flex-col justify-center">
                    {inputType === "switch" ? (
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`setting-${key}`}
                          checked={value === "1"}
                          onCheckedChange={(checked) => void updateSetting(key, checked ? "1" : "0")}
                        />
                        <Label htmlFor={`setting-${key}`} className="cursor-pointer">{label}</Label>
                      </div>
                    ) : (
                      <>
                        <Label htmlFor={`setting-${key}`}>{label}</Label>
                        {inputType === "language" && (
                          <Select value={value} onValueChange={(v) => void updateSetting(key, v)}>
                            <SelectTrigger id={`setting-${key}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="de">{t("settingsValues.language.de")}</SelectItem>
                              <SelectItem value="en">{t("settingsValues.language.en")}</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        {inputType === "currency" && (
                          <Select value={value} onValueChange={(v) => void updateSetting(key, v)}>
                            <SelectTrigger id={`setting-${key}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="EUR">{t("settingsValues.currency.EUR")}</SelectItem>
                              <SelectItem value="USD">{t("settingsValues.currency.USD")}</SelectItem>
                              <SelectItem value="CHF">{t("settingsValues.currency.CHF")}</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        {inputType === "date_format" && (
                          <Select value={value} onValueChange={(v) => void updateSetting(key, v as any)}>
                            <SelectTrigger id={`setting-${key}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="dd.MM.yyyy">dd.MM.yyyy (31.12.2023)</SelectItem>
                              <SelectItem value="yyyy-MM-dd">yyyy-MM-dd (2023-12-31)</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        {inputType === "notification_level" && (
                          <Select value={value} onValueChange={(v) => void updateSetting(key, v as any)}>
                            <SelectTrigger id={`setting-${key}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">{t("settingsValues.notificationLevel.all")}</SelectItem>
                              <SelectItem value="warning">{t("settingsValues.notificationLevel.warning")}</SelectItem>
                              <SelectItem value="critical">{t("settingsValues.notificationLevel.critical")}</SelectItem>
                              <SelectItem value="none">{t("settingsValues.notificationLevel.none")}</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        {inputType === "text" && (
                          <Input
                            id={`setting-${key}`}
                            value={String(value)}
                            onChange={(e) => void updateSetting(key, e.target.value)}
                          />
                        )}
                        {inputType === "number" && (
                          <Input
                            id={`setting-${key}`}
                            type="number"
                            value={String(value)}
                            onChange={(e) => void updateSetting(key, e.target.value)}
                          />
                        )}
                      </>
                    )}
                    {description && <p className="text-xs text-slate">{description}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
