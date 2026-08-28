import { useEffect, useState } from "react";
import { COLUMN_ROLE_LABELS, type ColumnRole } from "@/lib/import/bankProfiles";

export interface OptionalColumn {
  key: string;
  label: string;
}

/** Immer verfügbare Spalten, unabhängig vom Bankprofil (keine extra_fields_json-Werte). */
export const CORE_OPTIONAL_COLUMNS: OptionalColumn[] = [
  { key: "purpose", label: "Verwendungszweck" },
  { key: "asset_name", label: "Quellkonto" },
  { key: "external_id", label: "Buchungs-ID" },
  { key: "tags", label: "Tags" },
];

/**
 * Ermittelt die Vereinigungsmenge aller tatsächlich vorkommenden extra_fields_json-Schlüssel über
 * die übergebenen (aktuell gefilterten) Buchungen – statt einer festen Liste, damit auch Extra-Felder
 * aus Community-Bankvorlagen mit unbekannten Rollen als Spalte anwählbar sind (siehe Import-Architektur v2, 2.2).
 */
export function buildDynamicOptionalColumns(
  transactions: { extra_fields_json: string | null }[] | undefined,
): OptionalColumn[] {
  const keys = new Set<string>();
  for (const t of transactions ?? []) {
    if (!t.extra_fields_json) continue;
    try {
      const obj = JSON.parse(t.extra_fields_json) as Record<string, unknown>;
      for (const k of Object.keys(obj)) keys.add(k);
    } catch {
      // ignorieren, ungültiges JSON
    }
  }
  return [...keys]
    .sort()
    .map((key) => ({ key, label: COLUMN_ROLE_LABELS[key as ColumnRole] ?? key }));
}

const STORAGE_KEY = "klarwert.transactions.visibleColumns";

/** Lokale UI-Präferenz (B3b Spalten-Auswahl) – alle optionalen Spalten standardmäßig aus. */
export function useColumnVisibility() {
  const [visible, setVisible] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...visible]));
  }, [visible]);

  function toggle(key: string) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return { visible, toggle };
}
