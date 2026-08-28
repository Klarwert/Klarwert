import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Download,
  Filter,
  History,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PeriodSwitcher } from "@/components/PeriodSwitcher";
import { ColumnVisibilityPopover } from "@/components/ColumnVisibilityPopover";
import { CORE_OPTIONAL_COLUMNS, buildDynamicOptionalColumns, useColumnVisibility } from "@/hooks/useColumnVisibility";
import { getPeriodRange } from "@/lib/periods";
import { usePeriodStore } from "@/stores/periodStore";
import { useGlobalFilterStore } from "@/stores/globalFilterStore";
import { useAssets } from "@/hooks/useAssets";
import { useCategories } from "@/hooks/useCategories";
import { useTags } from "@/hooks/useTags";
import { useCollections } from "@/hooks/useCollections";
import { useSparzwecke } from "@/hooks/useSparzwecke";
import { reorderRules } from "@/db/repositories/rules";
import { addTagToTransactions } from "@/db/repositories/transactions";
import { addTransactionsToCollection } from "@/db/repositories/collections";
import {
  confirmTransferPair,
  countTransactions,
  dismissTransferPair,
  listTransactions,
  type TransactionFilter,
  type TransactionWithTags,
} from "@/db/repositories/transactions";
import { getCurrentBalances } from "@/db/repositories/networth";
import { listHistory, undoSoftDelete } from "@/db/repositories/historyLog";
import { TransferSuggestionPopover } from "@/features/transaktionen/components/TransferSuggestionPopover";
import { applyBulkFieldUpdate, undoBulkFieldUpdate, undoBulkJoinAdd } from "@/lib/transactionBulkActions";
import { cn } from "@/lib/utils";
import { formatEur } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { useSettingsStore } from "@/stores/settingsStore";
import { toCsv, downloadCsv } from "@/lib/csv";
import { useTranslation } from "react-i18next";
import { TransactionDrawer } from "@/features/transaktionen/components/TransactionDrawer";
import { CreateTransactionModal } from "@/features/transaktionen/components/CreateTransactionModal";
import {
  DetailFilterModal,
  EMPTY_DETAIL_FILTER,
  type DetailFilterState,
} from "@/features/transaktionen/components/DetailFilterModal";
import { BulkActionBar } from "@/features/transaktionen/components/BulkActionBar";
import { AufraeumModus } from "@/features/transaktionen/components/AufraeumModus";
import { toast } from "sonner";

type SortBy = "booking_date" | "counterparty" | "category_id" | "amount_cents";

const UNDOABLE_ACTION_TYPES = new Set(["bulk_field_update", "bulk_join_add", "rule_reorder", "soft_delete"]);

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ChevronsUpDown className="size-3.5 opacity-40" />;
  return dir === "asc" ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />;
}

function extraField(t: TransactionWithTags, key: string): string {
  if (!t.extra_fields_json) return "";
  try {
    const obj = JSON.parse(t.extra_fields_json) as Record<string, string>;
    return obj[key] ?? "";
  } catch {
    return "";
  }
}

