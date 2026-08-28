import { z } from "zod";
import { getDb, runInTransaction } from "@/db/client";
import type { Merchant, MerchantAlias, MerchantSuppression, CategorizationLog, CategorizationAlternative } from "@/db/types";
import { logOperation } from "./operations";
import { parseSqliteError } from "@/lib/errors";

export async function listMerchants(): Promise<Merchant[]> {
  const db = await getDb();
  return db.select<Merchant[]>(
    "select * from merchants where is_active = 1 order by display_name asc",
  );
}

/** Für die Verwaltungs-Ansicht: auch inaktive Händler, damit sie wieder aktiviert werden können. */
export async function listAllMerchants(): Promise<Merchant[]> {
  const db = await getDb();
  return db.select<Merchant[]>("select * from merchants order by display_name asc");
}

export async function getMerchant(id: number): Promise<Merchant | null> {
  const db = await getDb();
  const rows = await db.select<Merchant[]>(
    "select * from merchants where id = $1",
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Erzeugt aus einem freien Anzeigenamen einen für das Community-Rules-Schema gültigen Slug
 * (`^[a-z0-9_]{2,64}$`) - ohne das wäre ein lokal neu angelegter Händler (z.B. "Bio Company XY")
 * nie über ShareSuggestionsDialog teilbar, da sein canonical_name Leer-/Sonderzeichen enthielte.
 */
function slugifyCanonicalName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug.slice(0, 64) || "haendler";
}

export async function createMerchant(input: {
  canonical_name: string;
  display_name: string;
  default_category_id?: number | null;
  source_version?: string | null;
  is_builtin?: number;
}): Promise<number> {
  const db = await getDb();
  try {
    const res = await db.execute(
      `insert into merchants (canonical_name, display_name, default_category_id, source_version, is_builtin, is_active, source)
       values ($1, $2, $3, $4, $5, 1, $6)`,
      [
        slugifyCanonicalName(input.canonical_name),
        input.display_name.trim(),
        input.default_category_id ?? null,
        input.source_version ?? null,
        input.is_builtin ?? 0,
        input.is_builtin ? "system" : "user",
      ],
    );
    const id = res.lastInsertId as number;
    await logOperation(db, "insert", "merchants", id, { ...input, is_active: 1 }, null);
    return id;
  } catch (e) {
    throw parseSqliteError(e, "Fehler beim Erstellen des Händlers.");
  }
}

export async function updateMerchant(
  id: number,
  updates: Partial<Pick<Merchant, "display_name" | "default_category_id" | "is_active" | "is_modified">>,
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const args: any[] = [];
  let i = 1;
  for (const [key, val] of Object.entries(updates)) {
    sets.push(`${key} = $${i}`);
    args.push(val);
    i += 1;
  }
  if (sets.length === 0) return;
  const oldRows = await db.select<Merchant[]>("select * from merchants where id = $1", [id]);
  args.push(id);
  await db.execute(`update merchants set ${sets.join(", ")} where id = $${i}`, args);
  if (oldRows[0]) await logOperation(db, "update", "merchants", id, updates, oldRows[0]);
}

/**
 * Bearbeitet einen Händler unabhängig von seiner Herkunft (kuratiert oder eigen) – kuratierte
 * Händler waren bisher gesperrt, jetzt erzeugt eine Bearbeitung eine lokale Überschreibung
 * (`is_modified = 1`), das Original bleibt für künftige "Regel-Update prüfen"-Diffs erhalten
 * (siehe klarwert-haendler-regel-konzept-v2.md, Abschnitt 3).
 */
export async function updateMerchantContent(
  id: number,
  updates: { display_name: string; default_category_id: number | null },
): Promise<void> {
  const merchant = await getMerchant(id);
  await updateMerchant(id, {
    ...updates,
    is_modified: merchant?.is_builtin === 1 ? 1 : merchant?.is_modified,
  });
}

/** Vorschläge ähnlicher, bereits vorkommender Empfänger-Rohtexte für die Alias-Auswahl bei Neuanlage. */
export async function suggestCounterpartiesFor(displayName: string, limit = 8): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ counterparty: string }[]>(
    "select distinct counterparty from transactions where is_deleted = 0",
  );
  const { normalizeCounterparty, calculateSimilarity } = await import("@/lib/merchant-match");
  const target = normalizeCounterparty(displayName);
  if (!target) return [];
  return rows
    .map((r) => ({ raw: r.counterparty, score: calculateSimilarity(target, r.counterparty) }))
    .filter((r) => r.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.raw);
}

