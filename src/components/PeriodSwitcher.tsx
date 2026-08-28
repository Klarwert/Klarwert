import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getPeriodRange, shiftPeriod, type PeriodType } from "@/lib/periods";
import { usePeriodStore, type PeriodScope } from "@/stores/periodStore";
import { useTranslation } from "react-i18next";

interface PeriodSwitcherProps {
  scope?: PeriodScope;
}

/** C7 Zeitraum-Switcher – Zeitraum-Typ als Reihe einzeln umrandeter Boxen (A4), Zustand bereichsspezifisch getrennt. */
export function PeriodSwitcher({ scope = "uebersicht" }: PeriodSwitcherProps) {
  const { t } = useTranslation("uebersicht");
  const type = usePeriodStore((s) => s.scopes[scope]?.type ?? s.type);
  const anchorIso = usePeriodStore((s) => s.scopes[scope]?.anchorIso ?? s.anchorIso);
  const setType = usePeriodStore((s) => s.setType);
  const setAnchorIso = usePeriodStore((s) => s.setAnchorIso);

  const anchor = new Date(`${anchorIso}T00:00:00`);
  const range = getPeriodRange(type, anchor);

  const TYPE_LABELS: Record<PeriodType, string> = {
    week: t("period_switcher.week"),
    month: t("period_switcher.month"),
    quarter: t("period_switcher.quarter"),
    year: t("period_switcher.year"),
  };

  function shift(dir: 1 | -1) {
    setAnchorIso(scope, shiftPeriod(type, anchor, dir).toISOString().slice(0, 10));
  }

  return (
    <div className="flex items-center gap-2" aria-label={t("period_switcher.current")}>
      <div role="radiogroup" className="inline-flex rounded-klein border border-border">
        {(Object.keys(TYPE_LABELS) as PeriodType[]).map((t, i) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            onClick={() => setType(scope, t)}
            className={cn(
              "px-3 py-1.5 text-sm transition-colors",
              i > 0 && "border-l border-border",
              type === t ? "bg-petrol text-card" : "text-charcoal hover:bg-accent",
            )}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>
      <Button size="icon" variant="ghost" aria-label={t("period_switcher.prev")} onClick={() => shift(-1)}>
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-[130px] text-center text-sm font-medium text-charcoal" aria-live="polite">
        {range.label}
      </span>
      <Button size="icon" variant="ghost" aria-label={t("period_switcher.next")} onClick={() => shift(1)}>
        <ChevronRight className="size-4" />
      </Button>
      <button
        type="button"
        className="text-xs text-petrol underline"
        onClick={() => setAnchorIso(scope, new Date().toISOString().slice(0, 10))}
      >
        {t("period_switcher.current")}
      </button>
    </div>
  );
}
