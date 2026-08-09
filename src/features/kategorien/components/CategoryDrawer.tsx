import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { formatEur } from "@/lib/money";
import { countCategoryUsage, getCategoryYearSums } from "@/db/repositories/categories";
import { getRulesForCategory, type RuleWithConditions } from "@/db/repositories/rules";
import { RuleEditorModal } from "@/features/kategorien/components/RuleEditorModal";
import type { Category } from "@/db/types";

interface CategoryDrawerProps {
  category: Category | null;
  onOpenChange: (open: boolean) => void;
}

const FIELD_LABELS: Record<string, string> = {
  purpose: "Zweck",
  counterparty: "Empfänger",
  amount: "Betrag",
  asset: "Konto",
};

export function CategoryDrawer({ category, onOpenChange }: CategoryDrawerProps) {
  const [ruleEditorOpen, setRuleEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleWithConditions | null>(null);

  const { data: usage } = useQuery({
    queryKey: ["category-usage", category?.id],
    queryFn: () => countCategoryUsage(category!.id),
    enabled: !!category,
  });
  const { data: yearSums } = useQuery({
    queryKey: ["category-year-sums", new Date().getFullYear()],
    queryFn: () => getCategoryYearSums(new Date().getFullYear()),
  });
  const { data: rules, refetch: refetchRules } = useQuery({
    queryKey: ["category-rules", category?.id],
    queryFn: () => getRulesForCategory(category!.id),
    enabled: !!category,
  });

  if (!category) return null;

  return (
    <>
      <Sheet open={!!category} onOpenChange={onOpenChange}>
        <SheetContent className="w-[430px] overflow-y-auto sm:max-w-[430px]">
          <SheetHeader>
            <SheetTitle>{category.name}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex justify-between">
              <span className="text-slate">Jahres-Summe</span>
              <span className="num text-charcoal">{formatEur(yearSums?.get(category.id) ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate">Transaktionen</span>
              <span className="num text-charcoal">{usage ?? 0}</span>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium text-charcoal">Regeln</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingRule(null);
                    setRuleEditorOpen(true);
                  }}
                >
                  <Plus className="mr-1 size-4" />
                  Neue Regel
                </Button>
              </div>
              <div className="space-y-2">
                {rules?.map((rule) => (
                  <button
                    key={rule.id}
                    type="button"
                    onClick={() => {
                      setEditingRule(rule);
                      setRuleEditorOpen(true);
                    }}
                    className="w-full rounded-klein border border-border p-2 text-left text-xs hover:bg-accent"
                  >
                    {rule.groups
                      .map((g) => g.conditions.map((c) => `${FIELD_LABELS[c.field]} enthält "${c.value}"`).join(" UND "))
                      .join(" ODER ")}
                  </button>
                ))}
                {(!rules || rules.length === 0) && (
                  <p className="text-xs text-slate">Keine Regeln für diese Kategorie.</p>
                )}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <RuleEditorModal
        open={ruleEditorOpen}
        rule={editingRule}
        defaultCategoryId={category.id}
        onOpenChange={setRuleEditorOpen}
        onSaved={() => void refetchRules()}
      />
    </>
  );
}
