import { getDb } from "@/db/client";
import type { Merchant, MerchantAlias, MerchantSuppression, CategorizationLog, CategorizationAlternative } from "@/db/types";

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

export async function createMerchant(input: {
  canonical_name: string;
  display_name: string;
  default_category_id?: number | null;
  source_version?: string | null;
  is_builtin?: number;
}): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `insert into merchants (canonical_name, display_name, default_category_id, source_version, is_builtin, is_active)
     values ($1, $2, $3, $4, $5, 1)`,
    [
      input.canonical_name.trim().toLowerCase(),
      input.display_name.trim(),
      input.default_category_id ?? null,
      input.source_version ?? null,
      input.is_builtin ?? 0,
    ],
  );
  return res.lastInsertId as number;
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
  args.push(id);
  await db.execute(`update merchants set ${sets.join(", ")} where id = $${i}`, args);
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
  if (m?.is_builtin === 1) {
    await db.execute("update merchants set is_active = 0 where id = $1", [id]);
  } else {
    await db.execute("delete from merchants where id = $1 and is_builtin = 0", [id]);
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
  match_value: string;
  priority?: number;
}): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `insert into merchant_aliases (merchant_id, match_type, match_value, priority)
     values ($1, $2, $3, $4)`,
    [
      input.merchant_id,
      input.match_type,
      input.match_value.trim().toLowerCase(),
      input.priority ?? 100,
    ],
  );
  return res.lastInsertId as number;
}

export async function removeMerchantAlias(aliasId: number): Promise<void> {
  const db = await getDb();
  await db.execute("delete from merchant_aliases where id = $1", [aliasId]);
}

export async function listMerchantSuppressions(): Promise<MerchantSuppression[]> {
  const db = await getDb();
  return db.select<MerchantSuppression[]>("select * from merchant_suppressions");
}

export async function suppressMerchant(merchantId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "insert or ignore into merchant_suppressions (merchant_id) values ($1)",
    [merchantId],
  );
}

export async function unsuppressMerchant(merchantId: number): Promise<void> {
  const db = await getDb();
  await db.execute("delete from merchant_suppressions where merchant_id = $1", [merchantId]);
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

export interface MerchantDataReleaseMerchant {
  canonical_name: string;
  display_name: string;
  default_category_template_key: string | null;
  aliases: { type: MerchantAlias["match_type"]; value: string }[];
}

export interface MerchantDataRelease {
  source_version: string;
  merchants: MerchantDataReleaseMerchant[];
}

/**
 * Übernimmt eine kuratierte Daten-Datei aus dem Community-Repo (siehe klarwert-community-haendler-db.md,
 * Abschnitt 4). Kategorie-Referenz läuft über den stabilen `template_key`, nicht über eine lokale ID.
 * Legt neue Händler an bzw. aktualisiert bestehende kuratierte Händler (Aliase werden ersetzt).
 */
export async function applyMerchantDataRelease(release: MerchantDataRelease): Promise<void> {
  const db = await getDb();
  for (const m of release.merchants) {
    let categoryId: number | null = null;
    if (m.default_category_template_key) {
      const catRows = await db.select<{ id: number }[]>(
        "select id from categories where template_key = $1",
        [m.default_category_template_key],
      );
      categoryId = catRows[0]?.id ?? null;
    }

    const existing = await db.select<{ id: number; is_modified: number }[]>(
      "select id, is_modified from merchants where canonical_name = $1",
      [m.canonical_name],
    );

    let merchantId: number;
    if (existing.length > 0) {
      merchantId = existing[0].id;
      // Lokale Anpassung ("Angepasst", is_modified=1) nie stillschweigend überschreiben – nur den
      // Referenzstand (source_version) mitziehen, Inhalt/Aliase bleiben unangetastet (Konzept
      // Abschnitt 3: "übernehmen, ignorieren, oder beides vergleichen" bleibt eine bewusste
      // Nutzerentscheidung, kein Auto-Overwrite).
      if (existing[0].is_modified === 1) {
        await db.execute("update merchants set source_version = $1 where id = $2", [release.source_version, merchantId]);
        continue;
      }
      await db.execute(
        "update merchants set display_name = $1, default_category_id = $2, source_version = $3, is_builtin = 1 where id = $4",
        [m.display_name, categoryId, release.source_version, merchantId],
      );
      await db.execute("delete from merchant_aliases where merchant_id = $1", [merchantId]);
    } else {
      const res = await db.execute(
        `insert into merchants (canonical_name, display_name, default_category_id, source_version, is_builtin, is_active)
         values ($1, $2, $3, $4, 1, 1)`,
        [m.canonical_name, m.display_name, categoryId, release.source_version],
      );
      merchantId = res.lastInsertId as number;
    }

    for (const [i, alias] of m.aliases.entries()) {
      await db.execute(
        "insert into merchant_aliases (merchant_id, match_type, match_value, priority) values ($1, $2, $3, $4)",
        [merchantId, alias.type, alias.value.trim().toLowerCase(), (i + 1) * 10],
      );
    }
  }
}

/** Seed default curated merchants */
export async function seedDefaultMerchants(): Promise<void> {
  const db = await getDb();

  const defaultMerchants: {
    canonical: string;
    display: string;
    categoryName: string | null;
    aliases: { type: string; value: string; priority: number }[];
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
      ],
    },
    {
      canonical: "spotify",
      display: "Spotify",
      categoryName: "TV / Video / Musik",
      aliases: [
        { type: "name_exact", value: "spotify", priority: 10 },
        { type: "name_fuzzy", value: "spotify ab", priority: 20 },
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
        `insert or ignore into merchant_aliases (merchant_id, match_type, match_value, priority)
         select $1, $2, $3, $4
         where not exists (
           select 1 from merchant_aliases where merchant_id = $1 and match_value = $3
         )`,
        [merchantId, alias.type, alias.value, alias.priority],
      );
    }
  }
}
