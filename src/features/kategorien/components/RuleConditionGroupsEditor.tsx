import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { useAssets } from "@/hooks/useAssets";
import {
  listDistinctValuesForField,
  listExtraFieldKeys,
  previewRuleMatches,
  type RuleConditionGroupInput,
  type RuleConditionInput,
  type RuleWithConditions,
} from "@/db/repositories/rules";
import type { RuleField, RuleOperator } from "@/db/types";
import { formatDate } from "@/lib/dates";
import { formatEur } from "@/lib/money";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTranslation } from "react-i18next";

const TEXT_OPERATORS: RuleOperator[] = ["contains", "equals"];
const AMOUNT_OPERATORS: RuleOperator[] = ["equals", "approx", "greater_than", "less_than", "between"];

export function newRuleCondition(): RuleConditionInput {
  return { field: "counterparty", operator: "contains", value: "" };
}

export function ruleGroupsToDraft(rule: RuleWithConditions): RuleConditionInput[][] {
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
  return draft.length > 0 ? draft : [[newRuleCondition()]];
}

export function cleanRuleGroups(groups: RuleConditionInput[][]): RuleConditionGroupInput[] {
  return groups
    .map((g) => g.filter((c) => c.value.trim()))
    .filter((g) => g.length > 0)
    .map((conditions) => ({ conditions }));
}

interface RuleConditionGroupsEditorProps {
  groups: RuleConditionInput[][];
  onChange: (groups: RuleConditionInput[][]) => void;
  showPreview?: boolean;
}

export function RuleConditionGroupsEditor({ groups, onChange, showPreview = true }: RuleConditionGroupsEditorProps) {
  const { t } = useTranslation(["kategorien", "transaktionen"]);
  const { data: assets } = useAssets(false);
  const dateDisplayFormat = useSettingsStore((s) => s.dateDisplayFormat);
  const [extraFieldKeys, setExtraFieldKeys] = useState<string[]>([]);
  const [valueSuggestions, setValueSuggestions] = useState<Record<string, string[]>>({});
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [matchSample, setMatchSample] = useState<{ booking_date: string; counterparty: string; purpose: string | null; amount_cents: number }[]>([]);
  const [matchSearch, setMatchSearch] = useState("");

  useEffect(() => {
    void listExtraFieldKeys().then(setExtraFieldKeys);
  }, []);

  useEffect(() => {
    if (!showPreview) return;
    const input = cleanRuleGroups(groups);
    if (input.length === 0) {
      setMatchCount(null);
      setMatchSample([]);
      return;
    }
    const timeout = setTimeout(() => {
      void previewRuleMatches(input).then((res) => {
        setMatchCount(res?.count ?? 0);
        setMatchSample(res?.sample ?? []);
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [groups, showPreview]);

  function updateCondition(groupIdx: number, condIdx: number, patch: Partial<RuleConditionInput>) {
    onChange(groups.map((g, gi) => (gi === groupIdx ? g.map((c, ci) => (ci === condIdx ? { ...c, ...patch } : c)) : g)));
  }

  function removeCondition(groupIdx: number, condIdx: number) {
    const next = groups
      .map((g, gi) => (gi === groupIdx ? g.filter((_, ci) => ci !== condIdx) : g))
      .filter((g) => g.length > 0);
    onChange(next.length > 0 ? next : [[newRuleCondition()]]);
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
    <div className="space-y-3">
      <div className="space-y-3">
        <Label>{t("rules.conditions")}</Label>
        <p className="text-xs text-slate">
          {t("rules.conditionsDesc")}
        </p>
        {groups.map((group, groupIdx) => (
          <div key={groupIdx} className="space-y-2 rounded-standard border border-border p-3">
            {groupIdx > 0 && <p className="text-xs font-medium text-petrol">{t("rules.or")}</p>}
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
                    onValueChange={(v: RuleField) => updateCondition(groupIdx, condIdx, { field: v, operator: v === "amount" ? "equals" : "contains" })}
                  >
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["counterparty", "purpose", "amount", "asset", "extra_field"] as RuleField[]).map((f) => (
                        <SelectItem key={f} value={f}>{t(("rules.condition.field." + f) as any)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {isExtraField && (
                    <Select value={c.extra_field_key ?? ""} onValueChange={(v) => updateCondition(groupIdx, condIdx, { extra_field_key: v })}>
                      <SelectTrigger className="w-[160px]"><SelectValue placeholder={t("rules.chooseColumn")} /></SelectTrigger>
                      <SelectContent>
                        {extraFieldKeys.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}

                  {!isAsset && (
                    <Select value={c.operator} onValueChange={(v: RuleOperator) => updateCondition(groupIdx, condIdx, { operator: v })}>
                      <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {availableOperators.map((op) => <SelectItem key={op} value={op}>{t(("rules.condition.operator." + op) as any)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}

                  {isAsset ? (
                    <Select value={c.value} onValueChange={(v) => updateCondition(groupIdx, condIdx, { value: v })}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder={t("rules.chooseAccount")} /></SelectTrigger>
                      <SelectContent>
                        {assets?.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
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
                        placeholder={t("rules.valueSearchPlaceholder")}
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
                    <Input className="flex-1" value={c.value} onChange={(e) => updateCondition(groupIdx, condIdx, { value: e.target.value })} placeholder={t("rules.valuePlaceholder")} />
                  )}

                  {isBetween && (
                    <>
                      <span className="text-xs text-slate">{t("rules.andBetween")}</span>
                      <Input className="w-24" value={c.value_to ?? ""} onChange={(e) => updateCondition(groupIdx, condIdx, { value_to: e.target.value })} placeholder={t("rules.to")} />
                    </>
                  )}

                  <Button size="icon" variant="ghost" aria-label={t("rules.removeCondition")} onClick={() => removeCondition(groupIdx, condIdx)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              );
            })}
            <Button variant="ghost" size="sm" onClick={() => onChange(groups.map((g, gi) => (gi === groupIdx ? [...g, newRuleCondition()] : g)))}>
              <Plus className="mr-1 size-4" /> {t("rules.addAnd")}
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => onChange([...groups, [newRuleCondition()]])}>
          <Plus className="mr-1 size-4" /> {t("rules.addOr")}
        </Button>
      </div>

      {showPreview && matchCount !== null && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate">{t("rules.previewMatches", { count: matchCount })}</p>
            {matchSample.length > 0 && (
              <Input value={matchSearch} onChange={(e) => setMatchSearch(e.target.value)} placeholder={t("merchants.searchMatches")} className="h-7 w-48 text-xs" />
            )}
          </div>
          {filteredMatchSample.length > 0 && (
            <div className="max-h-[220px] overflow-auto rounded-klein border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-accent text-left text-slate">
                    <th className="p-2 font-medium">{t("transaktionen:columns.date")}</th>
                    <th className="p-2 font-medium">{t("transaktionen:columns.counterparty")}</th>
                    <th className="p-2 font-medium">{t("rules.condition.field.purpose")}</th>
                    <th className="p-2 font-medium text-right">{t("transaktionen:columns.amount")}</th>
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
          {matchCount > matchSample.length && <p className="text-xs text-slate text-center">{t("rules.andMore", { count: matchCount - matchSample.length })}</p>}
        </div>
      )}
    </div>
  );
}
