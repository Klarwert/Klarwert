import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Download, Landmark, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/dates";
import { formatEur } from "@/lib/money";
import { cn } from "@/lib/utils";
import { toCsv, downloadCsv } from "@/lib/csv";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  getSteuerTransactions,
  listSteuerThemen,
  listSteuerYears,
  type SteuerThema,
  type SteuerTransaction,
} from "@/db/repositories/steuer";
import { SteuerThemaEditorModal } from "@/features/steuer/SteuerThemaEditorModal";
import { TransactionDrawer } from "@/features/transaktionen/components/TransactionDrawer";

function categoryLabel(tx: SteuerTransaction, t: any): string {
  if (!tx.categoryName) return t("uncategorized");
  return tx.parentCategoryName ? `${tx.parentCategoryName} · ${tx.categoryName}` : tx.categoryName;
}

function exportTransactions(filename: string, transactions: SteuerTransaction[], headers: string[], t: any) {
  const rows = transactions.map((tx) => [
    tx.booking_date,
    tx.assetName,
    tx.counterparty,
    tx.purpose ?? "",
    (tx.amount_cents / 100).toFixed(2).replace(".", ","),
    categoryLabel(tx, t),
    tx.contractName ?? "",
    tx.contractYearSumCents !== null && tx.contractYearSumCents !== undefined
      ? (tx.contractYearSumCents / 100).toFixed(2).replace(".", ",")
      : "",
  ]);
  downloadCsv(filename, toCsv(headers, rows));
}

