import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TooltipHelp } from "@/components/TooltipHelp";
import { FormattedEuroInput } from "./FormattedEuroInput";
import EChartsReact from "echarts-for-react";
import { formatEur, useCurrencySymbol } from "@/lib/money";
import type { Person } from "@/db/types";

export interface FireTabProps {
  t: any;
  persons: Person[] | undefined;

  fireMode: "when_free" | "how_much";
  setFireMode: (v: "when_free" | "how_much") => void;
  fireMonthlyNet: string;
  setFireMonthlyNet: (v: string) => void;
  fireSavingsRate: string;
  setFireSavingsRate: (v: string) => void;
  fireTargetAge: string;
  setFireTargetAge: (v: string) => void;
  fireCapital: string;
  setFireCapital: (v: string) => void;
  fireReturn: string;
  setFireReturn: (v: string) => void;
  fireInflation: string;
  setFireInflation: (v: string) => void;
  fireSwr: string;
  setFireSwr: (v: string) => void;
  fireTax: string;
  setFireTax: (v: string) => void;
  fireTeilfreistellung: boolean;
  setFireTeilfreistellung: (v: boolean) => void;
  fireCapitalDepletion: boolean;
  setFireCapitalDepletion: (v: boolean) => void;
  firePersonId: string;
  setFirePersonId: (v: string) => void;
  fireResult: any;
  fireChartOption: any;
}

export function FireTab({
  t,
  persons,

  fireMode,
  setFireMode,
  fireMonthlyNet,
  setFireMonthlyNet,
  fireSavingsRate,
  setFireSavingsRate,
  fireTargetAge,
  setFireTargetAge,
  fireCapital,
  setFireCapital,
  fireReturn,
  setFireReturn,
  fireInflation,
  setFireInflation,
  fireSwr,
  setFireSwr,
  fireTax,
  setFireTax,
  fireTeilfreistellung,
  setFireTeilfreistellung,
  fireCapitalDepletion,
  setFireCapitalDepletion,
  firePersonId,
  setFirePersonId,
  fireResult,
  fireChartOption,
}: FireTabProps) {
  const currency = useCurrencySymbol();
  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <div className="space-y-4 rounded-standard border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-charcoal">{t("fire.title")}</h2>

        <div className="space-y-1.5">
          <Label>{t("fire.mode")}</Label>
          <Select value={fireMode} onValueChange={(v: any) => setFireMode(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="when_free">{t("fire.modes.when_free")}</SelectItem>
              <SelectItem value="how_much">{t("fire.modes.how_much")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label>{t("fire.monthlyNet", { currency })}</Label>
            <TooltipHelp text={t("fire.monthlyNetTooltip")} />
          </div>
          <FormattedEuroInput value={fireMonthlyNet} onChange={setFireMonthlyNet} />
        </div>

        {fireMode === "when_free" ? (
          <div className="space-y-1.5">
            <Label>{t("fire.savingsRate", { currency })}</Label>
            <FormattedEuroInput value={fireSavingsRate} onChange={setFireSavingsRate} />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>{t("fire.targetAge")}</Label>
            <Input value={fireTargetAge} onChange={(e) => setFireTargetAge(e.target.value)} />
          </div>
        )}

        <div className="space-y-1.5">
          <Label>{t("fire.capital", { currency })}</Label>
          <FormattedEuroInput value={fireCapital} onChange={setFireCapital} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>{t("fire.return")}</Label>
            <div className="relative">
              <Input value={fireReturn} onChange={(e) => setFireReturn(e.target.value)} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate">
                %
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("fire.inflation")}</Label>
            <div className="relative">
              <Input value={fireInflation} onChange={(e) => setFireInflation(e.target.value)} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate">
                %
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label>{t("fire.swr")}</Label>
            <TooltipHelp text={t("fire.swrTooltip")} />
          </div>
          <div className="relative">
            <Input value={fireSwr} onChange={(e) => setFireSwr(e.target.value)} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate">%</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label>{t("fire.tax")}</Label>
            <TooltipHelp text={t("fire.taxTooltip")} />
          </div>
          <div className="relative">
            <Input value={fireTax} onChange={(e) => setFireTax(e.target.value)} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate">%</span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Switch
            id="teilfreistellung"
            checked={fireTeilfreistellung}
            onCheckedChange={setFireTeilfreistellung}
          />
          <Label htmlFor="teilfreistellung" className="text-xs font-normal">
            {t("fire.teilfreistellung")}
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="capitalDepletion"
            checked={fireCapitalDepletion}
            onCheckedChange={setFireCapitalDepletion}
          />
          <Label htmlFor="capitalDepletion" className="text-xs font-normal">
            {t("fire.capitalDepletion")}
          </Label>
        </div>

        {persons && persons.length > 0 && (
          <div className="space-y-1.5 border-t border-border pt-4">
            <Label>{t("fire.person")}</Label>
            <Select value={firePersonId} onValueChange={setFirePersonId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("fire.personAll")}</SelectItem>
                {persons.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    {p.name} {p.birth_year ? `(${t("fire.result.personYears", { years: new Date().getFullYear() - p.birth_year })})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-standard border border-border bg-card p-4">
            <span className="text-xs text-slate">{t("fire.result.targetYearAge")}</span>
            <div className="mt-1 text-xl font-bold text-charcoal">
              {t("fire.result.yearAgeValue", { year: fireResult.fireYear, age: fireResult.fireAge })}
            </div>
            <span className="text-xs text-petrol">{t("fire.result.inYears", { count: fireResult.yearsToFire })}</span>
          </div>
          <div className="rounded-standard border border-border bg-card p-4">
            <span className="text-xs text-slate">{t("fire.result.requiredCapital")}</span>
            <div className="mt-1 text-xl font-bold text-charcoal">
              {formatEur(fireResult.requiredCapitalCents)}
            </div>
          </div>
          <div className="rounded-standard border border-border bg-card p-4">
            <span className="text-xs text-slate">{t("fire.result.requiredSavingsRate")}</span>
            <div className="mt-1 text-xl font-bold text-charcoal">
              {t("fire.result.perMonth", { amount: formatEur(fireResult.monthlySavingsRateCents) })}
            </div>
          </div>
        </div>

        <div className="rounded-standard border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-charcoal">
            {t("common.capitalCurve")}
          </h3>
          <div className="h-[300px]">
            <EChartsReact option={fireChartOption} style={{ height: "100%", width: "100%" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
