import { getDb } from "@/db/client";
import type { Category } from "@/db/types";

export async function listCategories(includeHidden = true): Promise<Category[]> {
  const db = await getDb();
  const where = includeHidden
    ? "where is_deleted = 0"
    : "where is_deleted = 0 and is_hidden = 0";
  const categories = await db.select<Category[]>(
    `select * from categories ${where} order by sort_order asc, name asc`,
  );
  
  const aliases = await db.select<{ category_id: number; alias: string }[]>(
    "select category_id, alias from category_aliases",
  );
  const aliasesByCategoryId = new Map<number, string[]>();
  for (const { category_id, alias } of aliases) {
    if (!aliasesByCategoryId.has(category_id)) {
      aliasesByCategoryId.set(category_id, []);
    }
    aliasesByCategoryId.get(category_id)!.push(alias);
  }
  
  return categories.map((c) => ({
    ...c,
    aliases: aliasesByCategoryId.get(c.id) ?? [],
  }));
}

export async function listTopLevelCategories(): Promise<Category[]> {
  const db = await getDb();
  const categories = await db.select<Category[]>(
    "select * from categories where is_deleted = 0 and parent_id is null order by sort_order asc, name asc",
  );
  return categories.map((c) => ({ ...c, aliases: [] })); // Aliases mostly for children, but returning empty array is fine for top level if we don't query it.
}

export async function getCategory(id: number): Promise<Category | null> {
  const db = await getDb();
  const rows = await db.select<Category[]>(
    "select * from categories where id = $1 and is_deleted = 0",
    [id],
  );
  const cat = rows[0];
  if (!cat) return null;
  
  const aliases = await db.select<{ alias: string }[]>(
    "select alias from category_aliases where category_id = $1",
    [id],
  );
  cat.aliases = aliases.map((a) => a.alias);
  
  return cat;
}

export async function getUnkategorisiertId(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ id: number }[]>(
    "select id from categories where is_system = 1 limit 1",
  );
  if (!rows[0]) throw new Error("System-Kategorie 'Unkategorisiert' fehlt");
  return rows[0].id;
}

export async function createCategory(input: {
  name: string;
  color: string;
  icon?: string | null;
  parent_id?: number | null;
}): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `insert into categories (name, color, icon, parent_id, is_template, sort_order)
     values ($1, $2, $3, $4, 0, 999)`,
    [input.name, input.color, input.icon ?? null, input.parent_id ?? null],
  );
  return result.lastInsertId as number;
}

export async function updateCategory(
  id: number,
  input: Partial<Pick<Category, "name" | "color" | "icon" | "parent_id" | "is_hidden">>,
): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [key, value] of Object.entries(input)) {
    fields.push(`${key} = $${i}`);
    values.push(value);
    i += 1;
  }
  if (fields.length === 0) return;
  values.push(id);
  await db.execute(`update categories set ${fields.join(", ")} where id = $${i}`, values);
}

export async function countCategoryUsage(id: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>(
    "select count(*) as count from transactions where category_id = $1 and is_deleted = 0",
    [id],
  );
  return rows[0]?.count ?? 0;
}

/** Nur eigene Kategorien (is_template = 0) mit 0 Nutzungen löschbar. */
export async function deleteCategory(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("update categories set is_deleted = 1 where id = $1 and is_template = 0", [id]);
}

/** Jahres-Summe je Kategorie (respektiert Globalfilter Konto/Person). */
export async function getCategoryYearSums(
  year: number,
  assetId?: number | null,
  personId?: number | null,
): Promise<Map<number, number>> {
  const db = await getDb();
  const clauses = ["t.is_deleted = 0", "t.category_id is not null", "substr(t.booking_date, 1, 4) = $1"];
  const params: unknown[] = [String(year)];
  let i = 2;
  if (assetId) {
    clauses.push(`t.asset_id = $${i}`);
    params.push(assetId);
    i += 1;
  }
  if (personId) {
    clauses.push(`t.asset_id in (select asset_id from asset_owners where person_id = $${i})`);
    params.push(personId);
    i += 1;
  }
  const rows = await db.select<{ category_id: number; total: number }[]>(
    `select category_id, sum(amount_cents) as total from transactions t where ${clauses.join(" and ")} group by category_id`,
    params,
  );
  return new Map(rows.map((r) => [r.category_id, r.total]));
}

export async function setCategoryHidden(id: number, hidden: boolean): Promise<void> {
  const db = await getDb();
  await db.execute("update categories set is_hidden = $1 where id = $2 and is_system = 0", [
    hidden ? 1 : 0,
    id,
  ]);
}