function TopicBlock({
  thema,
  transactions,
  expanded,
  onToggle,
  onEdit,
  onSelectTransaction,
  dateDisplayFormat,
  t,
}: {
  thema: SteuerThema;
  transactions: SteuerTransaction[];
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onSelectTransaction: (tx: SteuerTransaction) => void;
  dateDisplayFormat: "dd.MM.yyyy" | "yyyy-MM-dd";
  t: any;
}) {
  const sum = transactions.reduce((total, tx) => total + tx.amount_cents, 0);

  return (
    <section className="rounded-standard border border-border bg-card">
      <div className="flex items-center justify-between gap-3 p-4">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={onToggle}>
          <ChevronDown className={cn("size-4 shrink-0 text-slate transition-transform", !expanded && "-rotate-90")} />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-charcoal">{thema.name}</h2>
            <p className="text-xs text-slate">
              {t("summary", { count: transactions.length, sum: formatEur(sum) })}
            </p>
          </div>
        </button>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("export", { name: thema.name })}
            onClick={() => exportTransactions(`steuer-${thema.name.toLowerCase().replace(/\s+/g, "-")}.csv`, transactions, [t("headers.date"), t("headers.account"), t("headers.counterparty"), t("headers.purpose"), t("headers.amount"), t("headers.category"), t("headers.contract"), t("headers.contractYearSum")], t)}
          >
            <Download className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={t("edit", { name: thema.name })} onClick={onEdit}>
            <Pencil className="size-4" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 pb-4">
          {transactions.length === 0 ? (
            <p className="pt-4 text-sm text-slate">{t("noTransactions")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-xs text-slate">
                  <tr className="border-b border-border">
                    <th className="py-2 text-left font-medium">{t("headers.date")}</th>
                    <th className="py-2 text-left font-medium">{t("headers.counterparty")}</th>
                    <th className="py-2 text-left font-medium">{t("headers.category")}</th>
                    <th className="py-2 text-left font-medium">{t("headers.contract")}</th>
                    <th className="py-2 text-right font-medium">{t("headers.amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr
                      key={tx.id}
                      className="cursor-pointer border-b border-border hover:bg-paper/50 last:border-0"
                      onClick={() => onSelectTransaction(tx)}
                    >
                      <td className="py-2 text-slate">{formatDate(tx.booking_date, dateDisplayFormat)}</td>
                      <td className="py-2 text-charcoal">
                        <div>{tx.counterparty}</div>
                        {tx.purpose && <div className="max-w-[320px] truncate text-xs text-slate">{tx.purpose}</div>}
                      </td>
                      <td className="py-2 text-slate">{categoryLabel(tx, t)}</td>
                      <td className="py-2 text-slate">
                        {tx.contractName ? (
                          <>
                            {tx.contractName}
                            <div className="text-xs">
                              {t("contractYearSum", { sum: formatEur(tx.contractYearSumCents ?? 0) })}
                            </div>
                          </>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="num py-2 text-right font-medium text-charcoal">{formatEur(tx.amount_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function SteuerPage() {
  const { t } = useTranslation(["steuer", "app"]);
  const queryClient = useQueryClient();
  const dateDisplayFormat = useSettingsStore((s) => s.dateDisplayFormat);
  const previousYear = new Date().getFullYear() - 1;
  const [year, setYear] = useState(previousYear);
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SteuerThema | null>(null);
  const [drawerTx, setDrawerTx] = useState<SteuerTransaction | null>(null);
  const [showAllHits, setShowAllHits] = useState(false);

  const { data: years } = useQuery({
    queryKey: ["steuer-years"],
    queryFn: listSteuerYears,
  });
  const { data: themen } = useQuery({
    queryKey: ["steuer-themen"],
    queryFn: listSteuerThemen,
  });
  const { data: topicTransactions } = useQuery({
    queryKey: ["steuer-topic-transactions", year, themen?.map((thema) => thema.id)],
    queryFn: async () => {
      const entries = await Promise.all(
        (themen ?? []).map(async (thema) => [thema.id, await getSteuerTransactions(year, thema)] as const),
      );
      return Object.fromEntries(entries);
    },
    enabled: !!themen,
  });
  const { data: searchResults } = useQuery({
    queryKey: ["steuer-search", year, search],
    queryFn: () => getSteuerTransactions(year, null, search),
  });

  const allTopicTransactions = useMemo(
    () => Object.values(topicTransactions ?? {}).flat(),
    [topicTransactions],
  );
  const topicTotal = allTopicTransactions.reduce((sum, tx) => sum + tx.amount_cents, 0);
  const visibleYears = years && years.length > 0 ? years : [previousYear];

  const searchTotal = useMemo(
    () => (searchResults ?? []).reduce((sum, tx) => sum + tx.amount_cents, 0),
    [searchResults],
  );

  const visibleSearchResults = useMemo(() => {
    if (!searchResults) return [];
    if (showAllHits) return searchResults;
    return searchResults.slice(0, 20);
  }, [searchResults, showAllHits]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["steuer-themen"] });
    void queryClient.invalidateQueries({ queryKey: ["steuer-topic-transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["steuer-search"] });
  }

  function toggleExpanded(id: number) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl text-charcoal">{t("title")}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate">
            <span>{year}</span>
            <span aria-hidden="true">·</span>
            <span>{themen?.length ?? 0} {t("topics")}</span>
            <span aria-hidden="true">·</span>
            <span className="num">{formatEur(topicTotal)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
            <SelectTrigger className="w-[120px]" aria-label={t("yearSelect")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {visibleYears.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            onClick={() => exportTransactions(`steuer-${year}-gesamt.csv`, searchResults ?? [], [t("headers.date"), t("headers.account"), t("headers.counterparty"), t("headers.purpose"), t("headers.amount"), t("headers.category"), t("headers.contract"), t("headers.contractYearSum")], t)}
          >
            <Download className="size-4" />
            {t("exportAll")}
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
          >
            <Plus className="size-4" />
            {t("topicAdd")}
          </Button>
        </div>
      </div>

      <div className="relative max-w-lg">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setShowAllHits(false);
          }}
          placeholder={t("search.placeholder")}
        />
      </div>

      <div className="space-y-3">
        {(themen ?? []).map((thema) => (
          <TopicBlock
            key={thema.id}
            thema={thema}
            transactions={topicTransactions?.[thema.id] ?? []}
            expanded={expandedIds.has(thema.id)}
            onToggle={() => toggleExpanded(thema.id)}
            onEdit={() => {
              setEditing(thema);
              setEditorOpen(true);
            }}
            onSelectTransaction={(tx) => setDrawerTx(tx)}
            dateDisplayFormat={dateDisplayFormat}
            t={t}
          />
        ))}
        {(!themen || themen.length === 0) && (
          <div className="rounded-standard border border-border bg-card p-8 text-center">
            <Landmark className="mx-auto size-8 text-petrol" />
            <h2 className="mt-3 font-heading text-lg text-charcoal">{t("noTopics")}</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate">
              {t("noTopicsDesc")}
            </p>
          </div>
        )}
      </div>

      <section className="rounded-standard border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-charcoal">{t("search.title")}</h2>
          <span className="text-xs text-slate">
            {t("summary", { count: searchResults?.length ?? 0, sum: formatEur(searchTotal) })}
          </span>
        </div>
        <div className="space-y-1">
          {visibleSearchResults.map((tx) => (
            <div
              key={tx.id}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-klein bg-paper px-3 py-2 text-sm transition-colors hover:bg-paper/80"
              onClick={() => setDrawerTx(tx)}
            >
              <div className="min-w-0">
                <div className="truncate text-charcoal">
                  {formatDate(tx.booking_date, dateDisplayFormat)} · {tx.counterparty}
                </div>
                <div className="truncate text-xs text-slate">{categoryLabel(tx, t)}</div>
              </div>
              <span className="num shrink-0 font-medium text-charcoal">{formatEur(tx.amount_cents)}</span>
            </div>
          ))}
          {(searchResults ?? []).length === 0 && (
            <p className="text-sm text-slate">{t("search.noResults")}</p>
          )}
          {(searchResults ?? []).length > 20 && !showAllHits && (
            <div className="pt-2 text-center">
              <Button variant="ghost" size="sm" onClick={() => setShowAllHits(true)}>
                {t("search.allResults", { count: (searchResults ?? []).length })}
              </Button>
            </div>
          )}
        </div>
      </section>

      <SteuerThemaEditorModal
        open={editorOpen}
        thema={editing}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditing(null);
        }}
        onSaved={invalidate}
      />

      {drawerTx && (
        <TransactionDrawer
          transaction={drawerTx}
          onOpenChange={(open: boolean) => !open && setDrawerTx(null)}
          onSaved={invalidate}
        />
      )}
    </div>
  );
}
