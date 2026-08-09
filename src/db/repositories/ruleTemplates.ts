import { getDb } from "@/db/client";

export interface RuleTemplate {
  id: number;
  template_key: string;
  label: string;
  category_template_key: string;
  field: "purpose" | "counterparty";
  operator: "contains" | "equals";
  value: string;
  sort_order: number;
  is_hidden: 0 | 1;
  is_custom: 0 | 1;
  is_deleted: 0 | 1;
}

interface BuiltinRuleTemplateDef {
  key: string;
  label: string;
  categoryKey: string;
  field: "purpose" | "counterparty";
  value: string;
  sortOrder: number;
}

/**
 * Mitgelieferte Regel-Vorlagen: verbreitete deutsche Anbieter/Händler pro Kategorie.
 * `key` ist der stabile template_key (nie umbenennen/entfernen, siehe seedBuiltinRuleTemplates).
 * Bewusst nur Text-Erkennung auf `counterparty` (Standardfall) – kein Betrag/Datum, das bleibt
 * Benutzerregeln vorbehalten, die in der Pipeline weiterhin vorrangig geprüft werden.
 */
const BUILTIN_RULE_TEMPLATES: BuiltinRuleTemplateDef[] = [
  // Wohnen – Strom
  { key: "strom.vattenfall", label: "Vattenfall (Strom)", categoryKey: "wohnen.strom", field: "counterparty", value: "vattenfall", sortOrder: 1 },
  { key: "strom.eon", label: "E.ON (Strom)", categoryKey: "wohnen.strom", field: "counterparty", value: "e.on", sortOrder: 2 },
  { key: "strom.enbw", label: "EnBW (Strom)", categoryKey: "wohnen.strom", field: "counterparty", value: "enbw", sortOrder: 3 },
  { key: "strom.rwe", label: "RWE (Strom)", categoryKey: "wohnen.strom", field: "counterparty", value: "rwe", sortOrder: 4 },
  { key: "strom.lichtblick", label: "LichtBlick (Strom)", categoryKey: "wohnen.strom", field: "counterparty", value: "lichtblick", sortOrder: 5 },
  { key: "strom.stadtwerke", label: "Stadtwerke (Strom/Gas)", categoryKey: "wohnen.strom", field: "counterparty", value: "stadtwerke", sortOrder: 6 },
  // Wohnen – Gas
  { key: "gas.gaspreisvergleich", label: "GASAG (Gas)", categoryKey: "wohnen.gas", field: "counterparty", value: "gasag", sortOrder: 1 },
  // Lebenshaltung – Festnetz/Internet & Handy
  { key: "internet.telekom", label: "Telekom", categoryKey: "lebenshaltung.festnetz_internet", field: "counterparty", value: "telekom", sortOrder: 1 },
  { key: "internet.vodafone", label: "Vodafone", categoryKey: "lebenshaltung.festnetz_internet", field: "counterparty", value: "vodafone", sortOrder: 2 },
  { key: "internet.1und1", label: "1&1", categoryKey: "lebenshaltung.festnetz_internet", field: "counterparty", value: "1&1", sortOrder: 3 },
  { key: "internet.o2", label: "o2 / Telefonica", categoryKey: "lebenshaltung.handy", field: "counterparty", value: "telefonica", sortOrder: 4 },
  { key: "handy.congstar", label: "congstar", categoryKey: "lebenshaltung.handy", field: "counterparty", value: "congstar", sortOrder: 5 },
  { key: "handy.aldi_talk", label: "Aldi Talk", categoryKey: "lebenshaltung.handy", field: "counterparty", value: "aldi talk", sortOrder: 6 },
  // Lebenshaltung – Lebensmittel
  { key: "lebensmittel.rewe", label: "Rewe", categoryKey: "lebenshaltung.lebensmittel_getraenke", field: "counterparty", value: "rewe", sortOrder: 1 },
  { key: "lebensmittel.edeka", label: "Edeka", categoryKey: "lebenshaltung.lebensmittel_getraenke", field: "counterparty", value: "edeka", sortOrder: 2 },
  { key: "lebensmittel.aldi", label: "Aldi", categoryKey: "lebenshaltung.lebensmittel_getraenke", field: "counterparty", value: "aldi", sortOrder: 3 },
  { key: "lebensmittel.lidl", label: "Lidl", categoryKey: "lebenshaltung.lebensmittel_getraenke", field: "counterparty", value: "lidl", sortOrder: 4 },
  { key: "lebensmittel.kaufland", label: "Kaufland", categoryKey: "lebenshaltung.lebensmittel_getraenke", field: "counterparty", value: "kaufland", sortOrder: 5 },
  { key: "lebensmittel.netto", label: "Netto", categoryKey: "lebenshaltung.lebensmittel_getraenke", field: "counterparty", value: "netto", sortOrder: 6 },
  { key: "lebensmittel.penny", label: "Penny", categoryKey: "lebenshaltung.lebensmittel_getraenke", field: "counterparty", value: "penny", sortOrder: 7 },
  // Lebenshaltung – Drogerie
  { key: "drogerie.dm", label: "dm-drogerie markt", categoryKey: "lebenshaltung.drogerie", field: "counterparty", value: "dm-drogerie", sortOrder: 1 },
  { key: "drogerie.rossmann", label: "Rossmann", categoryKey: "lebenshaltung.drogerie", field: "counterparty", value: "rossmann", sortOrder: 2 },
  // Gesundheit – Arznei
  { key: "arznei.apotheke", label: "Apotheke", categoryKey: "gesundheit_wellness.arznei_heilmittel", field: "counterparty", value: "apotheke", sortOrder: 1 },
  // Versicherung
  { key: "versicherung.allianz", label: "Allianz", categoryKey: "versicherung.haftpflichtversicherung", field: "counterparty", value: "allianz", sortOrder: 1 },
  { key: "versicherung.huk", label: "HUK-Coburg (KFZ)", categoryKey: "mobilitaet.kfz_versicherung", field: "counterparty", value: "huk-coburg", sortOrder: 2 },
  { key: "versicherung.ergo", label: "ERGO", categoryKey: "versicherung.haftpflichtversicherung", field: "counterparty", value: "ergo", sortOrder: 3 },
  { key: "versicherung.axa", label: "AXA", categoryKey: "versicherung.haftpflichtversicherung", field: "counterparty", value: "axa", sortOrder: 4 },
  // Freizeit/Streaming/Fitness
  { key: "streaming.netflix", label: "Netflix", categoryKey: "shopping_unterhaltung.tv_video_musik", field: "counterparty", value: "netflix", sortOrder: 1 },
  { key: "streaming.spotify", label: "Spotify", categoryKey: "shopping_unterhaltung.tv_video_musik", field: "counterparty", value: "spotify", sortOrder: 2 },
  { key: "streaming.disney", label: "Disney+", categoryKey: "shopping_unterhaltung.tv_video_musik", field: "counterparty", value: "disney", sortOrder: 3 },
  { key: "streaming.amazon_prime", label: "Amazon Prime", categoryKey: "shopping_unterhaltung.tv_video_musik", field: "counterparty", value: "amazon prime", sortOrder: 4 },
  { key: "streaming.dazn", label: "DAZN", categoryKey: "shopping_unterhaltung.tv_video_musik", field: "counterparty", value: "dazn", sortOrder: 5 },
  { key: "rundfunk.beitragsservice", label: "Rundfunkbeitrag (GEZ)", categoryKey: "wohnen.wohnnebenkosten", field: "counterparty", value: "rundfunkbeitrag", sortOrder: 6 },
  { key: "fitness.mcfit", label: "McFit", categoryKey: "freizeit_hobbies_soziales.sport_fitness", field: "counterparty", value: "mcfit", sortOrder: 7 },
  { key: "fitness.fitx", label: "FitX", categoryKey: "freizeit_hobbies_soziales.sport_fitness", field: "counterparty", value: "fitx", sortOrder: 8 },
  { key: "fitness.clever_fit", label: "Clever Fit", categoryKey: "freizeit_hobbies_soziales.sport_fitness", field: "counterparty", value: "clever fit", sortOrder: 9 },
  // Mobilität
  { key: "tanken.aral", label: "Aral (Tanken)", categoryKey: "mobilitaet.tanken", field: "counterparty", value: "aral", sortOrder: 1 },
  { key: "tanken.shell", label: "Shell (Tanken)", categoryKey: "mobilitaet.tanken", field: "counterparty", value: "shell", sortOrder: 2 },
  { key: "tanken.esso", label: "Esso (Tanken)", categoryKey: "mobilitaet.tanken", field: "counterparty", value: "esso", sortOrder: 3 },
  { key: "tanken.jet", label: "Jet (Tanken)", categoryKey: "mobilitaet.tanken", field: "counterparty", value: "jet tankstelle", sortOrder: 4 },
  { key: "oepnv.db", label: "Deutsche Bahn", categoryKey: "mobilitaet.taxi_oepnv_sharing", field: "counterparty", value: "deutsche bahn", sortOrder: 5 },
  // Shopping
  { key: "shopping.amazon", label: "Amazon (Einkauf)", categoryKey: "shopping_unterhaltung.unterhaltungselektronik_software", field: "counterparty", value: "amazon", sortOrder: 1 },
  { key: "shopping.zalando", label: "Zalando", categoryKey: "shopping_unterhaltung.bekleidung_schuhe_accessoires", field: "counterparty", value: "zalando", sortOrder: 2 },
  // Bank/Kredit
  { key: "bank.paypal", label: "PayPal (Sammelbuchung)", categoryKey: "bank_kredit.kontentransfer", field: "counterparty", value: "paypal", sortOrder: 1 },
];