export async function deleteMerchant(id: number): Promise<void> {
  const db = await getDb();
  // Safe soft delete / suppression for builtin merchants, hard delete for non-builtin
  const m = await getMerchant(id);
  if (!m) return;
  
  if (m.is_builtin === 1) {
    await db.execute("update merchants set is_active = 0 where id = $1", [id]);
    await logOperation(db, "update", "merchants", id, { is_active: 0 }, m);
  } else {
    await db.execute("delete from merchants where id = $1 and is_builtin = 0", [id]);
    await logOperation(db, "delete", "merchants", id, {}, m);
  }
}

export async function listMerchantAliases(merchantId?: number): Promise<MerchantAlias[]> {
  const db = await getDb();
  if (merchantId !== undefined) {
    return db.select<MerchantAlias[]>(
      "select * from merchant_aliases where merchant_id = $1 order by priority asc",
      [merchantId],
    );
  }
  return db.select<MerchantAlias[]>(
    "select * from merchant_aliases order by priority asc",
  );
}

export async function addMerchantAlias(input: {
  merchant_id: number;
  match_type: MerchantAlias["match_type"];
  match_field?: MerchantAlias["match_field"];
  match_value: string;
  priority?: number;
}): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `insert into merchant_aliases (merchant_id, match_type, match_field, match_value, priority)
     values ($1, $2, $3, $4, $5)`,
    [
      input.merchant_id,
      input.match_type,
      input.match_field ?? "counterparty",
      input.match_value.trim().toLowerCase(),
      input.priority ?? 100,
    ],
  );
  const id = res.lastInsertId as number;
  await logOperation(db, "insert", "merchant_aliases", id, { 
    ...input,
    match_field: input.match_field ?? "counterparty",
    match_value: input.match_value.trim().toLowerCase(),
    priority: input.priority ?? 100,
  }, null);
  return id;
}

export async function removeMerchantAlias(aliasId: number): Promise<void> {
  const db = await getDb();
  const oldRows = await db.select<MerchantAlias[]>("select * from merchant_aliases where id = $1", [aliasId]);
  if (!oldRows[0]) return;
  await db.execute("delete from merchant_aliases where id = $1", [aliasId]);
  await logOperation(db, "delete", "merchant_aliases", aliasId, {}, oldRows[0]);
}

export async function listMerchantSuppressions(): Promise<MerchantSuppression[]> {
  const db = await getDb();
  return db.select<MerchantSuppression[]>("select * from merchant_suppressions");
}

export async function suppressMerchant(merchantId: number): Promise<void> {
  const db = await getDb();
  const res = await db.execute(
    "insert or ignore into merchant_suppressions (merchant_id) values ($1)",
    [merchantId],
  );
  if (res.rowsAffected > 0) {
    const id = res.lastInsertId as number;
    await logOperation(db, "insert", "merchant_suppressions", id, { merchant_id: merchantId }, null);
  }
}

export async function unsuppressMerchant(merchantId: number): Promise<void> {
  const db = await getDb();
  const oldRows = await db.select<MerchantSuppression[]>("select * from merchant_suppressions where merchant_id = $1", [merchantId]);
  if (!oldRows[0]) return;
  await db.execute("delete from merchant_suppressions where merchant_id = $1", [merchantId]);
  await logOperation(db, "delete", "merchant_suppressions", oldRows[0].id, {}, oldRows[0]);
}

