import { getDb } from "@/db/client";
import { getPeriodRange, shiftPeriod, type PeriodType } from "@/lib/periods";
import { logOperation } from "./operations";

export interface Budget {
  id: number;
  category_id: number;
  limit_cents: number;
  period_type: PeriodType;
  is_deleted: 0 | 1;
}

export interface BudgetHistoryPoint {
  label: string;
  spentCents: number;
  limitCents: number;
}

export interface BudgetSummary extends Budget {
  categoryName: string;
  categoryTemplateKey: string | null;
  parentName: string | null;
  parentTemplateKey: string | null;
  categoryColor: string;
  spentCents: number;
  remainingCents: number;
  usage: number;
  periodLabel: string;
  periodFrom: string;
  periodTo: string;
  history: BudgetHistoryPoint[];
}

export interface BudgetFilter {
  assetId?: number | null;
  personId?: number | null;
}

export interface BudgetPeriod {
  label: string;
  from: string;
  to: string;
}

function assetFilterClause(alias: string, filter: BudgetFilter, startIndex: number) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = startIndex;
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
  return { clause: clauses.join(" and "), params };
}

async function categoryIdsForBudget(categoryId: number): Promise<number[]> {
  const db = await getDb();
  const rows = await db.select<{ id: number; parent_id: number | null }[]>(
    "select id, parent_id from categories where id = $1 and is_deleted = 0",
    [categoryId],
  );
  const category = rows[0];
  if (!category) return [categoryId];
  if (category.parent_id !== null) return [categoryId];

  const children = await db.select<{ id: number }[]>(
    "select id from categories where parent_id = $1 and is_deleted = 0",
    [categoryId],
  );
  return [categoryId, ...children.map((child) => child.id)];
}

async function spentForPeriod(
  categoryIds: number[],
  period: BudgetPeriod,
  filter: BudgetFilter,
): Promise<number> {
  if (categoryIds.length === 0) return 0;
  const db = await getDb();
  const placeholders = categoryIds.map((_, idx) => `$${idx + 3}`).join(", ");
  const assetFilter = assetFilterClause("t", filter, categoryIds.length + 3);
  const rows = await db.select<{ spent: number | null }[]>(
    `select coalesce(sum(-t.amount_cents), 0) as spent
     from transactions t
     where t.is_deleted = 0
       and t.booking_date >= $1
       and t.booking_date <= $2
       and t.category_id in (${placeholders})
       and t.amount_cents < 0
       and t.is_transfer = 0
       and t.is_saving = 0
       and t.exclude_from_stats = 0
       ${assetFilter.clause ? `and ${assetFilter.clause}` : ""}`,
    [period.from, period.to, ...categoryIds, ...assetFilter.params],
  );
  return rows[0]?.spent ?? 0;
}

/**
 * Budgetperioden-Snapshot (`budget_periods`): friert Limit + verbrauchten Betrag einer abgeschlossenen
 * Periode dauerhaft ein, damit eine spätere Limit-Änderung die Historie nicht rückwirkend verfälscht
 * (siehe Kommentar in 001_schema.sql). Nur ohne aktiven Konto-/Personen-Filter aktiv – ein gefilterter
 * Wert wäre für eine andere Filterauswahl beim nächsten Aufruf falsch, deshalb dort weiterhin live berechnet.
 *
 * `listBudgets()` ruft dies für mehrere Budgets/Perioden parallel auf (Promise.all) – ohne Schutz
 * konnten zwei sich überlappende "existiert die Periode schon?"-Prüfungen (z. B. zwei React-Query-
 * Refetches) beide "nein" sehen und je einen eigenen Snapshot für dieselbe Periode anlegen.
 *
 * Bewusst KEIN runInTransaction() hier: die Aufrufe aus listBudgets() laufen als "Geschwister"
 * nebeneinander (Promise.all), nicht ineinander verschachtelt – SQLites SAVEPOINT-Stack setzt aber
 * striktes LIFO-Release voraus (ein zuerst angelegter, aber zuletzt freigegebener Savepoint reißt
 * alle danach angelegten mit sich). Bei nebenläufigen Geschwister-Aufrufen ist die Reihenfolge, in
 * der ihre einzelnen await-Schritte abgeschlossen werden, nicht vorhersehbar, wodurch das reine
 * Verschachteln in runInTransaction() zu "no such savepoint"-Fehlern führte. Der Unique-Index aus
 * Migration 030 zusammen mit einem einzelnen atomaren "insert ... on conflict do nothing" reicht für
 * das eigentliche Race (doppeltes Anlegen) aus; die anschließenden update-Statements schreiben in
 * jedem Interleaving denselben, deterministisch berechneten Wert (idempotent), brauchen also keine
 * gemeinsame Transaktionsklammer.
 */
