import { getDb } from "@/db/client";
import type { Transaction } from "@/db/types";

export interface SteuerThema {
  id: number;
  name: string;
  sort_order: number;
  is_deleted: 0 | 1;
  template_key: string | null;
  categoryIds: number[];
  keywords: string[];
}

export interface SteuerTransaction extends Transaction {
  tag_ids: number[];
  categoryName: string | null;
  parentCategoryName: string | null;
  assetName: string;
  contractName: string | null;
  contractYearSumCents: number | null;
}

const DEFAULT_THEMEN = [
  {
    key: "versicherung_vorsorge",
    name: "Versicherungen & Vorsorge",
    categories: ["Versicherung"],
    keywords: [],
  },
  {
    key: "handwerker_dienstleistungen",
    name: "Handwerker & haushaltsnahe Dienstleistungen",
    categories: ["Haushaltsdienstleistungen", "Heimwerken und Garten"],
    keywords: ["handwerker", "hausmeister", "gartenpflege", "schornstein", "wartung"],
  },
  {
    key: "spenden_kirche",
    name: "Spenden & Kirche",
    categories: ["Kirche / Spende"],
    keywords: ["spende"],
  },
  {
    key: "gesundheitskosten",
    name: "Gesundheitskosten",
    categories: ["Gesundheit und Wellness"],
    keywords: ["zuzahlung", "apotheke", "brille", "zahnarzt"],
  },
  {
    key: "kinderbetreuung",
    name: "Kinderbetreuung",
    categories: ["Kinderbetreuung und -gruppen"],
    keywords: ["kita", "kindergarten", "tagesmutter", "hort"],
  },
  {
    key: "kapitalertraege",
    name: "Kapitalerträge",
    categories: ["Kapitaleinkommen"],
    keywords: ["dividende", "zinsen", "ausschüttung"],
  },
];

async function categoryIdsByNames(names: string[]): Promise<number[]> {
  if (names.length === 0) return [];
  const db = await getDb();
  const placeholders = names.map((_, idx) => `$${idx + 1}`).join(", ");
  const rows = await db.select<{ id: number }[]>(
    `select id from categories where name in (${placeholders}) and is_deleted = 0`,
    names,
  );
  return rows.map((row) => row.id);
}

export async function ensureDefaultSteuerThemen(): Promise<void> {
  const db = await getDb();
  const existing = await db.select<{ count: number }[]>(
    "select count(*) as count from steuer_themen where is_deleted = 0",
  );
  if ((existing[0]?.count ?? 0) > 0) return;

  for (const [idx, thema] of DEFAULT_THEMEN.entries()) {
    const result = await db.execute(
      "insert into steuer_themen (name, sort_order, template_key) values ($1, $2, $3)",
      [thema.name, idx + 1, thema.key],
    );
    const id = result.lastInsertId as number;
    const categoryIds = await categoryIdsByNames(thema.categories);
    for (const categoryId of categoryIds) {
      await db.execute(
        "insert or ignore into steuer_thema_categories (thema_id, category_id) values ($1, $2)",
        [id, categoryId],
      );
    }
    for (const keyword of thema.keywords) {
      await db.execute(
        "insert into steuer_thema_keywords (thema_id, keyword) values ($1, $2)",
        [id, keyword],
      );
    }
  }
}

export async function listSteuerThemen(): Promise<SteuerThema[]> {
  await ensureDefaultSteuerThemen();
  const db = await getDb();
  const themen = await db.select<Omit<SteuerThema, "categoryIds" | "keywords">[]>(
    "select * from steuer_themen where is_deleted = 0 order by sort_order asc, name asc",
  );
  if (themen.length === 0) return [];
  const ids = themen.map((thema) => thema.id);
  const placeholders = ids.map((_, idx) => `$${idx + 1}`).join(", ");
  const [categoryRows, keywordRows] = await Promise.all([
    db.select<{ thema_id: number; category_id: number }[]>(
      `select thema_id, category_id from steuer_thema_categories where thema_id in (${placeholders})`,
      ids,
    ),
    db.select<{ thema_id: number; keyword: string }[]>(
      `select thema_id, keyword from steuer_thema_keywords where thema_id in (${placeholders}) order by id asc`,
      ids,
    ),
  ]);
  const categoriesByTheme = new Map<number, number[]>();
  for (const row of categoryRows) {
    const list = categoriesByTheme.get(row.thema_id) ?? [];
    list.push(row.category_id);
    categoriesByTheme.set(row.thema_id, list);
  }
  const keywordsByTheme = new Map<number, string[]>();
  for (const row of keywordRows) {
    const list = keywordsByTheme.get(row.thema_id) ?? [];
    list.push(row.keyword);
    keywordsByTheme.set(row.thema_id, list);
  }
  return themen.map((thema) => ({
    ...thema,
    categoryIds: categoriesByTheme.get(thema.id) ?? [],
    keywords: keywordsByTheme.get(thema.id) ?? [],
  }));
}

export async function createSteuerThema(input: {
  name: string;
  categoryIds: number[];
  keywords: string[];
}): Promise<number> {
  const db = await getDb();
  const maxRows = await db.select<{ max_sort: number | null }[]>(
    "select max(sort_order) as max_sort from steuer_themen",
  );
  const result = await db.execute(
    "insert into steuer_themen (name, sort_order) values ($1, $2)",
    [input.name, (maxRows[0]?.max_sort ?? 0) + 1],
  );
  const id = result.lastInsertId as number;
  await replaceSteuerThemaLinks(id, input.categoryIds, input.keywords);
  return id;
}