export async function logCategorization(entry: {
  transaction_id: number;
  matched_by: CategorizationLog["matched_by"];
  rule_id?: number | null;
  merchant_id?: number | null;
  confidence: number;
  alternatives?: CategorizationAlternative[];
}, dbOrNull?: any): Promise<void> {
  const db = dbOrNull ?? (await getDb());
  await db.execute(
    `insert into categorization_log (transaction_id, matched_by, rule_id, merchant_id, confidence, alternatives_json)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      entry.transaction_id,
      entry.matched_by,
      entry.rule_id ?? null,
      entry.merchant_id ?? null,
      entry.confidence,
      entry.alternatives && entry.alternatives.length > 0 ? JSON.stringify(entry.alternatives) : null,
    ],
  );
}

export async function getCategorizationLogForTransaction(
  transactionId: number,
): Promise<CategorizationLog | null> {
  const db = await getDb();
  const rows = await db.select<CategorizationLog[]>(
    "select * from categorization_log where transaction_id = $1 order by id desc limit 1",
    [transactionId],
  );
  return rows[0] ?? null;
}

/**
 * Aktuell unterstützte Formversion von `dist/haendler.json` im Community-Rules-Repo
 * (https://github.com/Klarwert/Klarwert-Community-Rules). Bei einer inkompatiblen künftigen Änderung
 * dieser Form wird der Wert dort erhöht - `parseMerchantDataRelease()` lehnt dann eine unbekannte
 * Version kontrolliert ab, statt eine möglicherweise anders strukturierte Datei blind zu verarbeiten.
 */
export const MERCHANT_RELEASE_SCHEMA_VERSION = 1;

/**
 * Konservative, rein statische ReDoS-Heuristik (bewusst dieselbe Logik wie
 * checkRegexSafety() im Klarwert-Community-Rules-Repo, scripts/validate.mjs - dort verhindert sie,
 * dass ein gefährliches Pattern überhaupt erst gemerged wird; hier ist sie die zweite
 * Verteidigungslinie, falls eine Datei den Validator-Schritt umgeht (manuell editierter Branch,
 * kompromittiertes Repo, o. Ä.). "Die App darf Community-Daten niemals blind vertrauen" gilt
 * unabhängig davon, ob die Datenquelle ihrerseits bereits geprüft haben sollte.
 *
 * Kein Laufzeit-Timeout: JavaScript kann eine einmal gestartete `RegExp.test()`-Ausführung nicht von
 * außen unterbrechen (kein Preemption) - ein Timeout um den Aufruf herum wäre nur scheinbar sicher.
 * Diese Heuristik ist deshalb bewusst konservativ (lehnt im Zweifel ab), kein formaler Beweis.
 */
function isRegexPatternSafe(pattern: string): boolean {
  if (pattern.length > 200) return false;
  if (/\([^()]*[+*][^()]*\)[+*]/.test(pattern)) return false; // verschachtelte Quantifizierer, z. B. (a+)+
  const largeRepeat = /\{(\d+)(,(\d+)?)?\}/g;
  let m: RegExpExecArray | null;
  while ((m = largeRepeat.exec(pattern))) {
    const min = Number(m[1]);
    const max = m[3] !== undefined ? Number(m[3]) : min;
    if (min > 50 || max > 200) return false;
  }
  const quantifierCount = (pattern.match(/[+*]|\{\d+(,\d*)?\}/g) ?? []).length;
  if (quantifierCount > 10) return false;
  try {
    new RegExp(pattern, "i");
  } catch {
    return false;
  }
  return true;
}

// Nur die drei rein namensbasierten Alias-Typen sind aus einer Community-Quelle zulässig.
// 'iban'/'account_identifier' identifizieren ein konkretes Bankkonto - das hat in einer öffentlich
// geteilten, für alle Nutzer identischen Datei nichts zu suchen (im Unterschied zu lokal vom Nutzer
// selbst angelegten Aliasen, wo das weiterhin erlaubt bleibt).
const MerchantAliasReleaseSchema = z
  .object({
    type: z.enum(["name_exact", "name_fuzzy", "regex"]),
    field: z.enum(["counterparty", "purpose", "any"]).optional(),
    value: z.string().min(1).max(200),
  })
  .refine((a) => a.type !== "regex" || isRegexPatternSafe(a.value), {
    message: "Regex-Alias abgelehnt: sieht nach einem potenziell gefährlichen (ReDoS-anfälligen) Muster aus.",
  });

const MerchantReleaseEntrySchema = z.object({
  canonical_name: z.string().min(1).max(64),
  display_name: z.string().min(1).max(80),
  default_category_template_key: z.string().max(100).nullable(),
  status: z.enum(["active", "deprecated"]).default("active"),
  aliases: z.array(MerchantAliasReleaseSchema).max(30),
});

export const MerchantDataReleaseSchema = z.object({
  schema_version: z.number().int(),
  source_version: z.string().min(1).max(100),
  merchants: z.array(MerchantReleaseEntrySchema),
});

export type MerchantDataReleaseMerchant = z.infer<typeof MerchantReleaseEntrySchema>;
export type MerchantDataRelease = z.infer<typeof MerchantDataReleaseSchema>;

/**
 * Einziger Einstiegspunkt, über den eine heruntergeladene/importierte Community-Datei ins
 * typisierte `MerchantDataRelease`-Format überführt wird - TypeScript-Typen allein sichern nur die
 * Kompilierzeit ab, nicht die tatsächliche Form der Netzwerk-/Dateiantwort zur Laufzeit. Wirft eine
 * verständliche Fehlermeldung statt eines rohen Zod-Fehlers; UI-Code fängt diese bereits ab
 * (siehe MerchantUpdateCheckDialog.tsx, ShareSuggestionsDialog.tsx).
 */
export function parseMerchantDataRelease(raw: unknown): MerchantDataRelease {
  const parsed = MerchantDataReleaseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Die Händler-Datenbank-Datei hat ein ungültiges Format (${parsed.error.issues[0]?.message ?? "unbekannter Fehler"}).`,
    );
  }
  if (parsed.data.schema_version !== MERCHANT_RELEASE_SCHEMA_VERSION) {
    throw new Error(
      `Diese Datei nutzt Schema-Version ${parsed.data.schema_version}, diese App-Version unterstützt nur ` +
        `Version ${MERCHANT_RELEASE_SCHEMA_VERSION}. Bitte Klarwert aktualisieren.`,
    );
  }
  return parsed.data;
}

