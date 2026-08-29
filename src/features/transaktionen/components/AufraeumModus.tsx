import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CategorySelect } from "@/components/CategorySelect";
import { useCategories, translateCategoryName } from "@/hooks/useCategories";
import { listTransactions, updateTransaction, type TransactionWithTags } from "@/db/repositories/transactions";
import { createRule } from "@/db/repositories/rules";
import { formatEur } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { useSettingsStore } from "@/stores/settingsStore";
import { suggestCategory } from "@/lib/pipeline/suggest-category";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { showErrorToast } from "@/lib/errorToast";
import { useTranslation } from "react-i18next";

interface AufraeumModusProps {
  open: boolean;
  dateFrom: string;
  dateTo: string;
  assetId?: number | null;
  personId?: number | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

export function AufraeumModus({ open, dateFrom, dateTo, assetId, personId, onOpenChange, onDone }: AufraeumModusProps) {
  const { data: categories } = useCategories();
  const { t } = useTranslation(["transaktionen", "app"]);
  const dateDisplayFormat = useSettingsStore((s) => s.dateDisplayFormat);
  const [items, setItems] = useState<TransactionWithTags[]>([]);
  const [groups, setGroups] = useState<TransactionWithTags[][]>([]);
  const [singles, setSingles] = useState<TransactionWithTags[]>([]);
  
  const [phase, setPhase] = useState<"stapel" | "einzeln">("stapel");
  const [index, setIndex] = useState(0);
  
  const [recentCategoryIds, setRecentCategoryIds] = useState<number[]>([]);
  const [categorizedCount, setCategorizedCount] = useState(0);
  const [rulesCreatedCount, setRulesCreatedCount] = useState(0);
  
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);