export function TransaktionenPage() {
  const { t } = useTranslation(["transaktionen", "app", "kategorien"]);
  const queryClient = useQueryClient();
  const selectedAccountId = useGlobalFilterStore((s) => s.selectedAccountId);
  const selectedPersonId = useGlobalFilterStore((s) => s.selectedPersonId);
  const dateDisplayFormat = useSettingsStore((s) => s.dateDisplayFormat);
  const periodType = usePeriodStore((s) => s.scopes.transaktionen.type);
  const periodAnchorIso = usePeriodStore((s) => s.scopes.transaktionen.anchorIso);
  const { data: assets } = useAssets(false);
  const { data: categories } = useCategories();
  const { data: tags } = useTags();
  const { data: collections } = useCollections();
  const { data: sparzwecke } = useSparzwecke();

  function sparzweckLabel(sparzweckId: number | null): string | null {
    if (!sparzweckId) return null;
    return sparzwecke?.find((s) => s.id === sparzweckId)?.name ?? null;
  }
  const { visible: visibleColumns, toggle: toggleColumn } = useColumnVisibility();

  const [search, setSearch] = useState("");
  const [quickUnkategorisiert, setQuickUnkategorisiert] = useState(false);
  const [quickUngeprueft, setQuickUngeprueft] = useState(false);
  const [quickTransfers, setQuickTransfers] = useState(false);
  const [quickSparen, setQuickSparen] = useState(false);
  const [detailFilter, setDetailFilter] = useState<DetailFilterState>(EMPTY_DETAIL_FILTER);
  const [filterModalOpen, setFilterModalOpen] = useState(false);

  const [sortBy, setSortBy] = useState<SortBy>("booking_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [limit, setLimit] = useState(200);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [drawerTx, setDrawerTx] = useState<TransactionWithTags | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [aufraeumOpen, setAufraeumOpen] = useState(false);

  const period = getPeriodRange(periodType, new Date(`${periodAnchorIso}T00:00:00`));
  const usingCustomRange = !!(detailFilter.customDateFrom && detailFilter.customDateTo);
  const dateFrom = usingCustomRange ? detailFilter.customDateFrom : period.from;
  const dateTo = usingCustomRange ? detailFilter.customDateTo : period.to;

  const filter: TransactionFilter = useMemo(
    () => ({
      assetId: selectedAccountId,
      personId: selectedPersonId,
      dateFrom,
      dateTo,
      search: search.trim() || undefined,
      categoryId: detailFilter.categoryId,
      tagId: detailFilter.tagId,
      sparzweckId: detailFilter.sparzweckId,
      amountMin: detailFilter.amountMin ? Number(detailFilter.amountMin) * 100 : undefined,
      amountMax: detailFilter.amountMax ? Number(detailFilter.amountMax) * 100 : undefined,
      contract: detailFilter.contract,
      transfer: detailFilter.transfer,
      saving: detailFilter.saving,
      reviewed: detailFilter.reviewed,
      excludedFromStats: detailFilter.excludedFromStats,
      uncategorized: detailFilter.uncategorized,
      quickUnkategorisiert,
      quickUngeprueft,
      quickTransfers,
      quickSparen,
      sortBy,
      sortDir,
      limit,
    }),
    [
      selectedAccountId,
      selectedPersonId,
      dateFrom,
      dateTo,
      search,
      detailFilter,
      quickUnkategorisiert,
      quickUngeprueft,
      quickTransfers,
      quickSparen,
      sortBy,
      sortDir,
      limit,
    ],
  );

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["transactions", filter],
    queryFn: () => listTransactions(filter),
  });
  const optionalColumns = useMemo(
    () => [...CORE_OPTIONAL_COLUMNS, ...buildDynamicOptionalColumns(transactions)],
    [transactions],
  );
  const { data: totalCount } = useQuery({
    queryKey: ["transactions-count", filter],
    queryFn: () => countTransactions({ ...filter, limit: undefined, offset: undefined }),
  });
  const { data: uncategorizedCount } = useQuery({
    queryKey: ["uncategorized-count", selectedAccountId, selectedPersonId, dateFrom, dateTo],
    queryFn: () =>
      countTransactions({
        assetId: selectedAccountId,
        personId: selectedPersonId,
        dateFrom,
        dateTo,
        quickUnkategorisiert: true,
      }),
  });
  const { data: filteredBalance } = useQuery({
    queryKey: ["filtered-balance", selectedAccountId, selectedPersonId, assets?.length],
    queryFn: async () => {
      if (!assets) return null;
      let list = assets;
      if (selectedPersonId) list = list.filter((a) => a.owner_ids.includes(selectedPersonId));
      if (selectedAccountId) list = list.filter((a) => a.id === selectedAccountId);
      if (list.length === 0) return 0;
      const balances = await getCurrentBalances(list);
      return [...balances.values()].reduce((sum, v) => sum + v, 0);
    },
    enabled: !!assets,
  });
  const { data: historyEntries } = useQuery({
    queryKey: ["history-log"],
    queryFn: () => listHistory(50),
    enabled: historyOpen,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["transactions-count"] });
    void queryClient.invalidateQueries({ queryKey: ["uncategorized-count"] });
    void queryClient.invalidateQueries({ queryKey: ["filtered-balance"] });
  }

  function toggleSort(column: SortBy) {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("asc");
    }
  }

  function categoryLabel(categoryId: number | null): string {
    if (!categoryId) return t("transaktionen:quickFilters.uncategorized");
    const cat = categories?.find((c) => c.id === categoryId);
    if (!cat) return "–";
    const parent = cat.parent_id ? categories?.find((c) => c.id === cat.parent_id) : null;
    return parent ? `${parent.name} · ${cat.name}` : cat.name;
  }

  function assetName(assetId: number): string {
    return assets?.find((a) => a.id === assetId)?.name ?? "–";
  }

  function tagNames(t: TransactionWithTags): string {
    return t.tag_ids
      .map((id) => tags?.find((tag) => tag.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  }

  function handleExportCsv() {
    if (!transactions) return;
    const optionalCols = optionalColumns.filter((c) => visibleColumns.has(c.key));
    const headers = [
      t("transaktionen:columns.date"),
      t("transaktionen:columns.account"),
      t("transaktionen:columns.counterparty"),
      t("transaktionen:columns.purpose"),
      t("transaktionen:columns.amount"),
      t("transaktionen:columns.category"),
      t("transaktionen:columns.tags"),
      "Flags",
      ...optionalCols.map((c) => c.label),
    ];
    const rows = transactions.map((tx) => [
      tx.booking_date,
      assetName(tx.asset_id),
      tx.counterparty,
      tx.purpose ?? "",
      (tx.amount_cents / 100).toFixed(2).replace(".", ","),
      categoryLabel(tx.category_id),
      tagNames(tx),
      [tx.is_transfer ? t("transaktionen:status.transfer") : "", tx.is_saving ? t("transaktionen:status.saving") : "", !tx.is_reviewed ? t("transaktionen:quickFilters.unreviewed") : ""]
        .filter(Boolean)
        .join(", "),
      ...optionalCols.map((c) => (c.key === "tags" ? tagNames(tx) : extraField(tx, c.key))),
    ]);
    downloadCsv(`transaktionen_${dateFrom}_${dateTo}.csv`, toCsv(headers, rows));
  }

  const activeChips: { label: string; clear: () => void }[] = [];
  if (detailFilter.categoryId) {
    activeChips.push({
      label: `${t("app:common.category")}: ${categoryLabel(detailFilter.categoryId)}`,
      clear: () => setDetailFilter((f) => ({ ...f, categoryId: null })),
    });
  }
  if (detailFilter.amountMin || detailFilter.amountMax) {
    activeChips.push({
      label: `${t("app:common.amount")} ${detailFilter.amountMin || "…"} – ${detailFilter.amountMax || "…"}`,
      clear: () => setDetailFilter((f) => ({ ...f, amountMin: "", amountMax: "" })),
    });
  }
  if (usingCustomRange) {
    activeChips.push({
      label: `${t("transaktionen:filter.period")} ${detailFilter.customDateFrom} – ${detailFilter.customDateTo}`,
      clear: () => setDetailFilter((f) => ({ ...f, customDateFrom: "", customDateTo: "" })),
    });
  }

  const allSelected = !!transactions && transactions.length > 0 && selectedIds.length === transactions.length;
  const visibleOptionalColumns = optionalColumns.filter((c) => visibleColumns.has(c.key));

  return (
    <div className="space-y-4 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl text-charcoal">{t("transaktionen:title")}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate">
            <span>{t("transaktionen:totalCount", { count: totalCount ?? 0 })}</span>
            {filteredBalance !== null && filteredBalance !== undefined && (
              <>
                <span aria-hidden="true">·</span>
                <span className="num">{formatEur(filteredBalance)}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{uncategorizedCount ?? 0} {t("transaktionen:quickFilters.uncategorized").toLowerCase()}</span>
          </div>
        </div>
        <PeriodSwitcher scope="transaktionen" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={t("transaktionen:search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button variant="ghost" size="sm" onClick={() => setFilterModalOpen(true)}>
          <Filter className="mr-1.5 size-4" />
          {t("app:common.filter")}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleExportCsv}>
          <Download className="mr-1.5 size-4" />
          {t("app:common.export")} CSV
        </Button>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          {t("transaktionen:newTransaction")}
        </Button>
        {(uncategorizedCount ?? 0) > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setAufraeumOpen(true)}>
            <Sparkles className="mr-1.5 size-4" />
            {uncategorizedCount} {t("transaktionen:aufraeumen").toLowerCase()}
          </Button>
        )}
        <Button variant="ghost" size="icon" aria-label="Änderungsverlauf" onClick={() => setHistoryOpen(true)}>
          <History className="size-4" />
        </Button>
        <ColumnVisibilityPopover columns={optionalColumns} visible={visibleColumns} onToggle={toggleColumn} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[
          { label: t("transaktionen:quickFilters.uncategorized"), active: quickUnkategorisiert, toggle: () => setQuickUnkategorisiert((v) => !v) },
          { label: t("transaktionen:quickFilters.unreviewed"), active: quickUngeprueft, toggle: () => setQuickUngeprueft((v) => !v) },
          { label: t("transaktionen:quickFilters.transfers"), active: quickTransfers, toggle: () => setQuickTransfers((v) => !v) },
          { label: t("transaktionen:quickFilters.savings"), active: quickSparen, toggle: () => setQuickSparen((v) => !v) },
        ].map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={chip.toggle}
            className={`rounded-pill border px-3 py-1 text-xs ${
              chip.active ? "border-petrol bg-petrol text-card" : "border-border text-slate"
            }`}
          >
            {chip.label}
          </button>
        ))}
        {activeChips.map((chip) => (
          <span
            key={chip.label}
            className="flex items-center gap-1 rounded-pill border border-petrol bg-petrol/10 px-3 py-1 text-xs text-petrol"
          >
            {chip.label}
            <button type="button" onClick={chip.clear} aria-label={`Filter ${chip.label} entfernen`}>
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>

      {isLoading && <p className="text-sm text-slate">{t("app:common.loading")}</p>}

      {!isLoading && (!transactions || transactions.length === 0) && (
        <p className="text-sm text-slate">
          {search || activeChips.length > 0 || quickUnkategorisiert || quickUngeprueft || quickTransfers || quickSparen
            ? t("app:common.none")
            : t("transaktionen:noResults")}
        </p>
      )}

      {!isLoading && transactions && transactions.length > 0 && (
        <div className="overflow-x-auto rounded-standard border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-slate">
                <th className="sticky left-0 z-10 w-10 bg-card p-2">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) =>
                      setSelectedIds(checked ? transactions.map((t) => t.id) : [])
                    }
                  />
                </th>
                <th className="cursor-pointer p-2" onClick={() => toggleSort("booking_date")}>
                  <span className="flex items-center gap-1">
                    {t("transaktionen:sort.date")} <SortIcon active={sortBy === "booking_date"} dir={sortDir} />
                  </span>
                </th>
                <th className="cursor-pointer p-2" onClick={() => toggleSort("counterparty")}>
                  <span className="flex items-center gap-1">
                    {t("transaktionen:sort.counterparty")} <SortIcon active={sortBy === "counterparty"} dir={sortDir} />
                  </span>
                </th>
                <th className="cursor-pointer p-2" onClick={() => toggleSort("category_id")}>
                  <span className="flex items-center gap-1">
                    {t("transaktionen:sort.category")} <SortIcon active={sortBy === "category_id"} dir={sortDir} />
                  </span>
                </th>
                <th className="cursor-pointer p-2 text-right" onClick={() => toggleSort("amount_cents")}>
                  <span className="flex items-center justify-end gap-1">
                    {t("transaktionen:sort.amount")} <SortIcon active={sortBy === "amount_cents"} dir={sortDir} />
                  </span>
                </th>
                {visibleOptionalColumns.map((c) => (
                  <th key={c.key} className="whitespace-nowrap p-2">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <ContextMenu key={tx.id}>
                  <ContextMenuTrigger asChild>
                    <tr
                      key={tx.id}
                      className={cn(
                        "group border-b border-border transition-colors hover:bg-accent/50",
                        tx.is_deleted ? "opacity-50" : "",
                      )}
                      onClick={() => setDrawerTx(tx)}
                    >
                      <td className="sticky left-0 z-10 bg-card p-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.includes(tx.id)}
                          onCheckedChange={(checked) =>
                            setSelectedIds((prev) =>
                              checked ? [...prev, tx.id] : prev.filter((id) => id !== tx.id),
                            )
                          }
                        />
                      </td>
                      <td className="p-2">{formatDate(tx.booking_date, dateDisplayFormat)}</td>
                      <td className="p-2">{tx.counterparty}</td>
                      <td className="p-2 text-slate">
                        {(() => {
                          // Transfer-/Sparen-Status steuert die Darstellung der Kategorie-Zelle statt
                          // eines separaten Empfänger-Spalten-Badges (Bugfix-Runde 3, Punkt 3). Die
                          // technischen Felder is_transfer/transfer_pair_id/is_saving bleiben unverändert
                          // für Auswertungen bestehen, nur die Anzeige wird vereinheitlicht.
                          const sparLabel = sparzweckLabel(tx.sparzweck_id);
                          const label = tx.is_saving === 1 ? `${t("transaktionen:status.saving")}${sparLabel ? `: ${sparLabel}` : ""}` : categoryLabel(tx.category_id);
                          if (tx.is_transfer === 1 && tx.transfer_status === "suggested") {
                            return (
                              <TransferSuggestionPopover
                                transactionId={tx.id}
                                label={label}
                                onConfirm={() => void confirmTransferPair(tx.id).then(invalidate)}
                                onDismiss={() => void dismissTransferPair(tx.id).then(invalidate)}
                              />
                            );
                          }
                          if (tx.is_transfer === 1 && tx.transfer_status === "confirmed") {
                            return <Badge className="bg-sage text-card hover:bg-sage">{label}</Badge>;
                          }
                          return label;
                        })()}
                      </td>
                      <td className="num p-2 text-right">{formatEur(tx.amount_cents)}</td>
                      {visibleOptionalColumns.map((c) => {
                        let val = "";
                        if (c.key === "tags") val = tagNames(tx);
                        else if (c.key === "purpose") val = tx.purpose ?? "";
                        else if (c.key === "external_id") val = tx.external_id ?? "";
                        else if (c.key === "asset_name") {
                          const asset = assets?.find(a => a.id === tx.asset_id);
                          val = asset?.name ?? "";
                        }
                        else val = extraField(tx, c.key);
                        
                        return (
                          <td key={c.key} className="whitespace-nowrap p-2 text-slate max-w-[200px] truncate" title={val}>
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>{t("transaktionen:bulkActions.setCategory")}</ContextMenuSubTrigger>
                      <ContextMenuSubContent>
                        {(categories ?? [])
                          .filter((c) => c.parent_id === null)
                          .map((c) => (
                            <ContextMenuItem
                              key={c.id}
                              onClick={() =>
                                void applyBulkFieldUpdate(
                                  [tx.id],
                                  { category_id: c.id, categorization_source: "manual" },
                                  "Kategorie zugewiesen",
                                ).then(invalidate)
                              }
                            >
                              {c.name}
                            </ContextMenuItem>
                          ))}
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>{t("transaktionen:bulkActions.addTag")}</ContextMenuSubTrigger>
                      <ContextMenuSubContent>
                        {tags?.map((tag) => (
                          <ContextMenuItem
                            key={tag.id}
                            onClick={() => void addTagToTransactions([tx.id], tag.id).then(invalidate)}
                          >
                            {tag.name}
                          </ContextMenuItem>
                        ))}
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuItem onClick={() => void applyBulkFieldUpdate([tx.id], { is_transfer: 1 }, "Als Transfer markiert").then(invalidate)}>
                      {t("transaktionen:bulkActions.markTransfer")}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => void applyBulkFieldUpdate([tx.id], { is_saving: 1 }, "Als Sparen markiert").then(invalidate)}>
                      {t("transaktionen:bulkActions.markSaving")}
                    </ContextMenuItem>
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>{t("transaktionen:bulkActions.addToCollection")}</ContextMenuSubTrigger>
                      <ContextMenuSubContent>
                        {collections?.map((c) => (
                          <ContextMenuItem
                            key={c.id}
                            onClick={() => void addTransactionsToCollection(c.id, [tx.id]).then(invalidate)}
                          >
                            {c.name}
                          </ContextMenuItem>
                        ))}
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => void applyBulkFieldUpdate([tx.id], { exclude_from_stats: 1 }, "Aus Statistik entfernt").then(invalidate)}>
                      Aus Statistik entfernen
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {transactions && totalCount && transactions.length < totalCount && (
        <Button variant="ghost" onClick={() => setLimit((l) => l + 200)}>
          {t("transaktionen:showMore", { count: 200 })}
        </Button>
      )}

      <BulkActionBar
        selectedIds={selectedIds}
        onClearSelection={() => setSelectedIds([])}
        onChanged={invalidate}
      />

      <TransactionDrawer transaction={drawerTx} onOpenChange={(o) => !o && setDrawerTx(null)} onSaved={invalidate} />
      <CreateTransactionModal
        open={createOpen}
        defaultAssetId={selectedAccountId}
        onOpenChange={setCreateOpen}
        onCreated={invalidate}
      />
      <DetailFilterModal
        open={filterModalOpen}
        initial={detailFilter}
        onOpenChange={setFilterModalOpen}
        onApply={setDetailFilter}
      />
      <AufraeumModus
        open={aufraeumOpen}
        dateFrom={dateFrom}
        dateTo={dateTo}
        assetId={selectedAccountId}
        personId={selectedPersonId}
        onOpenChange={setAufraeumOpen}
        onDone={invalidate}
      />

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="w-[390px] overflow-y-auto sm:max-w-[390px]">
          <SheetHeader>
            <SheetTitle>{t("historyPanel.title")}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {(historyEntries ?? []).map((entry) => (
              <div key={entry.id} className="rounded-klein border border-border p-2 text-xs">
                <div className="text-charcoal">{entry.description}</div>
                <div className="mt-0.5 text-slate">{entry.created_at}</div>
                {entry.is_undoable === 1 && UNDOABLE_ACTION_TYPES.has(entry.action_type) && (
                  <button
                    type="button"
                    className="mt-1 text-petrol underline"
                    onClick={() => {
                      void (async () => {
                        const payload = JSON.parse(entry.payload_json);
                        if (entry.action_type === "bulk_field_update") {
                          await undoBulkFieldUpdate(payload);
                          invalidate();
                        } else if (entry.action_type === "bulk_join_add") {
                          await undoBulkJoinAdd(payload);
                          invalidate();
                        } else if (entry.action_type === "rule_reorder") {
                          await reorderRules(payload.previousOrder);
                        } else if (entry.action_type === "soft_delete") {
                          await undoSoftDelete(payload);
                          void queryClient.invalidateQueries({ queryKey: [payload.table] });
                        }
                        void queryClient.invalidateQueries({ queryKey: ["history-log"] });
                        toast.success(t("historyPanel.undone"));
                      })();
                    }}
                  >
                    {t("historyPanel.undo")}
                  </button>
                )}
              </div>
            ))}
            {(!historyEntries || historyEntries.length === 0) && (
              <p className="text-sm text-slate">{t("historyPanel.empty")}</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
