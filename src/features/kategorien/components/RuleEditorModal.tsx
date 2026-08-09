import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategorySelect } from "@/components/CategorySelect";
import { Plus, Trash2 } from "lucide-react";
import { useTags } from "@/hooks/useTags";
import { useSparzwecke } from "@/hooks/useSparzwecke";
import { useAssets } from "@/hooks/useAssets";
import { reevaluateAllRuleBasedTransactions } from "@/lib/pipeline";
import {
  createRuleWithGroups,
  updateRuleWithGroups,
  previewRuleMatches,
  listDistinctValuesForField,
  listExtraFieldKeys,
  type RuleConditionInput,
  type RuleConditionGroupInput,
  type RuleWithConditions,
} from "@/db/repositories/rules";
import type { RuleField, RuleOperator } from "@/db/types";
import { toast } from "sonner";
import { formatEur } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { useSettingsStore } from "@/stores/settingsStore";
import { showErrorToast } from "@/lib/errorToast";

const FIELD_LABELS: Record<RuleField, string> = {
  purpose: "Verwendungszweck",
  counterparty: "Empfänger",
  amount: "Betrag",
  asset: "Konto",
  custom: "Zusatzfeld",
  extra_field: "Import-Spalte",
};
const OPERATOR_LABELS: Record<RuleOperator, string> = {
  contains: "enthält",
  equals: "ist genau",
  approx: "≈ ±5 %",
  greater_than: "größer als",
  less_than: "kleiner als",
  between: "zwischen",
};
const TEXT_OPERATORS: RuleOperator[] = ["contains", "equals"];
const AMOUNT_OPERATORS: RuleOperator[] = ["equals", "approx", "greater_than", "less_than", "between"];

function newCondition(): RuleConditionInput {
  return { field: "counterparty", operator: "contains", value: "" };
}

function groupsToDraft(rule: RuleWithConditions): RuleConditionInput[][] {
  const draft = rule.groups
    .map((g) =>
      g.conditions.map((c) => ({
        field: c.field,
        operator: c.operator,
        value: c.value,
        value_to: c.value_to ?? undefined,
        extra_field_key: c.extra_field_key ?? undefined,
      })),
    )
    .filter((g) => g.length > 0);
  return draft.length > 0 ? draft : [[newCondition()]];
}

