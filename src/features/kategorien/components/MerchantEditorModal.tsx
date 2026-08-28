import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { CategorySelect } from "@/components/CategorySelect";
import {
  createMerchant,
  updateMerchantContent,
  suggestCounterpartiesFor,
  addMerchantAlias,
  listMerchantAliases,
  removeMerchantAlias,
  checkAliasCollisions,
  previewAliasMatches,
} from "@/db/repositories/merchants";
import {
  listRulesForMerchant,
  createMerchantRule,
  updateMerchantRule,
  deleteMerchantRule,
  type RuleWithConditions,
} from "@/db/repositories/rules";
import type { Merchant } from "@/db/types";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";
import { formatEur } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  RuleConditionGroupsEditor,
  cleanRuleGroups,
  newRuleCondition,
  ruleGroupsToDraft,
} from "@/features/kategorien/components/RuleConditionGroupsEditor";

interface MerchantEditorModalProps {
  open: boolean;
  merchant: Merchant | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface DraftRule {
  id: number | null;
  groups: ReturnType<typeof ruleGroupsToDraft>;
  category_id: number | null;
}

function ruleToDraft(rule: RuleWithConditions): DraftRule {
  return {
    id: rule.id,
    groups: ruleGroupsToDraft(rule),
    category_id: rule.category_id,
  };
}

/**
 * Anlegen/Bearbeiten eines Händlers – seit der Zusammenführung von Händlern und Regel-Vorlagen
 * (klarwert-haendler-regel-konzept-v2.md) auch für kuratierte Einträge nutzbar: Speichern erzeugt
 * dort eine lokale Überschreibung (is_modified=1), das kuratierte Original bleibt für künftige
 * "Regel-Update prüfen"-Diffs erhalten.
 */
export function MerchantEditorModal({ open, merchant, onOpenChange, onSaved }: MerchantEditorModalProps) {
  const { t } = useTranslation(["kategorien", "app", "transaktionen"]);
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [aliases, setAliases] = useState<string[]>([]);
  const [newAlias, setNewAlias] = useState("");
  const [newAliasField, setNewAliasField] = useState<"counterparty" | "purpose" | "any">("counterparty");
  const [newAliasMatchType, setNewAliasMatchType] = useState<"name_exact" | "name_fuzzy" | "regex">("name_fuzzy");
  const [aliasCollisions, setAliasCollisions] = useState<{ merchantId: number; merchantName: string }[]>([]);
  const [aliasPreview, setAliasPreview] = useState<{ count: number; sample: { booking_date: string; counterparty: string; purpose: string | null; amount_cents: number }[] } | null>(null);
  const [aliasPreviewSearch, setAliasPreviewSearch] = useState("");
  const dateDisplayFormat = useSettingsStore((s) => s.dateDisplayFormat);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [rules, setRules] = useState<DraftRule[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const isCurated = merchant?.is_builtin === 1;

  const { data: existingAliases } = useQuery({
    queryKey: ["merchant-aliases", merchant?.id],
    queryFn: () => listMerchantAliases(merchant!.id),
    enabled: !!merchant,
  });
  const { data: existingRules } = useQuery({
    queryKey: ["merchant-rules", merchant?.id],
    queryFn: () => listRulesForMerchant(merchant!.id),
    enabled: !!merchant,
  });

  useEffect(() => {
    if (!open) return;
    setDisplayName(merchant?.display_name ?? "");
    setCategoryId(merchant?.default_category_id ?? null);
    setAliases([]);
    setNewAlias("");
    setNewAliasField("counterparty");
    setNewAliasMatchType("name_fuzzy");
    setAliasCollisions([]);
    setAliasPreview(null);
    setAliasPreviewSearch("");
    setSuggestions([]);
    setRules(merchant && existingRules ? existingRules.map(ruleToDraft) : []);
  }, [open, merchant, existingRules]);

  // Live-Kollisions-Pruefung beim Tippen
  useEffect(() => {
    if (!newAlias.trim()) { setAliasCollisions([]); return; }
    const timer = setTimeout(() => {
      void (async () => {
        const hits = await checkAliasCollisions(newAlias.trim(), newAliasField, merchant?.id);
        setAliasCollisions(hits);
        if (newAlias.trim()) {
          const preview = await previewAliasMatches(newAlias.trim(), newAliasField, newAliasMatchType);
          setAliasPreview(preview);
        } else {
          setAliasPreview(null);
        }
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [newAlias, newAliasField, newAliasMatchType, merchant?.id]);

  async function handleNameBlur() {
    if (merchant || !displayName.trim()) return;
    setSuggestions(await suggestCounterpartiesFor(displayName.trim()));
  }

  function addRuleRow() {
    setRules((prev) => [...prev, { id: null, groups: [[newRuleCondition()]], category_id: categoryId }]);
  }

  function updateRuleRow(index: number, patch: Partial<DraftRule>) {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function removeRuleRow(index: number) {
    const rule = rules[index];
    if (rule.id !== null) await deleteMerchantRule(rule.id);
    setRules((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!displayName.trim()) return;
    setSubmitting(true);
    try {
      let merchantId: number;
      if (merchant) {
        await updateMerchantContent(merchant.id, { display_name: displayName.trim(), default_category_id: categoryId });
        merchantId = merchant.id;
        toast.success(t("app:common.success"));
      } else {
        merchantId = await createMerchant({
          canonical_name: displayName.trim(),
          display_name: displayName.trim(),
          default_category_id: categoryId,
          is_builtin: 0,
        });
        for (const a of aliases) {
          await addMerchantAlias({ merchant_id: merchantId, match_type: "name_fuzzy", match_value: a });
        }
        toast.success(t("app:common.success"));
      }

      for (const rule of rules) {
        const groups = cleanRuleGroups(rule.groups);
        if (groups.length === 0) continue;
        const input = {
          groups,
          category_id: rule.category_id,
        };
        if (rule.id !== null) {
          await updateMerchantRule(rule.id, input);
        } else {
          await createMerchantRule(merchantId, input);
        }
      }

      void queryClient.invalidateQueries({ queryKey: ["merchants"] });
      void queryClient.invalidateQueries({ queryKey: ["merchant-aliases"] });
      void queryClient.invalidateQueries({ queryKey: ["merchant-rules", merchantId] });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      showErrorToast(`${t("app:errors.unknownError")}: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{merchant ? t("merchants.editTitle") : t("merchants.newTitle")}</DialogTitle>
          {isCurated && (
            <DialogDescription>
              {t("merchants.curatedDesc")}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label htmlFor="merchant-name">{t("merchants.displayName")}</Label>
            <Input
              id="merchant-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onBlur={() => void handleNameBlur()}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("merchants.defaultCategory")}</Label>
            <CategorySelect value={categoryId} onChange={setCategoryId} allowNone />
            <p className="text-xs text-slate">{t("merchants.defaultCategoryDesc")}</p>
          </div>

          {!merchant && suggestions.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t("merchants.suggestedAliases")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setAliases((prev) => (prev.includes(s) ? prev : [...prev, s]));
                      setSuggestions((prev) => prev.filter((x) => x !== s));
                    }}
                    className="rounded-pill border border-border px-2 py-0.5 text-xs text-slate hover:bg-accent"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("merchants.aliases")}</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {!merchant &&
                aliases.map((a) => (
                  <span key={a} className="inline-flex items-center gap-1 rounded-pill border border-border px-2 py-0.5 text-xs text-slate">
                    {a}
                    <button type="button" onClick={() => setAliases((prev) => prev.filter((x) => x !== a))}>
                      ×
                    </button>
                  </span>
                ))}
              {merchant &&
                (existingAliases ?? []).map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1 rounded-pill border border-border px-2 py-0.5 text-xs text-slate">
                    <span className="text-[10px] text-slate/60">{a.match_field}</span>
                    {a.match_value}
                    <button
                      type="button"
                      onClick={() => {
                        void (async () => {
                          await removeMerchantAlias(a.id);
                          void queryClient.invalidateQueries({ queryKey: ["merchant-aliases", merchant.id] });
                          void queryClient.invalidateQueries({ queryKey: ["merchant-aliases"] });
                        })();
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Select value={newAliasField} onValueChange={(v: "counterparty" | "purpose" | "any") => setNewAliasField(v)}>
                <SelectTrigger className="h-7 w-[130px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="counterparty">{t("merchants.matchField.counterparty")}</SelectItem>
                  <SelectItem value="purpose">{t("merchants.matchField.purpose")}</SelectItem>
                  <SelectItem value="any">{t("merchants.matchField.any")}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={newAliasMatchType} onValueChange={(v: "name_exact" | "name_fuzzy" | "regex") => setNewAliasMatchType(v)}>
                <SelectTrigger className="h-7 w-[110px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name_fuzzy">{t("merchants.matchMode.name_fuzzy")}</SelectItem>
                  <SelectItem value="name_exact">{t("merchants.matchMode.name_exact")}</SelectItem>
                  <SelectItem value="regex">{t("merchants.matchMode.regex")}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || !newAlias.trim()) return;
                  e.preventDefault();
                  if (merchant) {
                    void (async () => {
                      await addMerchantAlias({ merchant_id: merchant.id, match_type: newAliasMatchType, match_field: newAliasField, match_value: newAlias.trim() });
                      void queryClient.invalidateQueries({ queryKey: ["merchant-aliases", merchant.id] });
                      void queryClient.invalidateQueries({ queryKey: ["merchant-aliases"] });
                    })();
                  } else {
                    setAliases((prev) => [...prev, newAlias.trim()]);
                  }
                  setNewAlias("");
                  setAliasCollisions([]);
                  setAliasPreview(null);
                  setAliasPreviewSearch("");
                }}
                placeholder="+ Alias (Enter)"
                className="h-7 w-40 text-xs"
              />
            </div>
            {aliasCollisions.length > 0 && (
              <div className="flex items-start gap-1.5 rounded-klein border border-amber-400/50 bg-amber-50/60 px-2.5 py-1.5 dark:bg-amber-950/30">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {t("merchants.collisionWarning", { merchants: ""}).replace("  ", " ")}
                  {aliasCollisions.map((c, i) => (
                    <span key={c.merchantId}>{i > 0 && ", "}<strong>{c.merchantName}</strong></span>
                  ))}
                  {" "}{t("merchants.collisionWarning", { merchants: "PLACEHOLDER" }).split("PLACEHOLDER")[1]}
                </p>
              </div>
            )}
            {aliasPreview !== null && newAlias.trim() && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate">{t("merchants.matchCount", { count: aliasPreview.count })}</p>
                  {aliasPreview.sample.length > 0 && (
                    <Input
                      value={aliasPreviewSearch}
                      onChange={(e) => setAliasPreviewSearch(e.target.value)}
                      placeholder={t("merchants.searchMatches")}
                      className="h-6 w-44 text-xs"
                    />
                  )}
                </div>
                {aliasPreview.sample.filter(tx =>
                  !aliasPreviewSearch || tx.counterparty.toLowerCase().includes(aliasPreviewSearch.toLowerCase()) || (tx.purpose ?? "").toLowerCase().includes(aliasPreviewSearch.toLowerCase())
                ).length > 0 && (
                  <div className="max-h-[180px] overflow-auto rounded-klein border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-accent text-left text-slate">
                          <th className="p-2 font-medium">{t("transaktionen:columns.date")}</th>
                          <th className="p-2 font-medium">{t("transaktionen:columns.counterparty")}</th>
                          <th className="p-2 font-medium text-right">{t("transaktionen:columns.amount")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aliasPreview.sample
                          .filter(tx => !aliasPreviewSearch || tx.counterparty.toLowerCase().includes(aliasPreviewSearch.toLowerCase()) || (tx.purpose ?? "").toLowerCase().includes(aliasPreviewSearch.toLowerCase()))
                          .map((tx, i) => (
                            <tr key={i} className="border-b border-border last:border-0 hover:bg-accent/50">
                              <td className="p-1.5 whitespace-nowrap">{formatDate(tx.booking_date, dateDisplayFormat)}</td>
                              <td className="p-1.5 max-w-[160px] truncate">{tx.counterparty}</td>
                              <td className={`p-1.5 whitespace-nowrap text-right font-mono ${tx.amount_cents < 0 ? "text-red-500" : "text-green-600"}`}>{formatEur(tx.amount_cents)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {aliasPreview.count > aliasPreview.sample.length && (
                  <p className="text-center text-xs text-slate">{t("merchants.andMore", { count: aliasPreview.count - aliasPreview.sample.length })}</p>
                )}
              </div>
            )}
          </div>


          <div className="space-y-2">
            <Label>{t("merchants.furtherRules")}</Label>
            <p className="text-xs text-slate">
              {t("merchants.furtherRulesDesc")}
            </p>
            {rules.map((rule, i) => (
              <div key={i} className="space-y-3 rounded-klein border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <CategorySelect value={rule.category_id} onChange={(id) => updateRuleRow(i, { category_id: id })} allowNone />
                  <Button variant="ghost" size="icon" onClick={() => void removeRuleRow(i)} aria-label={t("rules.delete")}>
                    <Trash2 className="size-4 text-brick" />
                  </Button>
                </div>
                <RuleConditionGroupsEditor
                  groups={rule.groups}
                  onChange={(groups) => updateRuleRow(i, { groups })}
                />
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addRuleRow}>
              <Plus className="mr-1 size-4" /> {t("rules.title")}
            </Button>
          </div>

          {isCurated && (
            <Badge variant="outline" className="border-sage text-sage">
              {t("merchants.becomesModified")}
            </Badge>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("app:common.cancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={submitting || !displayName.trim()}>
            {t("app:common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
