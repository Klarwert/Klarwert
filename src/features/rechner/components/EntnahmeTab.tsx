import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { FormattedEuroInput } from "./FormattedEuroInput";
import ReactECharts from "echarts-for-react";
import { formatEur } from "@/lib/money";

export interface EntnahmeTabProps {
  t: any;
  entInitial: string;
  setEntInitial: (v: string) => void;
  entMonthly: string;
  setEntMonthly: (v: string) => void;
  entAdjustInf: boolean;
  setEntAdjustInf: (v: boolean) => void;
  entHorizon: string;
  setEntHorizon: (v: string) => void;
  entReturn: string;
  setEntReturn: (v: string) => void;
  entInflation: string;
  setEntInflation: (v: string) => void;
  entTer: string;
  setEntTer: (v: string) => void;
  entTaxActive: boolean;
  setEntTaxActive: (v: boolean) => void;
  entTaxRate: string;
  setEntTaxRate: (v: string) => void;
  entResult: any;
  entChartOption: any;
  entChartContainerRef: any;
}

export function EntnahmeTab({
  t,
  entInitial,
  setEntInitial,
  entMonthly,
  setEntMonthly,
  entAdjustInf,
  setEntAdjustInf,
  entHorizon,
  setEntHorizon,
  entReturn,
  setEntReturn,
  entInflation,
  setEntInflation,
  entTer,
  setEntTer,
  entTaxActive,
  setEntTaxActive,
  entTaxRate,
  setEntTaxRate,
  entResult,
  entChartOption,
  entChartContainerRef,
}: EntnahmeTabProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <div className="space-y-4 rounded-standard border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-charcoal">{t("ent.title")}</h2>
        <div className="space-y-1.5">
          <Label>{t("ent.initial")}</Label>
          <FormattedEuroInput value={entInitial} onChange={setEntInitial} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("ent.monthly")}</Label>
          <FormattedEuroInput value={entMonthly} onChange={setEntMonthly} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("ent.return")}</Label>
            <Input value={entReturn} onChange={(e) => setEntReturn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("ent.horizon")}</Label>
            <Input value={entHorizon} onChange={(e) => setEntHorizon(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("ent.inflation")}</Label>
            <Input value={entInflation} onChange={(e) => setEntInflation(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("ent.ter")}</Label>
            <Input value={entTer} onChange={(e) => setEntTer(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <Checkbox
            id="ent-inf"
            checked={entAdjustInf}
            onCheckedChange={(c) => setEntAdjustInf(c === true)}
          />
          <label htmlFor="ent-inf" className="text-xs text-charcoal">
            {t("ent.adjustInf")}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="ent-tax"
            checked={entTaxActive}
            onCheckedChange={(c) => setEntTaxActive(c === true)}
          />
          <label htmlFor="ent-tax" className="text-xs text-charcoal">
            {t("ent.taxActive")}
          </label>
        </div>
        {entTaxActive && (
          <div className="space-y-1.5">
            <Label>{t("ent.taxRate")}</Label>
            <Input value={entTaxRate} onChange={(e) => setEntTaxRate(e.target.value)} />
          </div>
        )}
      </div>

      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-standard border border-border bg-card p-4">
            <span className="text-xs text-slate">{t("ent.result.residualCapital")}</span>
            <div className="mt-1 text-xl font-bold text-charcoal">
              {formatEur(entResult.endBalanceCents)}
            </div>
          </div>
          <div className="rounded-standard border border-border bg-card p-4">
            <span className="text-xs text-slate">{t("ent.result.capitalUntil")}</span>
            <div className="mt-1 text-xl font-bold text-charcoal">
              {entResult.capitalDepletedInYear
                ? `${entResult.capitalDepletedInYear}`
                : t("ent.result.endOfHorizon")}
            </div>
            {entResult.capitalDepletedAtAge && (
              <span className="text-xs text-brick">
                {t("ent.result.ageAt", { age: entResult.capitalDepletedAtAge })}
              </span>
            )}
          </div>
          <div className="rounded-standard border border-border bg-card p-4">
            <span className="text-xs text-slate">{t("ent.result.totalWithdrawn")}</span>
            <div className="mt-1 text-xl font-bold text-sage">
              {formatEur(entResult.totalWithdrawalsCents)}
            </div>
          </div>
        </div>

        <div className="rounded-standard border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-charcoal">
            {t("common.capitalCurve")}
          </h3>
          <div ref={entChartContainerRef}>
            <ReactECharts option={entChartOption} style={{ height: 300, width: "100%" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
