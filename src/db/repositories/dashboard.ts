import { getDb } from "@/db/client";
import type { PeriodType } from "@/lib/periods";

export interface DashboardFilter {
  assetId?: number | null;
  personId?: number | null;
  from: string;
  to: string;
}

export interface DashboardKpis {
  incomeCents: number;
  expensesCents: number;
  savingCents: number;
  savingRate: number;
  previousIncomeCents: number;
  previousExpensesCents: number;
  previousSavingCents: number;
  previousSavingRate: number;
}

export interface CategorizationProgress {
  total: number;
  uncategorized: number;
}

export interface CategoryExpensePoint {
  categoryId: number | null;
  name: string;
  color: string;
  cents: number;
}

export interface CashflowPoint {
  label: string;
  from: string;
  to: string;
  incomeCents: number;
  expensesCents: number;
}

export interface SavingPurposePoint {
  sparzweckId: number | null;
  name: string;
  color: string;
  cents: number;
  targetCents: number | null;
}

export interface PersonComparisonPoint {
  personId: number;
  name: string;
  cents: number;
}

export interface PlannedContractPoint {
  id: number;
  name: string;
  categoryName: string | null;
  categoryTemplateKey: string | null;
  amountCents: number;
  interval: "monthly" | "quarterly" | "yearly" | "irregular";
  lastPaymentDate: string | null;
}

export interface FocusCollectionSummary {
  id: number;
  name: string;
  isGoal: 0 | 1;
  targetCents: number | null;
  sumCents: number;
  count: number;
}

export interface DashboardFreshness {
  latestImportAt: string | null;
  oldestLastImportAt: string | null;
  oldestAssetName: string | null;
}

function filteredClause(alias: string, filter: Pick<DashboardFilter, "assetId" | "personId">) {
  const clauses = [`${alias}.is_deleted = 0`];
  const params: unknown[] = [];
  let i = 1;
  if (filter.assetId) {
    clauses.push(`${alias}.asset_id = $${i++}`);
    params.push(filter.assetId);
  }
  if (filter.personId) {
    clauses.push(
      `${alias}.asset_id in (select asset_id from asset_owners where person_id = $${i++})`,
    );
    params.push(filter.personId);
  }
  return { clause: clauses.join(" and "), params, nextIndex: i };
}

function shiftIsoMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function periodLengthDays(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T00:00:00`).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

export function getPreviousDashboardRange(
  type: PeriodType,
  from: string,
  to: string,
  comparisonMode: "prev_period" | "prev_year" = "prev_period",
) {
  if (comparisonMode === "prev_year") {
    return { from: shiftIsoMonths(from, -12), to: shiftIsoMonths(to, -12) };
  }
  if (type === "month") return { from: shiftIsoMonths(from, -1), to: dayBefore(from) };
  if (type === "quarter") return { from: shiftIsoMonths(from, -3), to: dayBefore(from) };
  if (type === "year") return { from: shiftIsoMonths(from, -12), to: dayBefore(from) };
  const days = periodLengthDays(from, to);
  const previousTo = dayBefore(from);
  const previousFromDate = new Date(`${previousTo}T00:00:00`);
  previousFromDate.setDate(previousFromDate.getDate() - days + 1);
  return { from: previousFromDate.toISOString().slice(0, 10), to: previousTo };
}

async function getKpiRange(filter: DashboardFilter): Promise<Omit<DashboardKpis, "previousIncomeCents" | "previousExpensesCents" | "previousSavingCents" | "previousSavingRate">> {
  const db = await getDb();
  const base = filteredClause("t", filter);
  const rows = await db.select<{ income: number | null; expenses: number | null; saving: number | null }[]>(
    `select
       coalesce(sum(case when t.amount_cents > 0 and t.is_transfer = 0 and t.exclude_from_stats = 0 then t.amount_cents else 0 end), 0) as income,
       coalesce(sum(case when t.amount_cents < 0 and t.is_transfer = 0 and t.is_saving = 0 and t.exclude_from_stats = 0 then -t.amount_cents else 0 end), 0) as expenses,
       coalesce(sum(case when t.amount_cents < 0 and t.is_saving = 1 and t.exclude_from_stats = 0 then -t.amount_cents else 0 end), 0) as saving
     from transactions t
     where ${base.clause} and t.booking_date >= $${base.nextIndex} and t.booking_date <= $${base.nextIndex + 1}`,
    [...base.params, filter.from, filter.to],
  );
  const incomeCents = rows[0]?.income ?? 0;
  const expensesCents = rows[0]?.expenses ?? 0;
  const savingCents = rows[0]?.saving ?? 0;
  return {
    incomeCents,
    expensesCents,
    savingCents,
    savingRate: incomeCents > 0 ? savingCents / incomeCents : 0,
  };
}

export async function getDashboardKpis(
  filter: DashboardFilter,
  periodType: PeriodType,
  comparisonMode: "prev_period" | "prev_year" = "prev_period",
): Promise<DashboardKpis> {
  const previous = getPreviousDashboardRange(periodType, filter.from, filter.to, comparisonMode);
  const [current, previousValues] = await Promise.all([
    getKpiRange(filter),
    getKpiRange({ ...filter, ...previous }),
  ]);
  return {
    ...current,
    previousIncomeCents: previousValues.incomeCents,
    previousExpensesCents: previousValues.expensesCents,
    previousSavingCents: previousValues.savingCents,
    previousSavingRate: previousValues.savingRate,
  };
}

export async function getCategorizationProgress(): Promise<CategorizationProgress> {
  const db = await getDb();
  const rows = await db.select<{ total: number; uncategorized: number }[]>(
    `select
       count(*) as total,
       sum(case when category_id is null then 1 else 0 end) as uncategorized
     from transactions
     where is_deleted = 0`,
  );
  return { total: rows[0]?.total ?? 0, uncategorized: rows[0]?.uncategorized ?? 0 };
}

export async function getTopCategoryExpenses(
  filter: DashboardFilter,
  limit = 5,
): Promise<CategoryExpensePoint[]> {
  const db = await getDb();
  const base = filteredClause("t", filter);
  const rows = await db.select<{ category_id: number | null; name: string | null; color: string | null; cents: number }[]>(
    `select
       coalesce(parent.id, c.id) as category_id,
       coalesce(parent.name, c.name, 'Unkategorisiert') as name,
       coalesce(parent.color, c.color, '#6b7a80') as color,
       sum(-t.amount_cents) as cents
     from transactions t
     left join categories c on c.id = t.category_id
     left join categories parent on parent.id = c.parent_id
     where ${base.clause}
       and t.booking_date >= $${base.nextIndex}
       and t.booking_date <= $${base.nextIndex + 1}
       and t.amount_cents < 0
       and t.is_transfer = 0
       and t.is_saving = 0
       and t.exclude_from_stats = 0
     group by coalesce(parent.id, c.id), coalesce(parent.name, c.name), coalesce(parent.color, c.color)
     order by cents desc
     limit ${limit}`,
    [...base.params, filter.from, filter.to],
  );
  return rows.map((row) => ({
    categoryId: row.category_id,
    name: row.name ?? "Unkategorisiert",
    color: row.color ?? "#6b7a80",
    cents: row.cents,
  }));
}

export async function getCashflowSeries(
  filter: Pick<DashboardFilter, "assetId" | "personId">,
  periods: { label: string; from: string; to: string }[],
): Promise<CashflowPoint[]> {
  const db = await getDb();
  const base = filteredClause("t", filter);
  const result: CashflowPoint[] = [];
  for (const period of periods) {
    const rows = await db.select<{ income: number | null; expenses: number | null }[]>(
      `select
         coalesce(sum(case when t.amount_cents > 0 and t.is_transfer = 0 and t.exclude_from_stats = 0 then t.amount_cents else 0 end), 0) as income,
         coalesce(sum(case when t.amount_cents < 0 and t.is_transfer = 0 and t.is_saving = 0 and t.exclude_from_stats = 0 then -t.amount_cents else 0 end), 0) as expenses
       from transactions t
       where ${base.clause} and t.booking_date >= $${base.nextIndex} and t.booking_date <= $${base.nextIndex + 1}`,
      [...base.params, period.from, period.to],
    );
    result.push({
      ...period,
      incomeCents: rows[0]?.income ?? 0,
      expensesCents: rows[0]?.expenses ?? 0,
    });
  }
  return result;
}

export async function getSavingByPurpose(filter: DashboardFilter): Promise<SavingPurposePoint[]> {
  const db = await getDb();
  const base = filteredClause("t", filter);
  const rows = await db.select<{ sparzweckId: number | null; name: string | null; color: string | null; targetCents: number | null; cents: number }[]>(
    `select
       t.sparzweck_id as sparzweckId,
       coalesce(s.name, 'Ohne Sparzweck') as name,
       coalesce(s.color, '#6b7a80') as color,
       s.target_cents as targetCents,
       sum(-t.amount_cents) as cents
     from transactions t
     left join sparzwecke s on s.id = t.sparzweck_id
     where ${base.clause}
       and t.booking_date >= $${base.nextIndex}
       and t.booking_date <= $${base.nextIndex + 1}
       and t.amount_cents < 0
       and t.is_saving = 1
       and t.exclude_from_stats = 0
     group by t.sparzweck_id, s.name, s.color, s.target_cents
     order by cents desc`,
    [...base.params, filter.from, filter.to],
  );
  return rows.map((row) => ({
    sparzweckId: row.sparzweckId,
    name: row.name ?? "Ohne Sparzweck",
    color: row.color ?? "#6b7a80",
    targetCents: row.targetCents,
    cents: row.cents,
  }));
}

export async function getPersonComparison(filter: DashboardFilter): Promise<PersonComparisonPoint[]> {
  const db = await getDb();
  const clauses = [
    "p.is_active = 1",
    "t.is_deleted = 0",
    "t.booking_date >= $1",
    "t.booking_date <= $2",
    "t.amount_cents < 0",
    "t.is_transfer = 0",
    "t.is_saving = 0",
    "t.exclude_from_stats = 0",
  ];
  const params: unknown[] = [filter.from, filter.to];
  let i = 3;
  if (filter.assetId) {
    clauses.push(`t.asset_id = $${i++}`);
    params.push(filter.assetId);
  }
  if (filter.personId) {
    clauses.push(`p.id = $${i++}`);
    params.push(filter.personId);
  }
  return db.select<PersonComparisonPoint[]>(
    `select p.id as personId, p.name, coalesce(sum(-t.amount_cents), 0) as cents
     from persons p
     left join asset_owners ao on ao.person_id = p.id
     left join transactions t on t.asset_id = ao.asset_id
     where ${clauses.join(" and ")}
     group by p.id, p.name
     order by cents desc`,
    params,
  );
}

export async function getPlannedContracts(limit = 6): Promise<PlannedContractPoint[]> {
  const db = await getDb();
  const rows = await db.select<PlannedContractPoint[]>(
    `select
       c.id,
       c.name,
       cat.name as categoryName,
       cat.template_key as categoryTemplateKey,
       c.current_amount_cents as amountCents,
       c.interval,
       max(t.booking_date) as lastPaymentDate
     from contracts c
     left join categories cat on cat.id = c.category_id
     left join transactions t on t.contract_id = c.id and t.is_deleted = 0
     where c.is_deleted = 0 and c.current_amount_cents != 0 and c.status in ('confirmed', 'price_changed')
     group by c.id, c.name, cat.name, cat.template_key, c.current_amount_cents
     order by lastPaymentDate asc
     limit ${limit}`,
  );
  return rows;
}

export async function getFocusCollection(): Promise<FocusCollectionSummary | null> {
  const db = await getDb();
  const rows = await db.select<FocusCollectionSummary[]>(
    `select
       c.id,
       c.name,
       c.is_goal as isGoal,
       c.target_cents as targetCents,
       coalesce(sum(t.amount_cents), 0) as sumCents,
       count(t.id) as count
     from collections c
     left join collection_transactions ct on ct.collection_id = c.id
     left join transactions t on t.id = ct.transaction_id and t.is_deleted = 0
     where c.is_deleted = 0 and c.status = 'active'
     group by c.id, c.name, c.is_goal, c.target_cents
     order by max(ct.transaction_id) desc, c.created_at desc
     limit 1`,
  );
  return rows[0] ?? null;
}

export async function getDashboardFreshness(
  filter: Pick<DashboardFilter, "assetId" | "personId">,
): Promise<DashboardFreshness> {
  const db = await getDb();
  const clauses = ["a.is_deleted = 0", "a.kind = 'account'", "a.last_import_at is not null"];
  const params: unknown[] = [];
  let i = 1;
  if (filter.assetId) {
    clauses.push(`a.id = $${i++}`);
    params.push(filter.assetId);
  }
  if (filter.personId) {
    clauses.push(`a.id in (select asset_id from asset_owners where person_id = $${i++})`);
    params.push(filter.personId);
  }
  const rows = await db.select<{ latest: string | null; oldest: string | null }[]>(
    `select
       max(a.last_import_at) as latest,
       min(a.last_import_at) as oldest
     from assets a
     where ${clauses.join(" and ")}`,
    params,
  );
  const oldest = rows[0]?.oldest ?? null;
  const oldestNameRows = oldest
    ? await db.select<{ name: string }[]>(
      `select a.name
       from assets a
       where ${clauses.join(" and ")} and a.last_import_at = $${i}
       order by a.name asc
       limit 1`,
      [...params, oldest],
    )
    : [];
  return {
    latestImportAt: rows[0]?.latest ?? null,
    oldestLastImportAt: oldest,
    oldestAssetName: oldestNameRows[0]?.name ?? null,
  };
}
