import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/DateInput";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAssets } from "@/hooks/useAssets";
import { useCategories, groupCategories } from "@/hooks/useCategories";
import {
  addTransactionsToCollection,
  previewBulkAdd,
  BULK_ADD_MAX_RESULTS,
  type BulkAddCandidate,
} from "@/db/repositories/collections";
import { todayIso, formatDate } from "@/lib/dates";
import { formatEur } from "@/lib/money";
import { useSettingsStore } from "@/stores/settingsStore";
import { toast } from "sonner";

interface AddByPeriodModalProps {
  open: boolean;
  collectionId: number;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}

/** Kompakte Kategorie-Checkbox-Liste (Ober-/Unterkategorien), analog SteuerThemaEditorModal. */
function CategoryCheckboxTree({
  selected,
  onToggle,
}: {
  selected: number[];
  onToggle: (id: number, checked: boolean) => void;
}) {
  const { data: categories } = useCategories();
  const groups = groupCategories(categories ?? []);
  return (
    <div className="max-h-[160px] overflow-y-auto rounded-klein border border-border p-2">
      {groups.map((group) => (
        <div key={group.parent.id} className="mb-2 last:mb-0">
          <label className="flex items-center gap-2 text-xs font-medium text-charcoal">
            <Checkbox checked={selected.includes(group.parent.id)} onCheckedChange={(c) => onToggle(group.parent.id, c === true)} />
            {group.parent.name}
          </label>
          <div className="mt-1 grid grid-cols-2 gap-1 pl-5">
            {group.options
              .filter((o) => o.category.id !== group.parent.id)
              .map((o) => (
                <label key={o.category.id} className="flex items-center gap-2 text-xs text-slate">
                  <Checkbox checked={selected.includes(o.category.id)} onCheckedChange={(c) => onToggle(o.category.id, c === true)} />
                  {o.category.name}
                </label>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AddByPeriodModal({ open, collectionId, onOpenChange, onAdded }: AddByPeriodModalProps) {
  const { t } = useTranslation("sammlungen");
  const { data: assets } = useAssets(false);
  const dateDisplayFormat = useSettingsStore((s) => s.dateDisplayFormat);
  const [step, setStep] = useState<"filter" | "results">("filter");
  const [dateFrom, setDateFrom] = useState(todayIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [assetId, setAssetId] = useState<number | null>(null);
  const [includeCategoryIds, setIncludeCategoryIds] = useState<number[]>([]);
  const [excludeCategoryIds, setExcludeCategoryIds] = useState<number[]>([]);
  const [candidates, setCandidates] = useState<BulkAddCandidate[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function toggleInclude(id: number, checked: boolean) {
    setIncludeCategoryIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  }
  function toggleExclude(id: number, checked: boolean) {
    setExcludeCategoryIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  async function handleContinue() {
    setLoading(true);
    try {
      const result = await previewBulkAdd(collectionId, dateFrom, dateTo, assetId, includeCategoryIds, excludeCategoryIds);
      setCandidates(result.candidates);
      setTotalMatches(result.totalMatches);
      setSelectedIds(new Set(result.candidates.map((c) => c.id)));
      setStep("results");
    } finally {
      setLoading(false);
    }
  }

  function toggleRow(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = candidates.length > 0 && selectedIds.size === candidates.length;

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const ids = [...selectedIds];
      await addTransactionsToCollection(collectionId, ids);
      const newCount = candidates.filter((c) => selectedIds.has(c.id) && !c.alreadyIncluded).length;
      toast.success(t("addByPeriodForm.addedToast", { count: newCount }));
      onAdded();
      resetAndClose();
    } finally {
      setSubmitting(false);
    }
  }

  function resetAndClose() {
    setStep("filter");
    setCandidates([]);
    setSelectedIds(new Set());
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetAndClose();
        else onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            {step === "filter" ? t("addByPeriodForm.titleFilter") : t("addByPeriodForm.titleResults", { count: candidates.length })}
          </DialogTitle>
        </DialogHeader>

        {step === "filter" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="add-from">{t("addByPeriodForm.from")}</Label>
                <DateInput id="add-from" value={dateFrom} onChange={setDateFrom} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-to">{t("addByPeriodForm.to")}</Label>
                <DateInput id="add-to" value={dateTo} onChange={setDateTo} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("addByPeriodForm.account")}</Label>
              <Select value={assetId ? String(assetId) : "all"} onValueChange={(v) => setAssetId(v === "all" ? null : Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("addByPeriodForm.allAccounts")}</SelectItem>
                  {assets?.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("addByPeriodForm.includeCategories")}</Label>
              <CategoryCheckboxTree selected={includeCategoryIds} onToggle={toggleInclude} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("addByPeriodForm.excludeCategories")}</Label>
              <CategoryCheckboxTree selected={excludeCategoryIds} onToggle={toggleExclude} />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <label className="flex items-center gap-2 text-sm font-medium text-charcoal">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(c) => setSelectedIds(c === true ? new Set(candidates.map((r) => r.id)) : new Set())}
                />
                {t("addByPeriodForm.allOrNone")}
              </label>
              <span className="text-xs text-slate">{t("addByPeriodForm.selectedOf", { selected: selectedIds.size, total: candidates.length })}</span>
            </div>
            {totalMatches > candidates.length && (
              <p className="text-xs text-slate">
                {t("addByPeriodForm.limitedResults", { shown: BULK_ADD_MAX_RESULTS, total: totalMatches })}
              </p>
            )}
            <div className="max-h-[360px] space-y-1 overflow-y-auto">
              {candidates.map((c) => (
                <label
                  key={c.id}
                  className={`flex items-center gap-2 rounded-md border border-border p-2 text-sm ${
                    selectedIds.has(c.id) ? "" : "opacity-50"
                  }`}
                >
                  <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleRow(c.id)} />
                  <span className="w-20 shrink-0 text-xs text-slate">{formatDate(c.booking_date, dateDisplayFormat)}</span>
                  <span className="flex-1 truncate text-charcoal">{c.counterparty}</span>
                  <span className="num shrink-0 text-xs text-slate">{formatEur(c.amount_cents)}</span>
                  {c.alreadyIncluded && (
                    <span className="shrink-0 text-[10px] text-slate">{t("addByPeriodForm.alreadyIncluded")}</span>
                  )}
                </label>
              ))}
              {candidates.length === 0 && <p className="p-3 text-sm text-slate">{t("addByPeriodForm.noResults")}</p>}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "filter" ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {t("addByPeriodForm.cancel")}
              </Button>
              <Button onClick={() => void handleContinue()} disabled={loading}>
                {t("addByPeriodForm.continue")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep("filter")}>
                {t("addByPeriodForm.back")}
              </Button>
              <Button onClick={() => void handleConfirm()} disabled={submitting || selectedIds.size === 0}>
                {t("addByPeriodForm.addCount", { count: selectedIds.size })}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