async function spentAndLimitForPeriod(
  budgetId: number,
  categoryIds: number[],
  period: BudgetPeriod,
  filter: BudgetFilter,
  currentLimitCents: number,
  isCurrent: boolean,
): Promise<{ spentCents: number; limitCents: number }> {
  const hasFilter = !!(filter.assetId || filter.personId);
  if (hasFilter) {
    return { spentCents: await spentForPeriod(categoryIds, period, filter), limitCents: currentLimitCents };
  }

  const db = await getDb();
  const liveSpent = await spentForPeriod(categoryIds, period, filter);

  await db.execute(
    `insert into budget_periods (budget_id, period_start, period_end, limit_snapshot_cents, spent_cents_frozen)
     values ($1, $2, $3, $4, $5)
     on conflict(budget_id, period_start) do nothing`,
    [budgetId, period.from, period.to, currentLimitCents, isCurrent ? null : liveSpent],
  );

  const existing = await db.select<{ id: number; limit_snapshot_cents: number; spent_cents_frozen: number | null }[]>(
    "select id, limit_snapshot_cents, spent_cents_frozen from budget_periods where budget_id = $1 and period_start = $2",
    [budgetId, period.from],
  );
  const row = existing[0];
  if (!row) {
    // Kann nach dem Insert oben nicht mehr auftreten; rein defensiver Fallback ohne Persistenz.
    return { spentCents: liveSpent, limitCents: currentLimitCents };
  }

  if (row.spent_cents_frozen !== null && !isCurrent) {
    return { spentCents: row.spent_cents_frozen, limitCents: row.limit_snapshot_cents };
  }

  if (isCurrent) {
    // Noch laufend: Limit-Snapshot mit dem aktuell gültigen Limit synchron halten, solange nicht eingefroren.
    await db.execute("update budget_periods set limit_snapshot_cents = $1 where id = $2", [currentLimitCents, row.id]);
    return { spentCents: liveSpent, limitCents: currentLimitCents };
  }

  // Periode ist abgeschlossen, aber noch nicht eingefroren: jetzt einmalig einfrieren.
  await db.execute("update budget_periods set spent_cents_frozen = $1 where id = $2", [liveSpent, row.id]);
  return { spentCents: liveSpent, limitCents: row.limit_snapshot_cents };
}

function getBudgetPeriods(type: PeriodType, anchorIso: string): {
  current: BudgetPeriod;
  history: BudgetPeriod[];
} {
  const anchor = new Date(`${anchorIso}T00:00:00`);
  const current = getPeriodRange(type, anchor);
  const history: BudgetPeriod[] = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    let shifted = anchor;
    for (let step = 0; step < offset; step += 1) {
      shifted = shiftPeriod(type, shifted, -1);
    }
    history.push(getPeriodRange(type, shifted));
  }
  return { current, history };
}

export async function listBudgets(
  anchorIso: string,
  filter: BudgetFilter = {},
): Promise<BudgetSummary[]> {
  const db = await getDb();
  const budgets = await db.select<
    (Budget & {
      categoryName: string;
      categoryTemplateKey: string | null;
      parentName: string | null;
      parentTemplateKey: string | null;
      categoryColor: string;
    })[]
  >(
    `select
       b.*,
       c.name as categoryName,
       c.template_key as categoryTemplateKey,
       parent.name as parentName,
       parent.template_key as parentTemplateKey,
       coalesce(parent.color, c.color) as categoryColor
     from budgets b
     join categories c on c.id = b.category_id
     left join categories parent on parent.id = c.parent_id
     where b.is_deleted = 0 and c.is_deleted = 0
     order by c.sort_order asc, c.name asc`,
  );

  const summaries = await Promise.all(
    budgets.map(async (budget) => {
      const ids = await categoryIdsForBudget(budget.category_id);
      const periods = getBudgetPeriods(budget.period_type, anchorIso);
      const currentPeriod = periods.current;

      const history = await Promise.all(
        periods.history.map(async (period) => {
          const isCurrent = period.from === currentPeriod.from && period.to === currentPeriod.to;
          const { spentCents, limitCents } = await spentAndLimitForPeriod(
            budget.id,
            ids,
            period,
            filter,
            budget.limit_cents,
            isCurrent,
          );
          return { label: period.label, spentCents, limitCents };
        }),
      );
      const currentEntry = history[history.length - 1];
      const spentCents = currentEntry?.spentCents ?? 0;

      return {
        ...budget,
        spentCents,
        remainingCents: budget.limit_cents - spentCents,
        usage: budget.limit_cents > 0 ? spentCents / budget.limit_cents : 0,
        periodLabel: currentPeriod.label,
        periodFrom: currentPeriod.from,
        periodTo: currentPeriod.to,
        history,
      };
    }),
  );

  return summaries.sort((a, b) => b.usage - a.usage);
}

export async function createBudget(input: {
  category_id: number;
  limit_cents: number;
  period_type: PeriodType;
}): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "insert into budgets (category_id, limit_cents, period_type) values ($1, $2, $3)",
    [input.category_id, input.limit_cents, input.period_type],
  );
  const id = result.lastInsertId as number;
  await logOperation(db, "insert", "budgets", id, input, null);
  return id;
}

export async function updateBudget(
  id: number,
  input: { limit_cents?: number; period_type?: PeriodType },
): Promise<void> {
  const fields: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (input.limit_cents !== undefined) {
    fields.push(`limit_cents = $${i++}`);
    params.push(input.limit_cents);
  }
  if (input.period_type !== undefined) {
    fields.push(`period_type = $${i++}`);
    params.push(input.period_type);
  }
  if (fields.length === 0) return;
  const db = await getDb();
  const oldRows = await db.select<Budget[]>("select * from budgets where id = $1", [id]);
  if (!oldRows[0]) return;
  params.push(id);
  await db.execute(`update budgets set ${fields.join(", ")} where id = $${i}`, params);
  await logOperation(db, "update", "budgets", id, input, oldRows[0]);
}

export async function deleteBudget(id: number): Promise<void> {
  const db = await getDb();
  const oldRows = await db.select<Budget[]>("select * from budgets where id = $1", [id]);
  if (!oldRows[0]) return;
  await db.execute("update budgets set is_deleted = 1 where id = $1", [id]);
  await logOperation(db, "delete", "budgets", id, {}, oldRows[0]);
}

export async function listBudgetedCategoryIds(): Promise<number[]> {
  const db = await getDb();
  const rows = await db.select<{ category_id: number }[]>(
    "select category_id from budgets where is_deleted = 0",
  );
  return rows.map((row) => row.category_id);
}
