import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategorySelect } from "@/components/CategorySelect";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useCategories } from "@/hooks/useCategories";
import {
  createBudget,
  deleteBudget,
  listBudgetedCategoryIds,
  updateBudget,
  type BudgetSummary,
} from "@/db/repositories/budgets";
import { parseAmountToCents, formatEur } from "@/lib/money";
import { translateCategoryName } from "@/hooks/useCategories";
import type { PeriodType } from "@/lib/periods";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";

interface BudgetEditorModalProps {
  open: boolean;
  budget: BudgetSummary | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function displayAmount(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function BudgetEditorModal({
  open,
  budget,
  onOpenChange,
  onSaved,
}: BudgetEditorModalProps) {
  const { t } = useTranslation("budgets");
  const PERIOD_LABELS: Record<PeriodType, string> = {
    week: t("period.week"),
    month: t("period.month"),
    quarter: t("period.quarter"),
    year: t("period.year"),
  };
  const { data: categories } = useCategories();
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [limit, setLimit] = useState("");
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [budgetedIds, setBudgetedIds] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategoryId(budget?.category_id ?? null);
    setLimit(budget ? displayAmount(budget.limit_cents) : "");
    setPeriodType(budget?.period_type ?? "month");
    void listBudgetedCategoryIds().then(setBudgetedIds);
  }, [open, budget]);

  const categoryConflict = useMemo(() => {
    if (!categoryId || budget?.category_id === categoryId) return null;
    const selected = categories?.find((c) => c.id === categoryId);
    if (!selected) return null;
    const selectedLineage = new Set<number>([
      selected.id,
      ...(selected.parent_id ? [selected.parent_id] : []),
      ...((categories ?? []).filter((c) => c.parent_id === selected.id).map((c) => c.id)),
    ]);
    const conflictingBudgetId = budgetedIds.find((id) => id !== budget?.category_id && selectedLineage.has(id));
    if (!conflictingBudgetId) return null;
    const conflict = categories?.find((c) => c.id === conflictingBudgetId);
    return conflict ? translateCategoryName(conflict) : t("editor.categoryConflictFallback");
  }, [budget?.category_id, budgetedIds, categories, categoryId, t]);

  async function handleSubmit() {
    if (!limit.trim()) return;
    if (!budget && !categoryId) return;
    if (categoryConflict) return;

    setSubmitting(true);
    try {
      const limitCents = parseAmountToCents(limit);
      if (limitCents <= 0) {
        showErrorToast(t("editor.limitTooLow"));
        return;
      }
      if (budget) {
        await updateBudget(budget.id, { limit_cents: limitCents, period_type: periodType });
        toast.success(t("editor.saved"));
      } else {
        await createBudget({ category_id: categoryId!, limit_cents: limitCents, period_type: periodType });
        toast.success(t("editor.created"));
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      showErrorToast(t("editor.saveFailed", { error: String(e) }));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!budget) return;
    await deleteBudget(budget.id);
    const categoryName = translateCategoryName({ name: budget.categoryName, template_key: budget.categoryTemplateKey });
    const parentName = budget.parentName ? translateCategoryName({ name: budget.parentName, template_key: budget.parentTemplateKey }) : null;
    toast.success(t("editor.deleted"), {
      description: `${parentName ? `${parentName} · ` : ""}${categoryName}`,
    });
    setConfirmDelete(false);
    onSaved();
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{budget ? t("editor.titleEdit") : t("editor.titleNew")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("editor.category")}</Label>
              {budget ? (
                <div className="rounded-klein border border-border bg-paper px-3 py-2 text-sm text-charcoal">
                  {budget.parentName ? `${translateCategoryName({ name: budget.parentName, template_key: budget.parentTemplateKey })} · ` : ""}
                  {translateCategoryName({ name: budget.categoryName, template_key: budget.categoryTemplateKey })}
                </div>
              ) : (
                <CategorySelect
                  value={categoryId}
                  onChange={setCategoryId}
                  allowNone={false}
                  placeholder={t("editor.categoryPlaceholder")}
                  amountCents={-1}
                />
              )}
              {categoryConflict && (
                <p className="text-xs text-brick">
                  {t("editor.categoryConflict", { name: categoryConflict })}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="budget-limit">{t("editor.limit")}</Label>
                <Input
                  id="budget-limit"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  placeholder="500,00"
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="budget-period">{t("editor.period")}</Label>
                <Select value={periodType} onValueChange={(value) => setPeriodType(value as PeriodType)}>
                  <SelectTrigger id="budget-period">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {budget && (
              <div className="rounded-klein bg-accent px-3 py-2 text-xs text-slate">
                {t("editor.currentUsage", { spent: formatEur(budget.spentCents), limit: formatEur(budget.limit_cents) })}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {budget ? (
              <Button variant="destructive" type="button" onClick={() => setConfirmDelete(true)}>
                {t("editor.delete")}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
                {t("editor.cancel")}
              </Button>
              <Button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting || (!budget && !categoryId) || !!categoryConflict}
              >
                {t("editor.save")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {budget && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={t("editor.deleteConfirmTitle")}
          description={t("editor.deleteConfirmDesc")}
          confirmLabel={t("editor.delete")}
          onConfirm={() => void handleDelete()}
        />
      )}
    </>
  );
}
