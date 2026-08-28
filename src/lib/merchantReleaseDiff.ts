import type { Category, Merchant } from "@/db/types";
import type { MerchantDataRelease } from "@/db/repositories/merchants";

export interface DiffRow {
  canonical_name: string;
  display_name: string;
  status: "new" | "changed" | "deprecated";
  /** Lokal bereits angepasst (is_modified=1) – Übernahme würde die eigene Anpassung überschreiben. */
  localModified: boolean;
}

export function computeMerchantReleaseDiff(
  currentMerchants: Merchant[],
  categories: Category[],
  release: MerchantDataRelease
): DiffRow[] {
  const byCanonical = new Map(currentMerchants.map((m) => [m.canonical_name, m]));
  const templateKeyById = new Map(categories.map((c) => [c.id, c.template_key]));
  const rows: DiffRow[] = [];

  for (const m of release.merchants) {
    const existing = byCanonical.get(m.canonical_name);

    if (m.status === "deprecated") {
      // Nur relevant, wenn lokal noch aktiv und unverändert vorhanden
      if (existing && existing.is_active === 1) {
        rows.push({
          canonical_name: m.canonical_name,
          display_name: m.display_name,
          status: "deprecated",
          localModified: existing.is_modified === 1,
        });
      }
      continue;
    }

    if (!existing) {
      rows.push({
        canonical_name: m.canonical_name,
        display_name: m.display_name,
        status: "new",
        localModified: false,
      });
      continue;
    }

    const currentTemplateKey = existing.default_category_id
      ? templateKeyById.get(existing.default_category_id) ?? null
      : null;

    if (
      existing.display_name !== m.display_name ||
      (currentTemplateKey ?? null) !== (m.default_category_template_key ?? null)
    ) {
      rows.push({
        canonical_name: m.canonical_name,
        display_name: m.display_name,
        status: "changed",
        localModified: existing.is_modified === 1,
      });
    }
  }

  return rows;
}