export async function getCategoryAliases(categoryId: number): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ alias: string }[]>(
    "select alias from category_aliases where category_id = $1 order by id asc",
    [categoryId],
  );
  return rows.map((r) => r.alias);
}

export async function addCategoryAlias(categoryId: number, alias: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "insert or ignore into category_aliases (category_id, alias) values ($1, $2)",
    [categoryId, alias.trim()],
  );
}

export async function removeCategoryAlias(categoryId: number, alias: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "delete from category_aliases where category_id = $1 and alias = $2",
    [categoryId, alias],
  );
}

interface TemplateCategoryDef {
  key: string;
  name: string;
  color: string;
  icon?: string;
  parentKey?: string;
  sortOrder: number;
  isSystem?: boolean;
}

/**
 * Stabile Template-Kategorien-Liste. `key` ist der dauerhafte `template_key` (Slug) –
 * darüber (nicht über `name`) wird bei jedem App-Start geprüft, ob eine Kategorie schon
 * existiert. Nie umbenennen/entfernen, sonst verlieren bestehende Installationen die Zuordnung.
 */
const TEMPLATE_CATEGORIES: TemplateCategoryDef[] = [
  // Top-level
  { key: "wohnen", name: "Wohnen", color: "#2f6b63", icon: "home", sortOrder: 1 },
  { key: "kinder", name: "Kinder", color: "#c9a44f", icon: "baby", sortOrder: 2 },
  { key: "lebenshaltung", name: "Lebenshaltung", color: "#7aa662", icon: "shopping-basket", sortOrder: 3 },
  { key: "gesundheit_wellness", name: "Gesundheit und Wellness", color: "#4e8d7c", icon: "heart-pulse", sortOrder: 4 },
  { key: "einnahmen", name: "Einnahmen", color: "#3f7d4e", icon: "banknote", sortOrder: 5 },
  { key: "versicherung", name: "Versicherung", color: "#5f7a9e", icon: "shield", sortOrder: 6 },
  { key: "freizeit_hobbies_soziales", name: "Freizeit, Hobbies und Soziales", color: "#c07a4a", icon: "ticket", sortOrder: 7 },
  { key: "mobilitaet", name: "Mobilität", color: "#4a6fa5", icon: "car", sortOrder: 8 },
  { key: "sparen_anlegen", name: "Sparen und Anlegen", color: "#2e6e5e", icon: "piggy-bank", sortOrder: 9 },
  { key: "shopping_unterhaltung", name: "Shopping und Unterhaltung", color: "#8a5fa0", icon: "shopping-bag", sortOrder: 10 },
  { key: "reisen", name: "Reisen", color: "#3e8fa3", icon: "plane", sortOrder: 11 },
  { key: "bank_kredit", name: "Bank und Kredit", color: "#55606a", icon: "landmark", sortOrder: 12 },
  { key: "unkategorisiert", name: "Unkategorisiert", color: "#9aa4a8", icon: "circle-help", sortOrder: 13, isSystem: true },

  // Wohnen
  { key: "wohnen.wohnnebenkosten", name: "Wohnnebenkosten", color: "#2f6b63", parentKey: "wohnen", sortOrder: 1 },
  { key: "wohnen.heimwerken_garten", name: "Heimwerken und Garten", color: "#2f6b63", parentKey: "wohnen", sortOrder: 2 },
  { key: "wohnen.strom", name: "Strom", color: "#2f6b63", parentKey: "wohnen", sortOrder: 3 },
  { key: "wohnen.gas", name: "Gas", color: "#2f6b63", parentKey: "wohnen", sortOrder: 4 },
  { key: "wohnen.moebel_haushaltsgeraete", name: "Möbel und Haushaltsgeräte", color: "#2f6b63", parentKey: "wohnen", sortOrder: 5 },
  { key: "wohnen.haushaltsdienstleistungen", name: "Haushaltsdienstleistungen", color: "#2f6b63", parentKey: "wohnen", sortOrder: 6 },
  { key: "wohnen.immobilienkredit", name: "Immobilienkredit", color: "#2f6b63", parentKey: "wohnen", sortOrder: 7 },
  { key: "wohnen.miete_wohngeld", name: "Miete / Wohngeld", color: "#2f6b63", parentKey: "wohnen", sortOrder: 8 },

  // Kinder
  { key: "kinder.kinderbetreuung_gruppen", name: "Kinderbetreuung und -gruppen", color: "#c9a44f", parentKey: "kinder", sortOrder: 1 },
  { key: "kinder.taschengeld_unterhalt", name: "Taschengeld / Unterhalt", color: "#c9a44f", parentKey: "kinder", sortOrder: 2 },
  { key: "kinder.spielwaren", name: "Spielwaren", color: "#c9a44f", parentKey: "kinder", sortOrder: 3 },

  // Lebenshaltung
  { key: "lebenshaltung.drogerie", name: "Drogerie", color: "#7aa662", parentKey: "lebenshaltung", sortOrder: 1 },
  { key: "lebenshaltung.lebensmittel_getraenke", name: "Lebensmittel und Getränke", color: "#7aa662", parentKey: "lebenshaltung", sortOrder: 2 },
  { key: "lebenshaltung.haushaltsbedarf", name: "Haushaltsbedarf", color: "#7aa662", parentKey: "lebenshaltung", sortOrder: 3 },
  { key: "lebenshaltung.festnetz_internet", name: "Festnetz und Internet", color: "#7aa662", parentKey: "lebenshaltung", sortOrder: 4 },
  { key: "lebenshaltung.handy", name: "Handy", color: "#7aa662", parentKey: "lebenshaltung", sortOrder: 5 },
  { key: "lebenshaltung.haustier_bedarf", name: "Haustier (-bedarf)", color: "#7aa662", parentKey: "lebenshaltung", sortOrder: 6 },

  // Gesundheit und Wellness
  { key: "gesundheit_wellness.arztbesuch_krankenhaus", name: "Arztbesuch / Krankenhaus", color: "#4e8d7c", parentKey: "gesundheit_wellness", sortOrder: 1 },
  { key: "gesundheit_wellness.arznei_heilmittel", name: "Arznei- und Heilmittel", color: "#4e8d7c", parentKey: "gesundheit_wellness", sortOrder: 2 },
  { key: "gesundheit_wellness.wellness_beauty", name: "Wellness und Beauty", color: "#4e8d7c", parentKey: "gesundheit_wellness", sortOrder: 3 },

  // Einnahmen
  { key: "einnahmen.staatliche_leistung_foerderung", name: "Staatliche Leistung und Förderung", color: "#3f7d4e", parentKey: "einnahmen", sortOrder: 1 },
  { key: "einnahmen.unterhalt", name: "Unterhalt", color: "#3f7d4e", parentKey: "einnahmen", sortOrder: 2 },
  { key: "einnahmen.kapitaleinkommen", name: "Kapitaleinkommen", color: "#3f7d4e", parentKey: "einnahmen", sortOrder: 3 },
  { key: "einnahmen.bareinzahlung", name: "Bareinzahlung", color: "#3f7d4e", parentKey: "einnahmen", sortOrder: 4 },
  { key: "einnahmen.mieteinnahmen", name: "Mieteinnahmen", color: "#3f7d4e", parentKey: "einnahmen", sortOrder: 5 },
  { key: "einnahmen.rente_pension", name: "Rente und Pension", color: "#3f7d4e", parentKey: "einnahmen", sortOrder: 6 },
  { key: "einnahmen.gehalt", name: "Gehalt", color: "#3f7d4e", parentKey: "einnahmen", sortOrder: 7 },

  // Versicherung
  { key: "versicherung.unfallversicherung", name: "Unfallversicherung", color: "#5f7a9e", parentKey: "versicherung", sortOrder: 1 },
  { key: "versicherung.krankenversicherung", name: "Krankenversicherung", color: "#5f7a9e", parentKey: "versicherung", sortOrder: 2 },
  { key: "versicherung.wohngebaeudeversicherung", name: "Wohngebäudeversicherung", color: "#5f7a9e", parentKey: "versicherung", sortOrder: 3 },
  { key: "versicherung.hausratversicherung", name: "Hausratversicherung", color: "#5f7a9e", parentKey: "versicherung", sortOrder: 4 },
  { key: "versicherung.rechtsschutzversicherung", name: "Rechtsschutzversicherung", color: "#5f7a9e", parentKey: "versicherung", sortOrder: 5 },
  { key: "versicherung.haftpflichtversicherung", name: "Haftpflichtversicherung", color: "#5f7a9e", parentKey: "versicherung", sortOrder: 6 },
  { key: "versicherung.pflegeversicherung", name: "Pflegeversicherung", color: "#5f7a9e", parentKey: "versicherung", sortOrder: 7 },
  { key: "versicherung.berufsunfaehigkeitsversicherung", name: "Berufsunfähigkeitsversicherung", color: "#5f7a9e", parentKey: "versicherung", sortOrder: 8 },
  { key: "versicherung.tierversicherung", name: "Tierversicherung", color: "#5f7a9e", parentKey: "versicherung", sortOrder: 9 },
  { key: "versicherung.kranken_zusatzversicherung", name: "Kranken-Zusatzversicherung", color: "#5f7a9e", parentKey: "versicherung", sortOrder: 10 },
  { key: "versicherung.risiko_lebensversicherung", name: "Risiko-Lebensversicherung", color: "#5f7a9e", parentKey: "versicherung", sortOrder: 11 },
  { key: "versicherung.reiseversicherung", name: "Reiseversicherung", color: "#5f7a9e", parentKey: "versicherung", sortOrder: 12 },

  // Freizeit, Hobbies und Soziales
  { key: "freizeit_hobbies_soziales.kirche_spende", name: "Kirche / Spende", color: "#c07a4a", parentKey: "freizeit_hobbies_soziales", sortOrder: 1 },
  { key: "freizeit_hobbies_soziales.freizeitaktivitaeten", name: "Freizeitaktivitäten", color: "#c07a4a", parentKey: "freizeit_hobbies_soziales", sortOrder: 2 },
  { key: "freizeit_hobbies_soziales.restaurant_cafe_bar", name: "Restaurant / Cafe / Bar", color: "#c07a4a", parentKey: "freizeit_hobbies_soziales", sortOrder: 3 },
  { key: "freizeit_hobbies_soziales.sport_fitness", name: "Sport und Fitness", color: "#c07a4a", parentKey: "freizeit_hobbies_soziales", sortOrder: 4 },

  // Mobilität
  { key: "mobilitaet.kfz_versicherung", name: "KFZ-Versicherung", color: "#4a6fa5", parentKey: "mobilitaet", sortOrder: 1 },
  { key: "mobilitaet.kfz_kredit_leasing_kauf", name: "KFZ-Kredit / Leasingrate / KFZ-Kauf", color: "#4a6fa5", parentKey: "mobilitaet", sortOrder: 2 },
  { key: "mobilitaet.kfz_sonstige", name: "KFZ-Sonstige", color: "#4a6fa5", parentKey: "mobilitaet", sortOrder: 3 },
  { key: "mobilitaet.tanken", name: "Tanken", color: "#4a6fa5", parentKey: "mobilitaet", sortOrder: 4 },
  { key: "mobilitaet.taxi_oepnv_sharing", name: "Taxi / ÖPNV / Car- und Bikesharing", color: "#4a6fa5", parentKey: "mobilitaet", sortOrder: 5 },

  // Sparen und Anlegen
  { key: "sparen_anlegen.festgeld_tagesgeld_sparkonto", name: "Festgeld / Tagesgeld / Sparkonto", color: "#2e6e5e", parentKey: "sparen_anlegen", sortOrder: 1 },
  { key: "sparen_anlegen.bausparen", name: "Bausparen", color: "#2e6e5e", parentKey: "sparen_anlegen", sortOrder: 2 },
  { key: "sparen_anlegen.kapitallebensversicherung", name: "Kapitallebensversicherung", color: "#2e6e5e", parentKey: "sparen_anlegen", sortOrder: 3 },
  { key: "sparen_anlegen.private_rentenversicherung", name: "Private Rentenversicherung", color: "#2e6e5e", parentKey: "sparen_anlegen", sortOrder: 4 },
  { key: "sparen_anlegen.wertpapieranlage", name: "Wertpapieranlage", color: "#2e6e5e", parentKey: "sparen_anlegen", sortOrder: 5 },
  { key: "sparen_anlegen.wertgegenstaende_andere_anlagen", name: "Wertgegenstände und andere Anlagen", color: "#2e6e5e", parentKey: "sparen_anlegen", sortOrder: 6 },

  // Shopping und Unterhaltung
  { key: "shopping_unterhaltung.buecher_zeitungen_zeitschriften", name: "Bücher / Zeitungen / Zeitschriften", color: "#8a5fa0", parentKey: "shopping_unterhaltung", sortOrder: 1 },
  { key: "shopping_unterhaltung.bekleidung_schuhe_accessoires", name: "Bekleidung / Schuhe / Accessoires", color: "#8a5fa0", parentKey: "shopping_unterhaltung", sortOrder: 2 },
  { key: "shopping_unterhaltung.unterhaltungselektronik_software", name: "Unterhaltungselektronik und Software", color: "#8a5fa0", parentKey: "shopping_unterhaltung", sortOrder: 3 },
  { key: "shopping_unterhaltung.bueromaterial", name: "Büromaterial", color: "#8a5fa0", parentKey: "shopping_unterhaltung", sortOrder: 4 },
  { key: "shopping_unterhaltung.tv_video_musik", name: "TV / Video / Musik", color: "#8a5fa0", parentKey: "shopping_unterhaltung", sortOrder: 5 },

  // Reisen
  { key: "reisen.hotel_unterkunft", name: "Hotel und Unterkunft", color: "#3e8fa3", parentKey: "reisen", sortOrder: 1 },
  { key: "reisen.pauschalreise", name: "Pauschalreise", color: "#3e8fa3", parentKey: "reisen", sortOrder: 2 },
  { key: "reisen.transport", name: "Transport", color: "#3e8fa3", parentKey: "reisen", sortOrder: 3 },

  // Bank und Kredit
  { key: "bank_kredit.kontentransfer", name: "Kontentransfer", color: "#55606a", parentKey: "bank_kredit", sortOrder: 1 },
  { key: "bank_kredit.bankgebuehren", name: "Bankgebühren", color: "#55606a", parentKey: "bank_kredit", sortOrder: 2 },
  { key: "bank_kredit.barauszahlung", name: "Barauszahlung", color: "#55606a", parentKey: "bank_kredit", sortOrder: 3 },
  { key: "bank_kredit.kreditkartenabrechnung", name: "Kreditkartenabrechnung", color: "#55606a", parentKey: "bank_kredit", sortOrder: 4 },
  { key: "bank_kredit.kredittilgung_zinsen", name: "Kredittilgung und -zinsen", color: "#55606a", parentKey: "bank_kredit", sortOrder: 5 },
];

