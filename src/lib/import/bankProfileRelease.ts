import { z } from "zod";
import { createImportProfile, listImportProfiles } from "@/db/repositories/importProfiles";
import { computeHeaderFingerprint } from "@/lib/import/fingerprint";
import type { ColumnMap } from "@/lib/import/bankProfiles";

// Schema-Version muss mit dem Community-Rules-Repo übereinstimmen.
export const BANK_PROFILE_RELEASE_SCHEMA_VERSION = 1;

const ColumnMapSchema = z.record(z.string(), z.string());

const BankProfileEntrySchema = z.object({
  name: z.string().min(1),
  delimiter: z.enum([",", ";", "\t"]),
  encoding: z.string(),
  date_format: z.string(),
  decimal_format: z.enum(["de", "en"]),
  headers: z.array(z.string()),
  column_map: ColumnMapSchema,
  import_all_columns: z.boolean().optional().default(false),
  /** "active" oder "deprecated" – deprecated-Einträge werden ignoriert/nicht importiert. */
  status: z.enum(["active", "deprecated"]).default("active"),
});

export type BankProfileEntry = z.infer<typeof BankProfileEntrySchema>;

const BankProfileReleaseSchema = z.object({
  schema_version: z.literal(BANK_PROFILE_RELEASE_SCHEMA_VERSION),
  source_version: z.string(),
  profiles: z.array(BankProfileEntrySchema),
});

export type BankProfileRelease = z.infer<typeof BankProfileReleaseSchema>;

/**
 * Parst und validiert das Community-Bank-Profile-JSON.
 * Wirft bei ungültigem Format oder falscher Schema-Version einen Fehler.
 */
export function parseBankProfileRelease(raw: unknown): BankProfileRelease {
  const result = BankProfileReleaseSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Ungültiges Bank-Profile-Release-Format: ${issues}`);
  }
  return result.data;
}

export interface BankProfileDiffRow {
  name: string;
  status: "new" | "skipped_user_modified";
}

/**
 * Vergleicht das Release mit den lokal vorhandenen Profilen.
 * Gibt zurück, welche Profile neu hinzugefügt werden würden.
 * Bereits vorhandene (is_builtin) Profile werden nur dann übernommen, wenn `locally_modified = 0`.
 */
export function computeBankProfileReleaseDiff(
  existing: Array<{ name: string; is_builtin: 0 | 1; locally_modified: 0 | 1 }>,
  release: BankProfileRelease
): BankProfileDiffRow[] {
  const existingByName = new Map(existing.map((p) => [p.name, p]));
  const rows: BankProfileDiffRow[] = [];

  for (const profile of release.profiles) {
    if (profile.status === "deprecated") continue;
    const found = existingByName.get(profile.name);
    if (!found) {
      rows.push({ name: profile.name, status: "new" });
    } else if (found.locally_modified === 1) {
      rows.push({ name: profile.name, status: "skipped_user_modified" });
    }
    // Bereits vorhanden und nicht modifiziert → kein Eintrag im Diff (keine Änderung nötig)
  }

  return rows;
}

/**
 * Wendet ein Bank-Profile-Release auf die lokale DB an.
 * - Neue Profile werden eingefügt
 * - Bestehende Profile mit `locally_modified = 0` werden aktualisiert
 * - Profile mit `locally_modified = 1` werden nie überschrieben
 * - Deprecated-Einträge werden ignoriert (kein Soft-Delete, da Nutzer das Profil evtl. noch nutzt)
 */
export async function applyBankProfileRelease(release: BankProfileRelease): Promise<{ inserted: number; updated: number; skipped: number }> {
  const existing = await listImportProfiles();
  const existingByName = new Map(existing.map((p) => [p.name, p]));

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const profile of release.profiles) {
    if (profile.status === "deprecated") continue;

    const columnMap: ColumnMap = profile.column_map;
    const found = existingByName.get(profile.name);

    if (!found) {
      await createImportProfile({
        name: profile.name,
        is_builtin: true,
        header_fingerprint: computeHeaderFingerprint(profile.headers),
        delimiter: profile.delimiter,
        encoding: profile.encoding,
        date_format: profile.date_format,
        decimal_format: profile.decimal_format,
        column_map_json: JSON.stringify(columnMap),
        import_all_columns: profile.import_all_columns ?? false,
      });
      inserted++;
    } else if (found.locally_modified) {
      skipped++;
    } else {
      // Bereits vorhanden, aber nicht vom Nutzer modifiziert → aus Community-Update übernehmen
      const { updateImportProfile } = await import("@/db/repositories/importProfiles");
      await updateImportProfile(found.id, {
        header_fingerprint: computeHeaderFingerprint(profile.headers),
        delimiter: profile.delimiter,
        encoding: profile.encoding,
        date_format: profile.date_format,
        decimal_format: profile.decimal_format,
        column_map_json: JSON.stringify(columnMap),
        import_all_columns: profile.import_all_columns ?? false,
      });
      updated++;
    }
  }

  return { inserted, updated, skipped };
}