/**
 * Übernimmt eine kuratierte Daten-Datei aus dem Community-Rules-Repo (schema_version bereits über
 * parseMerchantDataRelease() geprüft). Kategorie-Referenz läuft über den stabilen `template_key`,
 * nicht über eine lokale ID. Legt neue Händler an, aktualisiert bestehende kuratierte Händler (Aliase
 * werden ersetzt) und deaktiviert lokal, was die Community als `status: "deprecated"` zurückzieht -
 * jeweils nur, solange der Nutzer den Eintrag nicht selbst angepasst hat (`is_modified`). Läuft
 * vollständig in einer Transaktion: entweder wird die gesamte Datei übernommen, oder gar nichts.
 */
export async function applyMerchantDataRelease(release: MerchantDataRelease): Promise<void> {
  await runInTransaction(async (db) => {
    for (const m of release.merchants) {
      let categoryId: number | null = null;
      if (m.default_category_template_key) {
        const catRows = await db.select<{ id: number }[]>(
          "select id from categories where template_key = $1",
          [m.default_category_template_key],
        );
        categoryId = catRows[0]?.id ?? null;
      }

      const existing = await db.select<{ id: number; is_modified: number; is_active: number }[]>(
        "select id, is_modified, is_active from merchants where canonical_name = $1",
        [m.canonical_name],
      );

      if (existing.length > 0) {
        const merchantId = existing[0].id;
        // Lokale Anpassung ("Angepasst", is_modified=1) nie stillschweigend überschreiben – nur den
        // Referenzstand (source_version) mitziehen, Inhalt/Aliase bleiben unangetastet (Konzept
        // Abschnitt 3: "übernehmen, ignorieren, oder beides vergleichen" bleibt eine bewusste
        // Nutzerentscheidung, kein Auto-Overwrite). Das gilt auch für eine Zurückziehung
        // (status: "deprecated") - eine eigene Anpassung ist immer stärker als ein Community-Rückzug.
        if (existing[0].is_modified === 1) {
          await db.execute("update merchants set source_version = $1 where id = $2", [release.source_version, merchantId]);
          continue;
        }

        if (m.status === "deprecated") {
          // Rückzug: nie hart löschen (Undo/Nachvollziehbarkeit), sondern lokal deaktivieren - wie
          // das manuelle "Löschen" eines kuratierten Händlers (deleteMerchant()) es bereits tut.
          if (existing[0].is_active === 1) {
            await db.execute("update merchants set is_active = 0, source_version = $1 where id = $2", [release.source_version, merchantId]);
          }
          continue;
        }

        await db.execute(
          "update merchants set display_name = $1, default_category_id = $2, source_version = $3, is_builtin = 1, source = 'community', is_active = 1 where id = $4",
          [m.display_name, categoryId, release.source_version, merchantId],
        );
        await db.execute("delete from merchant_aliases where merchant_id = $1", [merchantId]);
        await writeMerchantAliases(db, merchantId, m.aliases);
        continue;
      }

      if (m.status === "deprecated") continue; // nie zurückgezogene Einträge neu anlegen

      const res = await db.execute(
        `insert into merchants (canonical_name, display_name, default_category_id, source_version, is_builtin, is_active, source)
         values ($1, $2, $3, $4, 1, 1, 'community')`,
        [m.canonical_name, m.display_name, categoryId, release.source_version],
      );
      await writeMerchantAliases(db, res.lastInsertId as number, m.aliases);
    }
  });
}