export async function updateSteuerThema(
  id: number,
  input: { name: string; categoryIds: number[]; keywords: string[] },
): Promise<void> {
  const db = await getDb();
  await db.execute("update steuer_themen set name = $1 where id = $2", [input.name, id]);
  await replaceSteuerThemaLinks(id, input.categoryIds, input.keywords);
}

async function replaceSteuerThemaLinks(
  id: number,
  categoryIds: number[],
  keywords: string[],
): Promise<void> {
  const db = await getDb();
  await db.execute("delete from steuer_thema_categories where thema_id = $1", [id]);
  await db.execute("delete from steuer_thema_keywords where thema_id = $1", [id]);
  for (const categoryId of [...new Set(categoryIds)]) {
    await db.execute(
      "insert or ignore into steuer_thema_categories (thema_id, category_id) values ($1, $2)",
      [id, categoryId],
    );
  }
  for (const keyword of [...new Set(keywords.map((k) => k.trim()).filter(Boolean))]) {
    await db.execute(
      "insert into steuer_thema_keywords (thema_id, keyword) values ($1, $2)",
      [id, keyword],
    );
  }
}

export async function deleteSteuerThema(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("update steuer_themen set is_deleted = 1 where id = $1", [id]);
}

async function expandedCategoryIds(categoryIds: number[]): Promise<number[]> {
  if (categoryIds.length === 0) return [];
  const db = await getDb();
  const placeholders = categoryIds.map((_, idx) => `$${idx + 1}`).join(", ");
  const children = await db.select<{ id: number }[]>(
    `select id from categories where parent_id in (${placeholders}) and is_deleted = 0`,
    categoryIds,
  );
  return [...new Set([...categoryIds, ...children.map((row) => row.id)])];
}

export async function getSteuerTransactions(
  year: number,
  thema: SteuerThema | null,
  search = "",
): Promise<SteuerTransaction[]> {
  const db = await getDb();
  const clauses = ["t.is_deleted = 0", "substr(t.booking_date, 1, 4) = $1"];
  const params: unknown[] = [String(year)];
  let i = 2;

  if (thema) {
    const categoryIds = await expandedCategoryIds(thema.categoryIds);
    const topicClauses: string[] = [];
    if (categoryIds.length > 0) {
      const placeholders = categoryIds.map((_, idx) => `$${i + idx}`).join(", ");
      topicClauses.push(`t.category_id in (${placeholders})`);
      params.push(...categoryIds);
      i += categoryIds.length;
    }
    for (const keyword of thema.keywords) {
      topicClauses.push(`(lower(t.counterparty) like $${i} or lower(coalesce(t.purpose, '')) like $${i})`);
      params.push(`%${keyword.toLowerCase()}%`);
      i += 1;
    }
    clauses.push(topicClauses.length > 0 ? `(${topicClauses.join(" or ")})` : "0 = 1");
  }

  if (search.trim()) {
    clauses.push(
      `(lower(t.counterparty) like $${i} or lower(coalesce(t.purpose, '')) like $${i} or cast(t.amount_cents as text) like $${i})`,
    );
    params.push(`%${search.trim().toLowerCase()}%`);
  }

  const rows = await db.select<SteuerTransaction[]>(
    `select
       t.*,
       c.name as categoryName,
       parent.name as parentCategoryName,
       a.name as assetName,
       co.name as contractName,
       (
         select sum(amount_cents)
         from transactions tx2
         where tx2.contract_id = t.contract_id
           and tx2.is_deleted = 0
           and substr(tx2.booking_date, 1, 4) = $1
       ) as contractYearSumCents
     from transactions t
     left join categories c on c.id = t.category_id
     left join categories parent on parent.id = c.parent_id
     join assets a on a.id = t.asset_id
     left join contracts co on co.id = t.contract_id
     where ${clauses.join(" and ")}
     order by t.booking_date desc, t.id desc`,
    params,
  );
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map((_, idx) => `$${idx + 1}`).join(", ");
  const tagRows = await db.select<{ transaction_id: number; tag_id: number }[]>(
    `select transaction_id, tag_id from transaction_tags where transaction_id in (${placeholders})`,
    ids,
  );
  const tagMap = new Map<number, number[]>();
  for (const tr of tagRows) {
    const list = tagMap.get(tr.transaction_id) ?? [];
    list.push(tr.tag_id);
    tagMap.set(tr.transaction_id, list);
  }
  return rows.map((r) => ({
    ...r,
    tag_ids: tagMap.get(r.id) ?? [],
  }));
}

export async function listSteuerYears(): Promise<number[]> {
  const db = await getDb();
  const rows = await db.select<{ year: string }[]>(
    `select distinct substr(booking_date, 1, 4) as year
     from transactions
     where is_deleted = 0
     order by year desc`,
  );
  const years = rows.map((row) => Number(row.year)).filter(Boolean);
  const previousYear = new Date().getFullYear() - 1;
  return years.includes(previousYear) ? years : [previousYear, ...years];
}
