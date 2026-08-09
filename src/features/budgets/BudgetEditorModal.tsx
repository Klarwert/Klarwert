import { useEffect, useMemo, useState } from "react";
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
import type { PeriodType } from "@/lib/periods";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";

const PERIOD_LABELS: Record<PeriodType, string> = {
  week: "Woche",
  month: "Monat",
  quarter: "Quartal",
  year: "Jahr",
};

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
    return conflict?.name ?? "Diese Kategorie";
  }, [budget?.category_id, budgetedIds, categories, categoryId]);

  async function handleSubmit() {
    if (!limit.trim()) return;
    if (!budget && !categoryId) return;
    if (categoryConflict) return;

    setSubmitting(true);
    try {
      const limitCents = parseAmountToCents(limit);
      if (limitCents <= 0) {
        showErrorToast("Budget-Limit muss größer als 0 sein.");
        return;
      }
      if (budget) {
        await updateBudget(budget.id, { limit_cents: limitCents, period_type: periodType });
        toast.success("Budget gespeichert");
      } else {
        await createBudget({ category_id: categoryId!, limit_cents: limitCents, period_type: periodType });
        toast.success("Budget angelegt");
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      showErrorToast(`Budget konnte nicht gespeichert werden: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!budget) return;
    await deleteBudget(budget.id);
    toast.success("Budget gelöscht", {
      description: `${budget.parentName ? `${budget.parentName} · ` : ""}${budget.categoryName}`,
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
            <DialogTitle>{budget ? "Budget bearbeiten" : "Budget anlegen"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Kategorie</Label>
              {budget ? (
                <div className="rounded-klein border border-border bg-paper px-3 py-2 text-sm text-charcoal">
                  {budget.parentName ? `${budget.parentName} · ` : ""}
                  {budget.categoryName}
                </div>
              ) : (
                <CategorySelect
                  value={categoryId}
                  onChange={setCategoryId}
                  allowNone={false}
                  placeholder="Kategorie wählen"
                  amountCents={-1}
                />
              )}
              {categoryConflict && (
                <p className="text-xs text-brick">
                  Für {categoryConflict} besteht bereits ein Budget in dieser Kategorie-Linie.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="budget-limit">Limit</Label>
                <Input
                  id="budget-limit"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  placeholder="500,00"
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="budget-period">Zeitraum</Label>
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
                Aktuell verbraucht: {formatEur(budget.spentCents)} von {formatEur(budget.limit_cents)}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {budget ? (
              <Button variant="destructive" type="button" onClick={() => setConfirmDelete(true)}>
                Löschen
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
                Abbrechen
              </Button>
              <Button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting || (!budget && !categoryId) || !!categoryConflict}
              >
                Speichern
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {budget && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Budget löschen?"
          description="Das Budget wird entfernt. Bestehende Transaktionen und Kategorien bleiben unverändert."
          confirmLabel="Löschen"
          onConfirm={() => void handleDelete()}
        />
      )}
    </>
  );
}