/** Idempotentes Seeding wie bei Template-Kategorien: fehlt der template_key → einfügen, sonst unangetastet lassen. */
export async function seedBuiltinRuleTemplates(): Promise<void> {
  const db = await getDb();
  const existing = await db.select<{ template_key: string }[]>(
    "select template_key from rule_templates",
  );
  const existingKeys = new Set(existing.map((r) => r.template_key));
  for (const def of BUILTIN_RULE_TEMPLATES) {
    if (existingKeys.has(def.key)) continue;
    await db.execute(
      `insert into rule_templates (template_key, label, category_template_key, field, operator, value, sort_order, is_custom)
       values ($1, $2, $3, $4, 'contains', $5, $6, 0)`,
      [def.key, def.label, def.categoryKey, def.field, def.value, def.sortOrder],
    );
  }
}

export async function listRuleTemplates(): Promise<RuleTemplate[]> {
  const db = await getDb();
  return db.select<RuleTemplate[]>(
    "select * from rule_templates where is_deleted = 0 order by category_template_key asc, sort_order asc",
  );
}

/** Für die Pipeline: nur die tatsächlich aktiven (nicht ausgeblendeten) Vorlagen. */
export async function listActiveRuleTemplates(): Promise<RuleTemplate[]> {
  const db = await getDb();
  return db.select<RuleTemplate[]>(
    "select * from rule_templates where is_deleted = 0 and is_hidden = 0",
  );
}

