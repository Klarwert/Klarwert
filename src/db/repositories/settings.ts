import { getDb } from "@/db/client";
import type { SettingsMap } from "@/db/types";

const DEFAULT_SETTINGS: Partial<SettingsMap> = {
  currency: "EUR",
  import_reminder_days: "30",
  kirchensteuer_aktiv: "0",
  kirchensteuer_satz: "8",
  onboarding_done: "0",
  date_display_format: "dd.MM.yyyy",
  use_rule_templates: "1",
  rule_templates_migrated_to_merchants: "0",
  // Default aus (nicht ein): eine Netzwerkanfrage an GitHub beim Start soll der Nutzer bewusst
  // aktivieren, nichts passiert ungefragt im Hintergrund (siehe prompt-auto-update.md).
  check_updates_on_startup: "0",
};

export async function getAllSettings(): Promise<SettingsMap> {
  const db = await getDb();
  const rows = await db.select<{ key: string; value: string }[]>(
    "select key, value from settings",
  );
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...map } as unknown as SettingsMap;
}

export async function getSetting<K extends keyof SettingsMap>(
  key: K,
): Promise<SettingsMap[K] | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "select value from settings where key = $1",
    [key],
  );
  return (rows[0]?.value as SettingsMap[K]) ?? null;
}

export async function setSetting<K extends keyof SettingsMap>(
  key: K,
  value: SettingsMap[K],
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `insert into settings (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value`,
    [key, value],
  );
}