async function writeMerchantAliases(
  db: Awaited<ReturnType<typeof getDb>>,
  merchantId: number,
  aliases: MerchantDataReleaseMerchant["aliases"],
): Promise<void> {
  for (const [i, alias] of aliases.entries()) {
    await db.execute(
      "insert into merchant_aliases (merchant_id, match_type, match_field, match_value, priority) values ($1, $2, $3, $4, $5)",
      [merchantId, alias.type, alias.field ?? "counterparty", alias.value.trim().toLowerCase(), (i + 1) * 10],
    );
  }
}

/** Seed default curated merchants */
export async function seedDefaultMerchants(): Promise<void> {
  const db = await getDb();

  const defaultMerchants: {
    canonical: string;
    display: string;
    categoryName: string | null;
    aliases: { type: string; field?: "counterparty" | "purpose" | "any"; value: string; priority: number }[];
  }[] = [
    {
      canonical: "rewe",
      display: "REWE",
      categoryName: "Lebensmittel und Getränke",
      aliases: [
        { type: "name_exact", value: "rewe", priority: 10 },
        { type: "name_fuzzy", value: "rewe markt", priority: 20 },
        { type: "name_fuzzy", value: "rewe online", priority: 20 },
      ],
    },
    {
      canonical: "edeka",
      display: "EDEKA",
      categoryName: "Lebensmittel und Getränke",
      aliases: [
        { type: "name_exact", value: "edeka", priority: 10 },
        { type: "name_fuzzy", value: "edeka markt", priority: 20 },
      ],
    },
    {
      canonical: "aldi",
      display: "ALDI",
      categoryName: "Lebensmittel und Getränke",
      aliases: [
        { type: "name_exact", value: "aldi", priority: 10 },
        { type: "name_fuzzy", value: "aldi sued", priority: 20 },
        { type: "name_fuzzy", value: "aldi nord", priority: 20 },
      ],
    },
    {
      canonical: "lidl",
      display: "Lidl",
      categoryName: "Lebensmittel und Getränke",
      aliases: [
        { type: "name_exact", value: "lidl", priority: 10 },
        { type: "name_fuzzy", value: "lidl vertriebs", priority: 20 },
      ],
    },
    {
      canonical: "dm",
      display: "dm-drogerie markt",
      categoryName: "Drogerie",
      aliases: [
        { type: "name_exact", value: "dm drogerie", priority: 10 },
        { type: "name_exact", value: "dm-drogerie markt", priority: 10 },
        { type: "name_fuzzy", value: "dm drogeriemarkt", priority: 20 },
      ],
    },
    {
      canonical: "rossmann",
      display: "Rossmann",
      categoryName: "Drogerie",
      aliases: [
        { type: "name_exact", value: "rossmann", priority: 10 },
        { type: "name_fuzzy", value: "dirk rossmann", priority: 20 },
      ],
    },
    {
      canonical: "amazon",
      display: "Amazon",
      categoryName: "Shopping und Unterhaltung",
      aliases: [
        { type: "name_exact", value: "amazon", priority: 10 },
        { type: "name_fuzzy", value: "amazon.de", priority: 20 },
        { type: "name_fuzzy", value: "amazon eu", priority: 20 },
      ],
    },
    {
      canonical: "netflix",
      display: "Netflix",
      categoryName: "TV / Video / Musik",
      aliases: [
        { type: "name_exact", value: "netflix", priority: 10 },
        { type: "name_fuzzy", value: "netflix international", priority: 20 },
        { type: "regex", field: "purpose", value: "(?:einkauf bei|bestellung bei|shop:|verkaeufer:|händler:)\\s*netflix", priority: 30 },
      ],
    },
    {
      canonical: "spotify",
      display: "Spotify",
      categoryName: "TV / Video / Musik",
      aliases: [
        { type: "name_exact", value: "spotify", priority: 10 },
        { type: "name_fuzzy", value: "spotify ab", priority: 20 },
        { type: "regex", field: "purpose", value: "(?:einkauf bei|bestellung bei|shop:|verkaeufer:|händler:)\\s*spotify", priority: 30 },
      ],
    },
    {
      canonical: "deutsche_bahn",
      display: "Deutsche Bahn",
      categoryName: "Taxi / ÖPNV / Car- und Bikesharing",
      aliases: [
        { type: "name_exact", value: "db vertrieb", priority: 10 },
        { type: "name_exact", value: "deutsche bahn", priority: 10 },
        { type: "name_fuzzy", value: "db bahn", priority: 20 },
      ],
    },
    {
      canonical: "shell",
      display: "Shell",
      categoryName: "Tanken",
      aliases: [
        { type: "name_exact", value: "shell", priority: 10 },
        { type: "name_fuzzy", value: "shell tankstelle", priority: 20 },
      ],
    },
    {
      canonical: "aral",
      display: "Aral",
      categoryName: "Tanken",
      aliases: [
        { type: "name_exact", value: "aral", priority: 10 },
        { type: "name_fuzzy", value: "aral tankstelle", priority: 20 },
      ],
    },
    {
      canonical: "telekom",
      display: "Telekom",
      categoryName: "Handy",
      aliases: [
        { type: "name_exact", value: "telekom", priority: 10 },
        { type: "name_fuzzy", value: "telekom deutschland", priority: 20 },
        { type: "name_fuzzy", value: "deutsche telekom", priority: 20 },
      ],
    },
    {
      canonical: "vodafone",
      display: "Vodafone",
      categoryName: "Handy",
      aliases: [
        { type: "name_exact", value: "vodafone", priority: 10 },
        { type: "name_fuzzy", value: "vodafone gmbh", priority: 20 },
      ],
    },
    // Zahlungsdienstleister bewusst OHNE Standardkategorie: der eigentliche Händler steckt im
    // Verwendungszweck, eine blinde Kategorie wäre oft falsch. Erzeugt "unsicher" + Vorschlag statt
    // stiller Falschzuordnung (seed-data.md Abschnitt 5b).
    {
      canonical: "paypal",
      display: "PayPal",
      categoryName: null,
      aliases: [
        { type: "name_exact", value: "paypal", priority: 10 },
        { type: "name_fuzzy", value: "paypal europe", priority: 20 },
      ],
    },
    {
      canonical: "klarna",
      display: "Klarna",
      categoryName: null,
      aliases: [
        { type: "name_exact", value: "klarna", priority: 10 },
        { type: "name_fuzzy", value: "klarna bank", priority: 20 },
      ],
    },
  ];

  for (const item of defaultMerchants) {
    const existing = await db.select<{ id: number }[]>(
      "select id from merchants where canonical_name = $1",
      [item.canonical],
    );

    let catId: number | null = null;
    const catRows = await db.select<{ id: number }[]>(
      "select id from categories where name = $1 and is_deleted = 0 limit 1",
      [item.categoryName],
    );
    if (catRows.length > 0) catId = catRows[0].id;

    let merchantId: number;
    if (existing.length === 0) {
      const res = await db.execute(
        `insert into merchants (canonical_name, display_name, default_category_id, source_version, is_builtin, is_active)
         values ($1, $2, $3, '2026-07', 1, 1)`,
        [item.canonical, item.display, catId],
      );
      merchantId = res.lastInsertId as number;
    } else {
      merchantId = existing[0].id;
    }

    for (const alias of item.aliases) {
      await db.execute(
        `insert or ignore into merchant_aliases (merchant_id, match_type, match_field, match_value, priority)
         select $1, $2, $3, $4, $5
         where not exists (
           select 1 from merchant_aliases where merchant_id = $1 and match_value = $4 and match_field = $3
         )`,
        [merchantId, alias.type, alias.field ?? "counterparty", alias.value, alias.priority],
      );
    }
  }
}

