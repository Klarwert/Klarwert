import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  Eye,
  FolderKanban,
  Gauge,
  Maximize2,
  PiggyBank,
  Receipt,
  Settings2,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { PeriodSwitcher } from "@/components/PeriodSwitcher";
import { useGlobalFilterStore } from "@/stores/globalFilterStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { usePeriodStore } from "@/stores/periodStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { getPeriodRange, shiftPeriod, type PeriodType } from "@/lib/periods";
import { formatDate } from "@/lib/dates";
import { translateCategoryName } from "@/hooks/useCategories";
import { formatEur } from "@/lib/money";
import {
  createCashflowBarOption,
  createDonutOption,
  createOverviewSankeyOption,
} from "@/lib/charts/theme";
import {
  getCashflowSeries,
  getCategorizationProgress,
  getDashboardFreshness,
  getDashboardKpis,
  getFocusCollection,
  getPersonComparison,
  getPlannedContracts,
  getSavingByPurpose,
  getTopCategoryExpenses,
  type CategoryExpensePoint,
  type PlannedContractPoint,
} from "@/db/repositories/dashboard";

import { useTranslation } from "react-i18next";

const WIDGETS = [
  "kpis",
  "money_flow",
  "categorization",
  "collection_focus",
  "category_expenses",
  "cashflow",
  "saving_by_purpose",
  "person_comparison",
  "planned_contracts",
] as const;

type WidgetKey = (typeof WIDGETS)[number];



function percent(value: number): string {
  return `${Math.round(value * 100)} %`;
}

function delta(current: number, previous: number): string {
  if (previous === 0 && current === 0) return "0 %";
  if (previous === 0) return "+100 %";
  const change = (current - previous) / Math.abs(previous);
  return `${change >= 0 ? "+" : ""}${Math.round(change * 100)} %`;
}

function deltaDetailed(current: number, previous: number): string {
  const diff = current - previous;
  const eurStr = formatEur(Math.abs(diff));
  const signedEur = diff >= 0 ? `+${eurStr}` : `-${eurStr}`;
  if (previous === 0 && current === 0) return `${signedEur} (0 %)`;
  if (previous === 0) return `${signedEur} (+100 %)`;
  const change = (current - previous) / Math.abs(previous);
  const pctStr = `${change >= 0 ? "+" : ""}${Math.round(change * 100)} %`;
  return `${signedEur} (${pctStr})`;
}

function periodAnchors(type: PeriodType, anchorIso: string, count = 6) {
  const anchor = new Date(`${anchorIso}T00:00:00`);
  const anchors: { label: string; from: string; to: string }[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    let shifted = anchor;
    for (let step = 0; step < offset; step += 1) {
      shifted = shiftPeriod(type, shifted, -1);
    }
    anchors.push(getPeriodRange(type, shifted));
  }
  return anchors;
}