export interface RuleTemplateInput {
  label: string;
  category_template_key: string;
  field: "purpose" | "counterparty";
  operator: "contains" | "equals";
  value: string;
}

export async function createCustomRuleTemplate(input: RuleTemplateInput): Promise<number> {
  const db = await getDb();
  const templateKey = `custom.${Date.now()}.${Math.round(Math.random() * 1e6)}`;
  const result = await db.execute(
    `insert into rule_templates (template_key, label, category_template_key, field, operator, value, is_custom)
     values ($1, $2, $3, $4, $5, $6, 1)`,
    [templateKey, input.label, input.category_template_key, input.field, input.operator, input.value],
  );
  return result.lastInsertId as number;
}

export async function updateRuleTemplate(id: number, input: RuleTemplateInput): Promise<void> {
  const db = await getDb();
  await db.execute(
    `update rule_templates set label = $1, category_template_key = $2, field = $3, operator = $4, value = $5
     where id = $6`,
    [input.label, input.category_template_key, input.field, input.operator, input.value, id],
  );
}

export async function setRuleTemplateHidden(id: number, hidden: boolean): Promise<void> {
  const db = await getDb();
  await db.execute("update rule_templates set is_hidden = $1 where id = $2", [hidden ? 1 : 0, id]);
}

export async function deleteCustomRuleTemplate(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("update rule_templates set is_deleted = 1 where id = $1 and is_custom = 1", [id]);
}