  // Für Phase 1
  const [createRuleChecked, setCreateRuleChecked] = useState(true);
  const [suggestedCategoryId, setSuggestedCategoryId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setFinished(false);
    setPhase("stapel");
    setIndex(0);
    setCategorizedCount(0);
    setRulesCreatedCount(0);
    void listTransactions({
      assetId,
      personId,
      dateFrom,
      dateTo,
      quickUnkategorisiert: true,
      sortBy: "booking_date",
      sortDir: "desc",
      limit: 500,
    }).then((rows) => {
      setItems(rows);
      
      const groupsMap = new Map<string, TransactionWithTags[]>();
      for (const item of rows) {
        const key = normalize(item.counterparty);
        if (!groupsMap.has(key)) groupsMap.set(key, []);
        groupsMap.get(key)!.push(item);
      }
      
      const g = Array.from(groupsMap.values()).filter(arr => arr.length >= 2).sort((a, b) => b.length - a.length);
      const s = Array.from(groupsMap.values()).filter(arr => arr.length === 1).map(arr => arr[0]);
      
      setGroups(g);
      setSingles(s);
      
      if (g.length === 0) {
        setPhase("einzeln");
      }
      setLoading(false);
    });
  }, [open, dateFrom, dateTo, assetId, personId]);

  const currentGroup = phase === "stapel" ? groups[index] : null;
  const currentSingle = phase === "einzeln" ? singles[index] : null;
  const currentTotalCount = phase === "stapel" ? groups.length : singles.length;
  
  // Effekt, um Suggestion bei jedem neuen Item in Einzeln oder Stapel zu berechnen
  useEffect(() => {
    const tx = phase === "stapel" ? currentGroup?.[0] : currentSingle;
    if (tx) {
      void suggestCategory({
        asset_id: tx.asset_id,
        counterparty: tx.counterparty,
        purpose: tx.purpose,
        amount_cents: tx.amount_cents
      }).then((catId) => {
        setSuggestedCategoryId(catId);
        setCreateRuleChecked(true); // default on
      });
    } else {
      setSuggestedCategoryId(null);
    }
  }, [phase, index, currentGroup, currentSingle]);

  function advance() {
    if (index + 1 >= currentTotalCount) {
      if (phase === "stapel") {
        if (singles.length > 0) {
          setPhase("einzeln");
          setIndex(0);
        } else {
          setFinished(true);
        }
      } else {
        setFinished(true);
      }
    } else {
      setIndex((i) => i + 1);
    }
  }

  async function handleCategorize(categoryId: number | null) {
    try {
      if (phase === "stapel" && currentGroup) {
        // Apply to whole group
        for (const tx of currentGroup) {
          await updateTransaction(tx.id, {
            category_id: categoryId,
            categorization_source: categoryId ? (createRuleChecked ? "rule" : "manual") : "none",
          });
          if (categoryId) setCategorizedCount((c) => c + 1);
        }
        if (categoryId && createRuleChecked) {
          await createRule(
            [{ field: "counterparty", operator: "contains", value: currentGroup[0].counterparty }],
            {
              category_id: categoryId,
              tag_id: null,
              mark_as_transfer: false,
              mark_as_saving: false,
              sparzweck_id: null,
            },
          );
          setRulesCreatedCount((c) => c + 1);
        }
        if (categoryId) {
          setRecentCategoryIds((prev) => [categoryId, ...prev.filter((id) => id !== categoryId)].slice(0, 6));
        }
        advance();
      } else if (phase === "einzeln" && currentSingle) {
        await updateTransaction(currentSingle.id, {
          category_id: categoryId,
          categorization_source: categoryId ? "manual" : "none",
        });
        if (categoryId) setCategorizedCount((c) => c + 1);

        if (categoryId !== null) {
          setRecentCategoryIds((prev) => [categoryId, ...prev.filter((id) => id !== categoryId)].slice(0, 6));
        }

        // No rule suggestion here since occurrenceCount === 1 for singles
        advance();
      }
    } catch (e) {
      showErrorToast(`${t("app:errors.unknownError")}: ${String(e)}`);
    }
  }

  function handleClose() {
    onDone();
    onOpenChange(false);
  }

  const recentCategories = (categories ?? []).filter((c) => recentCategoryIds.includes(c.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] w-[90vw] max-w-[900px] flex-col p-0">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <div className="flex-1">
            <p className="text-sm text-charcoal">
              {phase === "stapel" ? t("cleanup.phase1") : t("cleanup.phase2")} ({index + 1} {t("cleanup.of")} {currentTotalCount})
            </p>
            <Progress value={currentTotalCount ? ((index + 1) / currentTotalCount) * 100 : 0} className="mt-1 h-1.5" />
          </div>
          <div className="ml-4 flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => void advance()} disabled={finished}>
              {t("cleanup.skip")}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClose}>
              {t("cleanup.quit")}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {loading && <p className="text-sm text-slate">{t("app:common.loading")}</p>}

          {!loading && (finished || items.length === 0) && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <h2 className="font-heading text-xl text-charcoal">{t("cleanup.allDone")}</h2>
              <p className="text-sm text-slate">
                {t("cleanup.stats", { categorized: categorizedCount, rules: rulesCreatedCount })}
              </p>
              <Button className="mt-4" onClick={handleClose}>
                {t("cleanup.done")}
              </Button>
            </div>
          )}

          {!loading && !finished && (phase === "stapel" ? currentGroup : currentSingle) && (
            <div className="mx-auto max-w-lg space-y-5">
              <div className="text-center">
                {phase === "einzeln" && currentSingle && (
                  <>
                    <p className="text-xs text-slate">{formatDate(currentSingle.booking_date, dateDisplayFormat)}</p>
                    <h2 className="font-heading text-2xl text-charcoal">{currentSingle.counterparty}</h2>
                    {currentSingle.purpose && <p className="mt-1 text-sm text-slate">{currentSingle.purpose}</p>}
                    <p className="num mt-2 text-xl text-charcoal">{formatEur(currentSingle.amount_cents)}</p>
                  </>
                )}
                {phase === "stapel" && currentGroup && (
                  <>
                    <p className="text-xs font-semibold text-petrol mb-1">{t("cleanup.uncategorizedCount", { count: currentGroup.length })}</p>
                    <h2 className="font-heading text-2xl text-charcoal">{currentGroup[0].counterparty}</h2>
                    <p className="mt-1 text-sm text-slate">{t("cleanup.examplePurpose")}: {currentGroup[0].purpose || t("cleanup.noPurpose")}</p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <Checkbox 
                        id="createRule" 
                        checked={createRuleChecked} 
                        onCheckedChange={(c) => setCreateRuleChecked(!!c)} 
                      />
                      <Label htmlFor="createRule" className="cursor-pointer">
                        {t("cleanup.createRule")}
                      </Label>
                    </div>
                  </>
                )}
              </div>

              {recentCategories.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2">
                  {recentCategories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => void handleCategorize(c.id)}
                      className="rounded-pill border border-border px-3 py-1.5 text-sm hover:bg-accent"
                    >
                      {translateCategoryName(c)}
                    </button>
                  ))}
                </div>
              )}

              <CategorySelect 
                value={suggestedCategoryId} 
                onChange={(id) => void handleCategorize(id)} 
                allowNone={true} 
                amountCents={currentGroup?.[0]?.amount_cents ?? currentSingle?.amount_cents}
              />
              
              {suggestedCategoryId !== null && (
                <p className="text-center text-xs text-slate mt-2">
                  ({t("cleanup.suggestedBecause")})
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