/**
 * Prüft, ob ein neuer Alias-Wert bereits einem anderen Händler zugeordnet ist.
 * Gibt alle konfliktierenden Händler (name + alias) zurück.
 */
export async function checkAliasCollisions(
  matchValue: string,
  matchField: "counterparty" | "purpose" | "any",
  excludeMerchantId?: number,
): Promise<{ merchantId: number; merchantName: string; aliasValue: string; aliasField: string }[]> {
  const db = await getDb();
  const normalized = matchValue.trim().toLowerCase();
  if (!normalized) return [];
  const rows = await db.select<{ merchant_id: number; display_name: string; match_value: string; match_field: string }[]>(
    `select m.id as merchant_id, m.display_name, ma.match_value, ma.match_field
     from merchant_aliases ma
     join merchants m on m.id = ma.merchant_id
     where lower(trim(ma.match_value)) = $1
       and (ma.match_field = $2 or $2 = 'any' or ma.match_field = 'any')
       and m.is_active = 1
       and ($3 = 0 or m.id != $3)`,
    [normalized, matchField, excludeMerchantId ?? 0],
  );
  return rows.map((r) => ({
    merchantId: r.merchant_id,
    merchantName: r.display_name,
    aliasValue: r.match_value,
    aliasField: r.match_field,
  }));
}

