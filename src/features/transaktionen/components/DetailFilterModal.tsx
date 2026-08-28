import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/DateInput";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategorySelect } from "@/components/CategorySelect";
import { ChevronDown } from "lucide-react";
import { useTags } from "@/hooks/useTags";
import { useSparzwecke } from "@/hooks/useSparzwecke";
import { todayIso } from "@/lib/dates";
import type { Tristate } from "@/db/repositories/transactions";

export interface DetailFilterState {
  categoryId: number | null;
  tagId: number | null;
  sparzweckId: number | null;
  amountMin: string;
  amountMax: string;
  contract: Tristate;
  transfer: Tristate;
  saving: Tristate;
  reviewed: Tristate;
  excludedFromStats: Tristate;
  uncategorized: Tristate;
  /** Wenn gesetzt, überschreiben diese den seitenweiten Zeitraum-Zustand (nur für diese Filterung). */
  customDateFrom: string;
  customDateTo: string;
}

export const EMPTY_DETAIL_FILTER: DetailFilterState = {
  categoryId: null,
  tagId: null,
  sparzweckId: null,
  amountMin: "",
  amountMax: "",
  contract: "all",
  transfer: "all",
  saving: "all",
  reviewed: "all",
  excludedFromStats: "all",
  uncategorized: "all",
  customDateFrom: "",
  customDateTo: "",
};

interface DetailFilterModalProps {
  open: boolean;
  initial: DetailFilterState;
  onOpenChange: (open: boolean) => void;
  onApply: (filter: DetailFilterState) => void;
}

const TRISTATE_FIELDS: { key: keyof DetailFilterState; label: string }[] = [
  { key: "contract", label: "Vertrag" },
  { key: "transfer", label: "Transfer" },
  { key: "saving", label: "Sparen" },
  { key: "reviewed", label: "Geprüft" },
  { key: "excludedFromStats", label: "Statistik-entfernt" },
  { key: "uncategorized", label: "Unkategorisiert" },
];

export function DetailFilterModal({ open, initial, onOpenChange, onApply }: DetailFilterModalProps) {
  const { t } = useTranslation(['transaktionen', 'app', 'uebersicht']);
  const [state, setState] = useState<DetailFilterState>(initial);
  const { data: tags } = useTags();
  const { data: sparzwecke } = useSparzwecke();

  useEffect(() => {
    if (open) setState(initial);
  }, [open, initial]);

  function setTristate(key: keyof DetailFilterState, value: Tristate) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function handleApply() {
    let { amountMin, amountMax, customDateFrom, customDateTo } = state;
    if (amountMin && amountMax && Number(amountMin) > Number(amountMax)) {
      [amountMin, amountMax] = [amountMax, amountMin];
    }
    if (customDateFrom && customDateTo && customDateFrom > customDateTo) {
      [customDateFrom, customDateTo] = [customDateTo, customDateFrom];
    }
    onApply({ ...state, amountMin, amountMax, customDateFrom, customDateTo });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t('filter.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="filter-period-mode">{t('filter.period')}</Label>
            <Select
              value={state.customDateFrom || state.customDateTo ? "custom" : "page"}
              onValueChange={(v) => {
                if (v === "page") setState((p) => ({ ...p, customDateFrom: "", customDateTo: "" }));
                else setState((p) => ({ ...p, customDateFrom: p.customDateFrom || todayIso(), customDateTo: p.customDateTo || todayIso() }));
              }}
            >
              <SelectTrigger id="filter-period-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="page">{t('filter.periodPage')}</SelectItem>
                <SelectItem value="custom">{t('filter.periodCustom')}</SelectItem>
              </SelectContent>
            </Select>
            {(state.customDateFrom || state.customDateTo) && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="filter-date-from">{t('filter.from')}</Label>
                  <DateInput
                    id="filter-date-from"
                    value={state.customDateFrom}
                    onChange={(v) => setState((p) => ({ ...p, customDateFrom: v }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="filter-date-to">{t('filter.to')}</Label>
                  <DateInput
                    id="filter-date-to"
                    value={state.customDateTo}
                    onChange={(v) => setState((p) => ({ ...p, customDateTo: v }))}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t('filter.category')}</Label>
            <CategorySelect
              value={state.categoryId}
              onChange={(v) => setState((p) => ({ ...p, categoryId: v }))}
              allowNone={false}
              placeholder="Alle Kategorien"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-tag">{t('app:common.tags')}</Label>
            <Select
              value={state.tagId ? String(state.tagId) : "all"}
              onValueChange={(v) => setState((p) => ({ ...p, tagId: v === "all" ? null : Number(v) }))}
            >
              <SelectTrigger id="filter-tag">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filter.allTags')}</SelectItem>
                {tags?.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-sparzweck">{t('filter.savingsGoal')}</Label>
            <Select
              value={state.sparzweckId ? String(state.sparzweckId) : "all"}
              onValueChange={(v) =>
                setState((p) => ({ ...p, sparzweckId: v === "all" ? null : Number(v) }))
              }
            >
              <SelectTrigger id="filter-sparzweck">
                <SelectValue placeholder={t('filter.allSavingsGoals')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filter.allSavingsGoals')}</SelectItem>
                {sparzwecke?.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="filter-amount-min">{t('filter.amountMin')}</Label>
              <Input
                id="filter-amount-min"
                inputMode="decimal"
                value={state.amountMin}
                onChange={(e) => setState((p) => ({ ...p, amountMin: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-max">{t('filter.amountMax')}</Label>
              <Input
                id="filter-max"
                inputMode="decimal"
                value={state.amountMax}
                onChange={(e) => setState((p) => ({ ...p, amountMax: e.target.value }))}
              />
            </div>
          </div>

          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1 text-sm text-petrol">
              <ChevronDown className="size-4" />
              {t('app:common.more')}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3">
              {TRISTATE_FIELDS.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <Label>{label}</Label>
                  <div className="flex gap-1">
                    {(["all", "only", "without"] as Tristate[]).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setTristate(key, v)}
                        className={`rounded-klein border px-2 py-1 text-xs ${
                          state[key] === v ? "border-petrol bg-petrol/10" : "border-border"
                        }`}
                      >
                        {v === "all" ? "Alle" : v === "only" ? "Nur" : "Ohne"}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => setState(EMPTY_DETAIL_FILTER)}>{t('app:common.reset')}</Button>
          <Button onClick={handleApply}>{t('app:common.apply')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
