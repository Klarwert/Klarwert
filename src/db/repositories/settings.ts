import { getDb } from "@/db/client";
import { getDefaultSettings, parseSettingValue, type SettingsKeys, type SettingsMap } from "@/lib/settings/registry";

export async function getAllSettings(): Promise<SettingsMap> {
  const db = await getDb();
  const rows = await db.select<{ key: string; value: string }[]>(
    "select key, value from settings",
  );
  
  const defaults = getDefaultSettings();
  const dbMap = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  
  const map: Partial<SettingsMap> = {};
  for (const key of Object.keys(defaults) as SettingsKeys[]) {
    if (key in dbMap) {
      // @ts-expect-error TypeScript kann den generischen Typ von map[key] nicht richtig eingrenzen
      map[key] = parseSettingValue(key, dbMap[key]);
    } else {
      // @ts-expect-error (fallback to default)
      map[key] = defaults[key];
    }
  }
  
  return map as SettingsMap;
}

export async function getSetting<K extends SettingsKeys>(
  key: K,
): Promise<SettingsMap[K]> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "select value from settings where key = $1",
    [key],
  );
  
  if (rows.length === 0) {
    return getDefaultSettings()[key];
  }
  
  return parseSettingValue(key, rows[0].value);
}

export async function setSetting<K extends SettingsKeys>(
  key: K,
  value: SettingsMap[K],
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `insert into settings (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value`,
    [key, String(value)],
  );
}