interface RuleEditorModalProps {
  open: boolean;
  rule: RuleWithConditions | null;
  defaultCategoryId?: number | null;
  defaultConditions?: RuleConditionInput[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/**
 * Regel-Builder: zweistufige UND/ODER-Struktur (Gruppen sind ODER-verknüpft, Bedingungen
 * innerhalb einer Gruppe UND-verknüpft), Feldauswahl inkl. dynamischer extra_fields_json-Schlüssel
 * aus dem Import, Beträge mit größer/kleiner/zwischen, durchsuchbarer Werte-Picker aus echten
 * Buchungsdaten, durchsuchbare Trefferliste statt nur Anzahl (siehe prompt-regelbuilder-erweiterung.md).
 */
export function RuleEditorModal({ open, rule, defaultCategoryId, defaultConditions, onOpenChange, onSaved }: RuleEditorModalProps) {
  const [groups, setGroups] = useState<RuleConditionInput[][]>(
    defaultConditions ? [defaultConditions] : [[newCondition()]],
  );
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [tagId, setTagId] = useState<number | null>(null);
  const [markAsTransfer, setMarkAsTransfer] = useState(false);
  const [markAsSaving, setMarkAsSaving] = useState(false);
  const [sparzweckId, setSparzweckId] = useState<number | null>(null);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [matchSample, setMatchSample] = useState<{ booking_date: string; counterparty: string; purpose: string | null; amount_cents: number }[]>([]);
  const [matchSearch, setMatchSearch] = useState("");
  const [extraFieldKeys, setExtraFieldKeys] = useState<string[]>([]);
  const [valueSuggestions, setValueSuggestions] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  const { data: tags } = useTags();
  const { data: sparzwecke } = useSparzwecke();
  const { data: assets } = useAssets(false);
  const dateDisplayFormat = useSettingsStore((s) => s.dateDisplayFormat);

  useEffect(() => {
    if (!open) return;
    void listExtraFieldKeys().then(setExtraFieldKeys);
    if (rule) {
      setGroups(groupsToDraft(rule));
      setCategoryId(rule.category_id);
      setTagId(rule.tag_id);
      setMarkAsTransfer(!!rule.mark_as_transfer);
      setMarkAsSaving(!!rule.mark_as_saving);
      setSparzweckId(rule.sparzweck_id);
    } else {
      setGroups(defaultConditions ? [defaultConditions] : [[newCondition()]]);
      setCategoryId(defaultCategoryId ?? null);
      setTagId(null);
      setMarkAsTransfer(false);
      setMarkAsSaving(false);
      setSparzweckId(null);
    }
  }, [open, rule, defaultCategoryId]);

  const groupInputs: RuleConditionGroupInput[] = groups.map((conditions) => ({ conditions }));

  useEffect(() => {
    if (!open) return;
    const hasAny = groups.some((g) => g.some((c) => c.value.trim()));
    if (!hasAny) {
      setMatchCount(null);
      return;
    }
    const timeout = setTimeout(() => {
      previewRuleMatches(groupInputs).then((res) => {
        setMatchCount(res.count);
        setMatchSample(res.sample);
      });
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, open]);

  const hasCompleteCondition = groups.some((g) => g.some((c) => c.value.trim()));
  const hasAction = !!categoryId || !!tagId || markAsTransfer || markAsSaving;

  async function handleSubmit() {
    const cleanedGroups = groups
      .map((g) => g.filter((c) => c.value.trim()))
      .filter((g) => g.length > 0);
    if (cleanedGroups.length === 0 || !hasAction) return;
    setSubmitting(true);
    try {
      const actions = {
        category_id: categoryId,
        tag_id: tagId,
        mark_as_transfer: markAsTransfer,
        mark_as_saving: markAsSaving,
        sparzweck_id: markAsSaving ? sparzweckId : null,
      };
      const input = cleanedGroups.map((conditions) => ({ conditions }));
      if (rule) {
        await updateRuleWithGroups(rule.id, input, actions);
      } else {
        await createRuleWithGroups(input, actions);
      }
      await reevaluateAllRuleBasedTransactions();
      toast.success(rule ? "Regel gespeichert" : "Regel angelegt");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      showErrorToast(`Fehler: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  function updateCondition(groupIdx: number, condIdx: number, patch: Partial<RuleConditionInput>) {
    setGroups((prev) =>
      prev.map((g, gi) => (gi === groupIdx ? g.map((c, ci) => (ci === condIdx ? { ...c, ...patch } : c)) : g)),
    );
  }

  function removeCondition(groupIdx: number, condIdx: number) {
    setGroups((prev) => {
      const next = prev.map((g, gi) => (gi === groupIdx ? g.filter((_, ci) => ci !== condIdx) : g));
      return next.filter((g) => g.length > 0);
    });
  }

  async function loadValueSuggestions(key: string, field: "counterparty" | "purpose", search: string) {
    const values = await listDistinctValuesForField(field, search);
    setValueSuggestions((prev) => ({ ...prev, [key]: values }));
  }

  const filteredMatchSample = matchSearch.trim()
    ? matchSample.filter(
        (tx) =>
          tx.counterparty.toLowerCase().includes(matchSearch.toLowerCase()) ||
          (tx.purpose ?? "").toLowerCase().includes(matchSearch.toLowerCase()),
      )
    : matchSample;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[700px]">
        <DialogHeader>
          <DialogTitle>{rule ? "Regel bearbeiten" : "Regel anlegen"}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
          <div className="space-y-3">
            <Label>Bedingungen</Label>
            <p className="text-xs text-slate">
              Bedingungen innerhalb einer Gruppe müssen alle zutreffen (UND). Mehrere Gruppen: eine davon reicht (ODER).
            </p>
            {groups.map((group, groupIdx) => (
              <div key={groupIdx} className="space-y-2 rounded-standard border border-border p-3">
                {groupIdx > 0 && <p className="text-xs font-medium text-petrol">ODER</p>}
                {group.map((c, condIdx) => {
                  const suggestionKey = `${groupIdx}-${condIdx}`;
                  const isAmount = c.field === "amount";
                  const isAsset = c.field === "asset";
                  const isExtraField = c.field === "extra_field";
                  const isBetween = c.operator === "between";
                  const availableOperators = isAmount ? AMOUNT_OPERATORS : TEXT_OPERATORS;
                  return (
                    <div key={condIdx} className="flex flex-wrap items-center gap-2">
                      <Select
                        value={c.field}
                        onValueChange={(v: RuleField) => updateCondition(groupIdx, condIdx, { field: v, operator: "contains" })}
                      >
                        <SelectTrigger className="w-[150px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["counterparty", "purpose", "amount", "asset", "extra_field"] as RuleField[]).map((f) => (
                            <SelectItem key={f} value={f}>
                              {FIELD_LABELS[f]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {isExtraField && (
                        <Select
                          value={c.extra_field_key ?? ""}
                          onValueChange={(v) => updateCondition(groupIdx, condIdx, { extra_field_key: v })}
                        >
                          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Spalte wählen" /></SelectTrigger>
                          <SelectContent>
                            {extraFieldKeys.map((k) => (
                              <SelectItem key={k} value={k}>{k}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {!isAsset && (
                        <Select
                          value={c.operator}
                          onValueChange={(v: RuleOperator) => updateCondition(groupIdx, condIdx, { operator: v })}
                        >
                          <SelectTrigger className="w-[130px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {availableOperators.map((op) => (
                              <SelectItem key={op} value={op}>
                                {OPERATOR_LABELS[op]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {isAsset ? (
                        <Select value={c.value} onValueChange={(v) => updateCondition(groupIdx, condIdx, { value: v })}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Konto wählen" />
                          </SelectTrigger>
                          <SelectContent>
                            {assets?.map((a) => (
                              <SelectItem key={a.id} value={String(a.id)}>
                                {a.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (c.field === "counterparty" || c.field === "purpose") ? (
                        <div className="relative flex-1">
                          <Input
                            className="w-full"
                            value={c.value}
                            onChange={(e) => {
                              updateCondition(groupIdx, condIdx, { value: e.target.value });
                              void loadValueSuggestions(suggestionKey, c.field as "counterparty" | "purpose", e.target.value);
                            }}
                            onFocus={() => void loadValueSuggestions(suggestionKey, c.field as "counterparty" | "purpose", c.value)}
                            placeholder="Wert (tippen zum Durchsuchen)"
                          />
                          {valueSuggestions[suggestionKey]?.length > 0 && c.value && (
                            <div className="absolute z-10 mt-1 max-h-[160px] w-full overflow-y-auto rounded-klein border border-border bg-card shadow-lg">
                              {valueSuggestions[suggestionKey].map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  className="block w-full truncate px-2 py-1 text-left text-xs hover:bg-accent"
                                  onClick={() => {
                                    updateCondition(groupIdx, condIdx, { value: v });
                                    setValueSuggestions((prev) => ({ ...prev, [suggestionKey]: [] }));
                                  }}
                                >
                                  {v}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <Input
                          className="flex-1"
                          value={c.value}
                          onChange={(e) => updateCondition(groupIdx, condIdx, { value: e.target.value })}
                          placeholder="Wert"
                        />
                      )}

                      {isBetween && (
                        <>
                          <span className="text-xs text-slate">und</span>
                          <Input
                            className="w-24"
                            value={c.value_to ?? ""}
                            onChange={(e) => updateCondition(groupIdx, condIdx, { value_to: e.target.value })}
                            placeholder="bis"
                          />
                        </>
                      )}

                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Bedingung entfernen"
                        onClick={() => removeCondition(groupIdx, condIdx)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  );
                })}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setGroups((prev) => prev.map((g, gi) => (gi === groupIdx ? [...g, newCondition()] : g)))}
                >
                  <Plus className="mr-1 size-4" /> UND-Bedingung
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setGroups((prev) => [...prev, [newCondition()]])}>
              <Plus className="mr-1 size-4" /> ODER-Gruppe
            </Button>
          </div>

          <div className="space-y-3 rounded-standard border border-border p-3">
            <Label>Aktionen (mindestens eine)</Label>
            <CategorySelect value={categoryId} onChange={setCategoryId} placeholder="Kategorie zuweisen" />
            <Select
              value={tagId ? String(tagId) : "none"}
              onValueChange={(v) => setTagId(v === "none" ? null : Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Tag zuweisen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Kein Tag</SelectItem>
                {tags?.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center justify-between">
              <Label htmlFor="rule-transfer">Als Transfer markieren</Label>
              <Switch id="rule-transfer" checked={markAsTransfer} onCheckedChange={setMarkAsTransfer} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="rule-saving">Als Sparen markieren</Label>
              <Switch id="rule-saving" checked={markAsSaving} onCheckedChange={setMarkAsSaving} />
            </div>
            {markAsSaving && (
              <Select
                value={sparzweckId ? String(sparzweckId) : "none"}
                onValueChange={(v) => setSparzweckId(v === "none" ? null : Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sparzweck" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kein Sparzweck</SelectItem>
                  {sparzwecke?.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {matchCount !== null && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate">{matchCount} Transaktionen treffen aktuell zu.</p>
                {matchSample.length > 0 && (
                  <Input
                    value={matchSearch}
                    onChange={(e) => setMatchSearch(e.target.value)}
                    placeholder="Trefferliste durchsuchen…"
                    className="h-7 w-48 text-xs"
                  />
                )}
              </div>
              {filteredMatchSample.length > 0 && (
                <div className="max-h-[220px] overflow-auto rounded-klein border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-accent text-left text-slate">
                        <th className="p-2 font-medium">Datum</th>
                        <th className="p-2 font-medium">Empfänger</th>
                        <th className="p-2 font-medium">Zweck</th>
                        <th className="p-2 font-medium text-right">Betrag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMatchSample.map((tx, i) => (
                        <tr key={i} className="border-b border-border last:border-0 hover:bg-accent/50">
                          <td className="p-2 whitespace-nowrap">{formatDate(tx.booking_date, dateDisplayFormat)}</td>
                          <td className="p-2 truncate max-w-[130px]">{tx.counterparty}</td>
                          <td className="p-2 truncate max-w-[150px] text-slate">{tx.purpose}</td>
                          <td className={`p-2 whitespace-nowrap text-right font-mono ${tx.amount_cents < 0 ? "text-red-500" : "text-green-600"}`}>{formatEur(tx.amount_cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {matchCount > matchSample.length && (
                <p className="text-xs text-slate text-center">und {matchCount - matchSample.length} weitere…</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting || !hasCompleteCondition || !hasAction}>
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