/**
 * Idempotentes Template-Seeding – läuft bei JEDEM App-Start (siehe CLAUDE.md, "Daten-Robustheit").
 * Prüft je Template ausschließlich über `template_key`: fehlt der Key → einfügen; existiert er
 * bereits (auch ausgeblendet oder umbenannt) → komplett unangetastet lassen. Fehlt eine Zeile,
 * die vor Einführung von `template_key` per Name angelegt wurde, wird sie einmalig per Name
 * gematcht und nachträglich mit ihrem `template_key` versehen (Backfill), statt dupliziert zu werden.
 */
export async function seedTemplateCategories(): Promise<void> {
  const db = await getDb();
  const keyToId = new Map<string, number>();

  for (const def of TEMPLATE_CATEGORIES) {
    const existing = await db.select<{ id: number }[]>(
      "select id from categories where template_key = $1",
      [def.key],
    );
    if (existing.length > 0) {
      keyToId.set(def.key, existing[0].id);
      continue;
    }

    const parentId = def.parentKey ? keyToId.get(def.parentKey) ?? null : null;

    // Backfill für Installationen, die die Kategorie schon vor template_key per Name angelegt haben.
    const legacyMatch =
      parentId == null
        ? await db.select<{ id: number }[]>(
            "select id from categories where name = $1 and parent_id is null and template_key is null",
            [def.name],
          )
        : await db.select<{ id: number }[]>(
            "select id from categories where name = $1 and parent_id = $2 and template_key is null",
            [def.name, parentId],
          );
    if (legacyMatch.length > 0) {
      await db.execute("update categories set template_key = $1 where id = $2", [def.key, legacyMatch[0].id]);
      keyToId.set(def.key, legacyMatch[0].id);
      continue;
    }

    try {
      const result = await db.execute(
        `insert into categories (name, color, icon, parent_id, is_template, is_system, sort_order, template_key)
         values ($1, $2, $3, $4, 1, $5, $6, $7)`,
        [def.name, def.color, def.icon ?? null, parentId, def.isSystem ? 1 : 0, def.sortOrder, def.key],
      );
      const newId = Number((result as { lastInsertId?: number }).lastInsertId);
      if (Number.isFinite(newId) && newId > 0) {
        keyToId.set(def.key, newId);
      } else {
        const inserted = await db.select<{ id: number }[]>(
          "select id from categories where template_key = $1",
          [def.key],
        );
        if (inserted[0]) keyToId.set(def.key, inserted[0].id);
      }
    } catch (e) {
      console.warn("Template category seed notice:", def.key, e);
    }
  }
}

/**
 * Explizite Nutzeraktion ("Standard-Kategorien wiederherstellen"): macht zusätzlich zum
 * Seeding auch zuvor ausgeblendete/gelöschte Templates wieder sichtbar. Nie automatisch
 * beim App-Start aufrufen – dafür ist `seedTemplateCategories` zuständig.
 */
export async function restoreDefaultCategories(): Promise<void> {
  const db = await getDb();
  await db.execute(
    "update categories set is_deleted = 0, is_hidden = 0 where is_template = 1 or is_system = 1",
  );
  await seedTemplateCategories();
}
