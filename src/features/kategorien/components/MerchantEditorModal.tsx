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
import { Plus, Trash2 } from "lucide-react";
import { CategorySelect } from "@/components/CategorySelect";
import {
  createMerchant,
  updateMerchantContent,
  suggestCounterpartiesFor,
  addMerchantAlias,
  listMerchantAliases,
  removeMerchantAlias,
} from "@/db/repositories/merchants";
import {
  listRulesForMerchant,
  createMerchantRule,
  updateMerchantRule,
  deleteMerchantRule,
  type RuleWithConditions,
} from "@/db/repositories/rules";
import type { Merchant, RuleField, RuleOperator } from "@/db/types";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";

interface MerchantEditorModalProps {
  open: boolean;
  merchant: Merchant | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface DraftRule {
  id: number | null;
  field: RuleField;
  operator: RuleOperator;
  value: string;
  category_id: number | null;
}

function ruleToDraft(rule: RuleWithConditions): DraftRule {
  const condition = rule.groups[0]?.conditions[0];
  return {
    id: rule.id,
    field: (condition?.field as RuleField) ?? "counterparty",
    operator: (condition?.operator as RuleOperator) ?? "contains",
    value: condition?.value ?? "",
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
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [aliases, setAliases] = useState<string[]>([]);
  const [newAlias, setNewAlias] = useState("");
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
    setSuggestions([]);
    setRules(merchant && existingRules ? existingRules.map(ruleToDraft) : []);
  }, [open, merchant, existingRules]);

  async function handleNameBlur() {
    if (merchant || !displayName.trim()) return;
    setSuggestions(await suggestCounterpartiesFor(displayName.trim()));
  }

  function addRuleRow() {
    setRules((prev) => [...prev, { id: null, field: "counterparty", operator: "contains", value: "", category_id: categoryId }]);
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
        toast.success(isCurated ? "Als eigene Anpassung gespeichert" : "Händler aktualisiert");
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
        toast.success("Händler angelegt");
      }

      for (const rule of rules) {
        const input = {
          conditions: rule.value.trim()
            ? [{ field: rule.field, operator: rule.operator, value: rule.value.trim() }]
            : [],
          category_id: rule.category_id,
        };
        if (rule.id !== null) {
          await updateMerchantRule(rule.id, input);
        } else {
          await createMerchantRule(merchantId, input);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["merchants"] });
      queryClient.invalidateQueries({ queryKey: ["merchant-aliases"] });
      queryClient.invalidateQueries({ queryKey: ["merchant-rules", merchantId] });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      showErrorToast(`Fehler: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{merchant ? "Händler bearbeiten" : "Neuer Händler"}</DialogTitle>
          {isCurated && (
            <DialogDescription>
              Dieser Händler ist mitgeliefert. Deine Änderung wird als eigene Anpassung gespeichert, das
              Original bleibt für künftige Updates erhalten.
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label htmlFor="merchant-name">Anzeigename</Label>
            <Input
              id="merchant-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onBlur={() => void handleNameBlur()}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Standardkategorie</Label>
            <CategorySelect value={categoryId} onChange={setCategoryId} allowNone />
            <p className="text-xs text-slate">Gilt, solange keine der Regeln unten zutrifft.</p>
          </div>

          {!merchant && suggestions.length > 0 && (
            <div className="space-y-1.5">
              <Label>Ähnliche Buchungstexte – als Alias übernehmen?</Label>
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
            <Label>Aliase (Namensvarianten)</Label>
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
                    {a.match_value}
                    <button
                      type="button"
                      onClick={async () => {
                        await removeMerchantAlias(a.id);
                        queryClient.invalidateQueries({ queryKey: ["merchant-aliases", merchant.id] });
                        queryClient.invalidateQueries({ queryKey: ["merchant-aliases"] });
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              <Input
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key !== "Enter" || !newAlias.trim()) return;
                  e.preventDefault();
                  if (merchant) {
                    await addMerchantAlias({ merchant_id: merchant.id, match_type: "name_fuzzy", match_value: newAlias.trim() });
                    queryClient.invalidateQueries({ queryKey: ["merchant-aliases", merchant.id] });
                    queryClient.invalidateQueries({ queryKey: ["merchant-aliases"] });
                  } else {
                    setAliases((prev) => [...prev, newAlias.trim()]);
                  }
                  setNewAlias("");
                }}
                placeholder="+ Alias"
                className="h-7 w-32 text-xs"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Weitere Regeln (bevor die Standardkategorie greift)</Label>
            <p className="text-xs text-slate">
              Z. B. "Verwendungszweck enthält 'Prime' → Streaming", sonst Standardkategorie.
            </p>
            {rules.map((rule, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-klein border border-border p-2">
                <Select value={rule.field} onValueChange={(v: RuleField) => updateRuleRow(i, { field: v })}>
                  <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="counterparty">Empfänger</SelectItem>
                    <SelectItem value="purpose">Verwendungszweck</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={rule.operator} onValueChange={(v: RuleOperator) => updateRuleRow(i, { operator: v })}>
                  <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contains">enthält</SelectItem>
                    <SelectItem value="equals">ist genau</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={rule.value}
                  onChange={(e) => updateRuleRow(i, { value: e.target.value })}
                  placeholder="Suchbegriff"
                  className="h-8 w-32 text-xs"
                />
                <span className="text-xs text-slate">→</span>
                <div className="min-w-[160px]">
                  <CategorySelect value={rule.category_id} onChange={(id) => updateRuleRow(i, { category_id: id })} allowNone />
                </div>
                <Button variant="ghost" size="icon" onClick={() => void removeRuleRow(i)}>
                  <Trash2 className="size-4 text-brick" />
                </Button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addRuleRow}>
              <Plus className="mr-1 size-4" /> Regel
            </Button>
          </div>

          {isCurated && (
            <Badge variant="outline" className="border-sage text-sage">
              Wird zu "Angepasst"
            </Badge>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={() => void handleSave()} disabled={submitting || !displayName.trim()}>
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