function addInterval(iso: string | null, interval: PlannedContractPoint["interval"]): string | null {
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00`);
  if (interval === "monthly") date.setMonth(date.getMonth() + 1);
  if (interval === "quarterly") date.setMonth(date.getMonth() + 3);
  if (interval === "yearly") date.setFullYear(date.getFullYear() + 1);
  if (interval === "irregular") return null;
  return date.toISOString().slice(0, 10);
}

function KpiCard({
  icon: Icon,
  label,
  value,
  change,
  comparisonLabel,
  tone,
  t,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  change: string;
  comparisonLabel: string;
  tone: "sage" | "brick" | "gold" | "petrol";
  t: any;
}) {
  const toneClass = {
    sage: "text-sage bg-sage/10",
    brick: "text-brick bg-brick/10",
    gold: "text-gold bg-gold/10",
    petrol: "text-petrol bg-petrol/10",
  }[tone];

  return (
    <div className="rounded-standard border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate">{label}</span>
        <span className={`inline-flex size-8 items-center justify-center rounded-klein ${toneClass}`}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-3 font-heading text-2xl text-charcoal">{value}</div>
      <div className="mt-1 text-xs text-slate">{t("uebersicht:trend.vs", { label: comparisonLabel, change })}</div>
    </div>
  );
}

function Widget({
  title,
  icon: Icon,
  children,
  className = "",
  action,
}: {
  title: string;
  icon: typeof TrendingUp;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`rounded-standard border border-border bg-card p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-petrol" />
          <h2 className="text-sm font-semibold text-charcoal">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ExpenseList({ data }: { data: CategoryExpensePoint[] }) {
  const { t } = useTranslation(["uebersicht", "app"]);
  const total = data.reduce((sum, item) => sum + item.cents, 0);
  if (data.length === 0) return <p className="text-sm text-slate">{t("uebersicht:noData")}</p>;
  return (
    <div className="space-y-2">
      {data.map((item) => {
        const share = total > 0 ? (item.cents / total) * 100 : 0;
        return (
          <div key={`${item.categoryId ?? "none"}-${item.name}`}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-charcoal">{item.name}</span>
              <span className="num shrink-0 text-slate">{formatEur(item.cents)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-paper">
              <div
                className="h-full rounded-full"
                style={{ width: `${share}%`, backgroundColor: item.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function UebersichtPage() {
  const { t } = useTranslation(["uebersicht", "app"]);
  const navigate = useNavigationStore((s) => s.navigate);
  const selectedAccountId = useGlobalFilterStore((s) => s.selectedAccountId);
  const selectedPersonId = useGlobalFilterStore((s) => s.selectedPersonId);
  const type = usePeriodStore((s) => s.scopes.uebersicht.type);
  const anchorIso = usePeriodStore((s) => s.scopes.uebersicht.anchorIso);
  const dateDisplayFormat = useSettingsStore((s) => s.dateDisplayFormat);
  const [comparisonMode, setComparisonMode] = useState<"prev_period" | "prev_year">("prev_period");
  const [cashflowCount, setCashflowCount] = useState<number>(6);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sankeyFullscreen, setSankeyFullscreen] = useState(false);
  const [visibleWidgets, setVisibleWidgets] = useState<Set<WidgetKey>>(() => new Set(WIDGETS));

  const period = getPeriodRange(type, new Date(`${anchorIso}T00:00:00`));
  const filter = useMemo(
    () => ({
      assetId: selectedAccountId,
      personId: selectedPersonId,
      from: period.from,
      to: period.to,
    }),
    [selectedAccountId, selectedPersonId, period.from, period.to],
  );
  const cashflowPeriods = useMemo(() => periodAnchors(type, anchorIso, cashflowCount), [type, anchorIso, cashflowCount]);

  const { data: kpis } = useQuery({
    queryKey: ["dashboard-kpis", filter, type, comparisonMode],
    queryFn: () => getDashboardKpis(filter, type, comparisonMode),
  });
  const { data: progress } = useQuery({
    queryKey: ["dashboard-categorization-progress"],
    queryFn: getCategorizationProgress,
  });
  const { data: categoryExpenses } = useQuery({
    queryKey: ["dashboard-category-expenses", filter],
    queryFn: () => getTopCategoryExpenses(filter, 5),
  });
  const { data: cashflow } = useQuery({
    queryKey: ["dashboard-cashflow", selectedAccountId, selectedPersonId, cashflowPeriods],
    queryFn: () =>
      getCashflowSeries(
        { assetId: selectedAccountId, personId: selectedPersonId },
        cashflowPeriods,
      ),
  });
  const { data: savingByPurpose } = useQuery({
    queryKey: ["dashboard-saving-by-purpose", filter],
    queryFn: () => getSavingByPurpose(filter),
  });
  const { data: personComparison } = useQuery({
    queryKey: ["dashboard-person-comparison", filter],
    queryFn: () => getPersonComparison(filter),
  });
  const { data: plannedContracts } = useQuery({
    queryKey: ["dashboard-planned-contracts"],
    queryFn: () => getPlannedContracts(6),
  });
  const { data: freshness } = useQuery({
    queryKey: ["dashboard-freshness", selectedAccountId, selectedPersonId],
    queryFn: () => getDashboardFreshness({ assetId: selectedAccountId, personId: selectedPersonId }),
  });
  const { data: focusCollection } = useQuery({
    queryKey: ["dashboard-focus-collection"],
    queryFn: getFocusCollection,
  });

  const totalTx = progress?.total ?? 0;
  const uncategorized = progress?.uncategorized ?? 0;
  const categorizedShare = totalTx > 0 ? ((totalTx - uncategorized) / totalTx) * 100 : 0;
  const categoryChart = categoryExpenses && categoryExpenses.length > 0
    ? createDonutOption({
      data: categoryExpenses.map((item) => ({
        name: item.name,
        value: item.cents,
        color: item.color,
      })),
    })
    : null;
  const cashflowChart = cashflow
    ? createCashflowBarOption({
      labels: cashflow.map((point) => point.label),
      incomeValues: cashflow.map((point) => point.incomeCents),
      expenseValues: cashflow.map((point) => point.expensesCents),
    })
    : null;
  const sankeyBase = kpis && categoryExpenses && kpis.incomeCents > 0
    ? {
      incomeCents: kpis.incomeCents,
      savingCents: kpis.savingCents,
      expenseCategories: categoryExpenses.map((item) => ({
        name: item.name,
        cents: item.cents,
        color: item.color,
      })),
    }
    : null;
  const sankeyChart = sankeyBase ? createOverviewSankeyOption({ ...sankeyBase, showToolbox: false }) : null;
  const sankeyFullscreenChart = sankeyBase ? createOverviewSankeyOption({ ...sankeyBase, showToolbox: true }) : null;

  const totalCashflowIncome = useMemo(
    () => cashflow?.reduce((sum, p) => sum + p.incomeCents, 0) ?? 0,
    [cashflow],
  );
  const totalCashflowExpenses = useMemo(
    () => cashflow?.reduce((sum, p) => sum + p.expensesCents, 0) ?? 0,
    [cashflow],
  );
  const totalNetCashflow = totalCashflowIncome - totalCashflowExpenses;

  const compLabel = comparisonMode === "prev_year" ? t("uebersicht:trend.vsLastYear") : t("uebersicht:trend.vsLastPeriod");

  function toggleWidget(key: WidgetKey) {
    setVisibleWidgets((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl text-charcoal">{t("uebersicht:title")}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate">
            <span>{period.label}</span>
            {freshness?.oldestLastImportAt && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {t("uebersicht:freshness.dataUntil", { date: formatDate(freshness.oldestLastImportAt.slice(0, 10), dateDisplayFormat) })}
                </span>
              </>
            )}
            {freshness?.latestImportAt && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {t("uebersicht:freshness.lastImport", { date: formatDate(freshness.latestImportAt.slice(0, 10), dateDisplayFormat) })}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSwitcher scope="uebersicht" />
          <div className="inline-flex rounded-klein border border-border bg-card">
            <button
              type="button"
              onClick={() => setComparisonMode("prev_period")}
              className={`px-3 py-1.5 text-xs transition-colors ${
                comparisonMode === "prev_period" ? "bg-petrol text-card" : "text-charcoal hover:bg-accent"
              }`}
            >
              {t("uebersicht:trend.vsLastPeriod")}
            </button>
            <button
              type="button"
              onClick={() => setComparisonMode("prev_year")}
              className={`border-l border-border px-3 py-1.5 text-xs transition-colors ${
                comparisonMode === "prev_year" ? "bg-petrol text-card" : "text-charcoal hover:bg-accent"
              }`}
            >
              {t("uebersicht:trend.vsLastYear")}
            </button>
          </div>
          <Button variant="ghost" onClick={() => setSettingsOpen(true)}>
            <Eye className="size-4" />
            {t("app:common.actions")}
          </Button>
        </div>
      </div>

      {visibleWidgets.has("kpis") && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={ArrowUpRight}
            label={t("uebersicht:income")}
            value={formatEur(kpis?.incomeCents ?? 0)}
            change={deltaDetailed(kpis?.incomeCents ?? 0, kpis?.previousIncomeCents ?? 0)}
            t={t}
            comparisonLabel={compLabel}
            tone="sage"
          />
          <KpiCard
            icon={ArrowDownRight}
            label={t("uebersicht:expenses")}
            value={formatEur(kpis?.expensesCents ?? 0)}
            change={deltaDetailed(kpis?.expensesCents ?? 0, kpis?.previousExpensesCents ?? 0)}
            t={t}
            comparisonLabel={compLabel}
            tone="brick"
          />
          <KpiCard
            icon={PiggyBank}
            label={t("uebersicht:balance")}
            value={formatEur(kpis?.savingCents ?? 0)}
            change={deltaDetailed(kpis?.savingCents ?? 0, kpis?.previousSavingCents ?? 0)}
            t={t}
            comparisonLabel={compLabel}
            tone="petrol"
          />
          <KpiCard
            icon={Gauge}
            label={t("uebersicht:savings")}
            value={percent(kpis?.savingRate ?? 0)}
            change={delta(kpis?.savingRate ?? 0, kpis?.previousSavingRate ?? 0)}
            t={t}
            comparisonLabel={compLabel}
            tone="gold"
          />
        </div>
      )}

      {visibleWidgets.has("money_flow") && (
        <Widget
          title={t("uebersicht:widgets.money_flow")}
          icon={TrendingUp}
          className="min-h-[250px]"
          action={
            sankeyChart && (
              <Button variant="ghost" size="icon" onClick={() => setSankeyFullscreen(true)} aria-label="Vollbild">
                <Maximize2 className="size-4" />
              </Button>
            )
          }
        >
          {sankeyChart ? (
            <ReactECharts option={sankeyChart} style={{ height: 220, width: "100%" }} opts={{ renderer: "svg" }} />
          ) : (
            <p className="text-sm text-slate">{t("uebersicht:noIncome")}</p>
          )}
        </Widget>
      )}

      <Dialog open={sankeyFullscreen} onOpenChange={setSankeyFullscreen}>
        <DialogContent className="max-w-[95vw] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{t("uebersicht:widgets.money_flow")}</DialogTitle>
          </DialogHeader>
          {sankeyFullscreenChart && (
            <ReactECharts option={sankeyFullscreenChart} style={{ height: "75vh", width: "100%" }} opts={{ renderer: "svg" }} />
          )}
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="space-y-4">
          {visibleWidgets.has("category_expenses") && (
            <Widget
              title={t("uebersicht:widgets.category_expenses")}
              icon={Receipt}
              className="min-h-[320px]"
              action={
                <Button variant="ghost" size="sm" onClick={() => navigate("transaktionen")}>
                  Öffnen
                </Button>
              }
            >
              <div className="grid gap-4 md:grid-cols-[minmax(220px,0.9fr)_minmax(220px,1.1fr)]">
                <div className="h-[230px]">
                  {categoryChart ? (
                    <ReactECharts option={categoryChart} style={{ height: "100%", width: "100%" }} opts={{ renderer: "svg" }} />
                  ) : (
                    <p className="pt-6 text-sm text-slate">{t("uebersicht:noExpenses")}</p>
                  )}
                </div>
                <ExpenseList data={categoryExpenses ?? []} />
              </div>
            </Widget>
          )}

          {visibleWidgets.has("cashflow") && (
            <Widget
              title={`${t("uebersicht:widgets.cashflow")} (${cashflowCount})`}
              icon={TrendingUp}
              className="min-h-[300px]"
              action={
                <div className="inline-flex rounded-klein border border-border text-xs">
                  {[3, 6, 12, 24].map((cnt, i) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setCashflowCount(cnt)}
                      className={`px-2.5 py-1 font-medium transition-colors ${i > 0 ? "border-l border-border" : ""} ${
                        cashflowCount === cnt ? "bg-petrol text-card" : "text-charcoal hover:bg-accent"
                      }`}
                    >
                      {cnt}
                    </button>
                  ))}
                </div>
              }
            >
              {cashflowChart && (
                <>
                  <div className="mb-2 flex items-center justify-between text-xs text-slate">
                    <span>
                      {t("uebersicht:totalIncome")}: <strong className="text-sage">{formatEur(totalCashflowIncome)}</strong> · {t("uebersicht:totalExpenses")}:{" "}
                      <strong className="text-brick">{formatEur(totalCashflowExpenses)}</strong>
                    </span>
                    <span>
                      Netto-Cashflow:{" "}
                      <strong className={totalNetCashflow >= 0 ? "text-sage" : "text-brick"}>
                        {totalNetCashflow >= 0 ? "+" : ""}
                        {formatEur(totalNetCashflow)}
                      </strong>
                    </span>
                  </div>
                  <ReactECharts option={cashflowChart} style={{ height: 240, width: "100%" }} opts={{ renderer: "svg" }} />
                </>
              )}
            </Widget>
          )}
        </div>

        <div className="space-y-4">
          {visibleWidgets.has("categorization") && (
            <Widget
              title={t("uebersicht:widgets.categorization")}
              icon={Gauge}
              action={
                <Button variant="ghost" size="sm" onClick={() => navigate("transaktionen")}>
                  {uncategorized} aufräumen
                </Button>
              }
            >
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="font-heading text-2xl text-charcoal">{Math.round(categorizedShare)} %</div>
                  <p className="text-sm text-slate">
                    {totalTx - uncategorized} von {totalTx} Buchungen kategorisiert
                  </p>
                </div>
                <span className="rounded-klein bg-gold/10 px-2.5 py-1 text-sm font-medium text-gold">
                  {uncategorized} offen
                </span>
              </div>
              <Progress className="mt-4 bg-paper" value={categorizedShare} />
            </Widget>
          )}

          {visibleWidgets.has("collection_focus") && focusCollection && (
            <Widget
              title={t("uebersicht:widgets.collection_focus")}
              icon={FolderKanban}
              action={
                <Button variant="ghost" size="sm" onClick={() => navigate("sammlungen")}>
                  Öffnen
                </Button>
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-charcoal">{focusCollection.name}</div>
                  <p className="text-sm text-slate">{focusCollection.count} {t("uebersicht:transactions")}</p>
                </div>
                <div className="num text-right font-semibold text-charcoal">
                  {formatEur(focusCollection.sumCents)}
                </div>
              </div>
              {focusCollection.isGoal && focusCollection.targetCents && (
                <Progress
                  className="mt-4 bg-paper"
                  value={Math.min(100, Math.abs(focusCollection.sumCents) / focusCollection.targetCents * 100)}
                />
              )}
            </Widget>
          )}

          {visibleWidgets.has("saving_by_purpose") && (
            <Widget title={t("uebersicht:widgets.saving_by_purpose")} icon={PiggyBank}>
              <div className="space-y-3">
                {(savingByPurpose ?? []).length === 0 && (
                  <p className="text-sm text-slate">{t("uebersicht:noSavings")}</p>
                )}
                {(savingByPurpose ?? []).map((item) => {
                  const value = item.targetCents ? Math.min(100, (item.cents / item.targetCents) * 100) : 100;
                  return (
                    <div key={`${item.sparzweckId ?? "none"}-${item.name}`}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-charcoal">{item.name}</span>
                        <span className="num shrink-0 text-slate">{formatEur(item.cents)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-paper">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${value}%`, backgroundColor: item.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Widget>
          )}

          {visibleWidgets.has("person_comparison") && (
            <Widget title={t("uebersicht:widgets.person_comparison")} icon={Settings2}>
              <div className="space-y-2">
                {(personComparison ?? []).length === 0 && (
                  <p className="text-sm text-slate">{t("uebersicht:noExpenses")}</p>
                )}
                {(personComparison ?? []).map((person) => (
                  <div key={person.personId} className="flex items-center justify-between gap-3 rounded-klein bg-paper px-3 py-2">
                    <span className="truncate text-sm text-charcoal">{person.name}</span>
                    <span className="num text-sm font-medium text-charcoal">{formatEur(person.cents)}</span>
                  </div>
                ))}
              </div>
            </Widget>
          )}

          {visibleWidgets.has("planned_contracts") && (
            <Widget
              title={t("uebersicht:widgets.planned_contracts")}
              icon={CalendarClock}
              action={
                <Button variant="ghost" size="sm" onClick={() => navigate("vertraege")}>
                  Verträge
                </Button>
              }
            >
              <div className="space-y-2">
                {(plannedContracts ?? []).length === 0 && (
                  <p className="text-sm text-slate">{t("uebersicht:noPlanned")}</p>
                )}
                {(plannedContracts ?? []).map((contract) => {
                  const dueDate = addInterval(contract.lastPaymentDate, contract.interval);
                  return (
                    <div key={contract.id} className="flex items-center justify-between gap-3 rounded-klein bg-paper px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-charcoal">{contract.name}</div>
                        <div className="truncate text-xs text-slate">
                          {contract.categoryName
                            ? translateCategoryName({ name: contract.categoryName, template_key: contract.categoryTemplateKey })
                            : t("uebersicht:noCategory")}
                          {dueDate ? ` · ${formatDate(dueDate, dateDisplayFormat)}` : ""}
                        </div>
                      </div>
                      <span className="num shrink-0 text-sm font-semibold text-charcoal">
                        {formatEur(contract.amountCents)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Widget>
          )}
        </div>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("uebersicht:toggleWidgets")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {WIDGETS.map((key) => (
              <label key={key} className="flex items-center gap-3 rounded-klein border border-border px-3 py-2 text-sm text-charcoal">
                <Checkbox checked={visibleWidgets.has(key)} onCheckedChange={() => toggleWidget(key)} />
                <span>{t(`uebersicht:widgets.${key}`)}</span>
              </label>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
