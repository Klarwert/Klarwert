import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormattedEuroInput } from "./FormattedEuroInput";
import ReactECharts from "echarts-for-react";
import { formatEur, useCurrencySymbol } from "@/lib/money";

export interface ZinseszinsTabProps {
  t: any;
  zinInitial: string;
  setZinInitial: (v: string) => void;
  zinSavings: string;
  setZinSavings: (v: string) => void;
  zinStepUp: string;
  setZinStepUp: (v: string) => void;
  zinReturn: string;
  setZinReturn: (v: string) => void;
  zinYears: string;
  setZinYears: (v: string) => void;
  zinInflation: string;
  setZinInflation: (v: string) => void;
  zinTer: string;
  setZinTer: (v: string) => void;
  zinTaxActive: boolean;
  setZinTaxActive: (v: boolean) => void;
  zinTaxRate: string;
  setZinTaxRate: (v: string) => void;
  zinPayout: "ausschüttend" | "thesaurierend";
  setZinPayout: (v: "ausschüttend" | "thesaurierend") => void;
  zinResult: any;
  zinChartOption: any;
  zinChartContainerRef: any;
}

export function ZinseszinsTab({
  t,
  zinInitial,
  setZinInitial,
  zinSavings,
  setZinSavings,
  zinStepUp,
  setZinStepUp,
  zinReturn,
  setZinReturn,
  zinYears,
  setZinYears,
  zinInflation,
  setZinInflation,
  zinTer,
  setZinTer,
  zinTaxActive,
  setZinTaxActive,
  zinTaxRate,
  setZinTaxRate,
  zinPayout,
  setZinPayout,
  zinResult,
  zinChartOption,
  zinChartContainerRef,
}: ZinseszinsTabProps) {
  const currency = useCurrencySymbol();
  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <div className="space-y-4 rounded-standard border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-charcoal">{t("zins.title")}</h2>
        <div className="space-y-1.5">
          <Label>{t("zins.initial", { currency })}</Label>
          <FormattedEuroInput value={zinInitial} onChange={setZinInitial} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("zins.savings", { currency })}</Label>
            <FormattedEuroInput value={zinSavings} onChange={setZinSavings} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("zins.stepUp")}</Label>
            <Input value={zinStepUp} onChange={(e) => setZinStepUp(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("zins.return")}</Label>
            <Input value={zinReturn} onChange={(e) => setZinReturn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("zins.years")}</Label>
            <Input value={zinYears} onChange={(e) => setZinYears(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("zins.inflation")}</Label>
            <Input value={zinInflation} onChange={(e) => setZinInflation(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("zins.ter")}</Label>
            <Input value={zinTer} onChange={(e) => setZinTer(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t("zins.payout")}</Label>
          <Select value={zinPayout} onValueChange={(v: any) => setZinPayout(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="thesaurierend">{t("zins.payoutThes")}</SelectItem>
              <SelectItem value="ausschüttend">{t("zins.payoutAus")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Checkbox
            id="zin-tax"
            checked={zinTaxActive}
            onCheckedChange={(c) => setZinTaxActive(c === true)}
          />
          <label htmlFor="zin-tax" className="text-xs text-charcoal">
            {t("zins.taxActive")}
          </label>
        </div>
        {zinTaxActive && (
          <div className="space-y-1.5">
            <Label>{t("zins.taxRate")}</Label>
            <Input value={zinTaxRate} onChange={(e) => setZinTaxRate(e.target.value)} />
          </div>
        )}
      </div>

      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-standard border border-border bg-card p-4">
            <span className="text-xs text-slate">{t("zins.result.endCapital")}</span>
            <div className="mt-1 text-xl font-bold text-charcoal">
              {formatEur(zinResult.endCapitalNominalCents)}
            </div>
            <span className="text-xs text-slate">
              {t("zins.result.endCapitalReal", { amount: formatEur(zinResult.endCapitalRealCents) })}
            </span>
          </div>
          <div className="rounded-standard border border-border bg-card p-4">
            <span className="text-xs text-slate">{t("common.earnings")}</span>
            <div className="mt-1 text-xl font-bold text-sage">
              {formatEur(zinResult.totalEarningsCents)}
            </div>
          </div>
          <div className="rounded-standard border border-border bg-card p-4">
            <span className="text-xs text-slate">{t("zins.result.earningsNet")}</span>
            <div className="mt-1 text-xl font-bold text-brick">
              {formatEur(zinResult.totalTaxesCents)}
            </div>
          </div>
        </div>

        <div className="rounded-standard border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-charcoal">
            {t("common.capitalCurve")}
          </h3>
          <div ref={zinChartContainerRef}>
            <ReactECharts option={zinChartOption} style={{ height: 300, width: "100%" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