/** Vorschau: welche eigenen Buchungen wuerde ein neuer Alias treffen (live, vor dem Speichern). */
export async function previewAliasMatches(
  matchValue: string,
  matchField: "counterparty" | "purpose" | "any",
  matchType: "name_exact" | "name_fuzzy" | "regex",
): Promise<{ count: number; sample: { booking_date: string; counterparty: string; purpose: string | null; amount_cents: number }[] }> {
  const db = await getDb();
  const val = matchValue.trim().toLowerCase();
  if (!val) return { count: 0, sample: [] };

  let whereClause = "";
  if (matchType === "name_exact") {
    const fieldClauses: string[] = [];
    if (matchField === "counterparty" || matchField === "any") fieldClauses.push(`lower(counterparty) = '${val.replace(/'/g, "''")}'`);
    if (matchField === "purpose" || matchField === "any") fieldClauses.push(`lower(coalesce(purpose,'')) = '${val.replace(/'/g, "''")}'`);
    whereClause = fieldClauses.join(" or ");
  } else if (matchType === "name_fuzzy") {
    const fieldClauses: string[] = [];
    if (matchField === "counterparty" || matchField === "any") fieldClauses.push(`lower(counterparty) like '%${val.replace(/'/g, "''")}%'`);
    if (matchField === "purpose" || matchField === "any") fieldClauses.push(`lower(coalesce(purpose,'')) like '%${val.replace(/'/g, "''")}%'`);
    whereClause = fieldClauses.join(" or ");
  } else {
    // regex: we fall back to a LIKE for the preview (SQLite has no REGEXP by default in Tauri)
    const fieldClauses: string[] = [];
    if (matchField === "counterparty" || matchField === "any") fieldClauses.push(`lower(counterparty) like '%${val.replace(/'/g, "''")}%'`);
    if (matchField === "purpose" || matchField === "any") fieldClauses.push(`lower(coalesce(purpose,'')) like '%${val.replace(/'/g, "''")}%'`);
    whereClause = fieldClauses.join(" or ");
  }

  if (!whereClause) return { count: 0, sample: [] };

  const countRows = await db.select<{ n: number }[]>(
    `select count(*) as n from transactions where is_deleted = 0 and (${whereClause})`,
  );
  const sampleRows = await db.select<{ booking_date: string; counterparty: string; purpose: string | null; amount_cents: number }[]>(
    `select booking_date, counterparty, purpose, amount_cents from transactions where is_deleted = 0 and (${whereClause}) order by booking_date desc limit 25`,
  );
  return { count: countRows[0]?.n ?? 0, sample: sampleRows };
}
