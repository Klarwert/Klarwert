import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { calculateZinseszins } from "@/lib/rechner/zinseszins";
import { parseAmountToCentsOrZero } from "@/lib/money";
import { amountAxisLabel } from "@/lib/charts/theme";

const NARROW_CHART_BREAKPOINT = 500;

export function useZinseszinsRechner(
  getStoredState: <T>(key: string, fallback: T) => T,
  defaultTaxRate: string,
  containerWidth: number
) {
  const [zinInitial, setZinInitial] = useState(() => getStoredState("zinInitial", "10000"));
  const [zinSavings, setZinSavings] = useState(() => getStoredState("zinSavings", "300"));
  const [zinStepUp, setZinStepUp] = useState(() => getStoredState("zinStepUp", "2.0"));
  const [zinReturn, setZinReturn] = useState(() => getStoredState("zinReturn", "6.0"));
  const [zinYears, setZinYears] = useState(() => getStoredState("zinYears", "20"));
  const [zinInflation, setZinInflation] = useState(() => getStoredState("zinInflation", "2.0"));
  const [zinTer, setZinTer] = useState(() => getStoredState("zinTer", "0.2"));
  const [zinTaxActive, setZinTaxActive] = useState(() => getStoredState("zinTaxActive", true));
  const [zinTaxRate, setZinTaxRate] = useState(() => getStoredState("zinTaxRate", defaultTaxRate));
  const [zinPayout, setZinPayout] = useState<"ausschüttend" | "thesaurierend">(() =>
    getStoredState("zinPayout", "thesaurierend"),
  );
  const { t } = useTranslation("rechner");

  const result = useMemo(() => {
    return calculateZinseszins({
      initialCapitalCents: parseAmountToCentsOrZero(zinInitial),
      monthlySavingsRateCents: parseAmountToCentsOrZero(zinSavings),
      annualSavingsIncreasePercent: parseFloat(zinStepUp) || 0,
      interestRatePercent: parseFloat(zinReturn) || 0,
      years: parseInt(zinYears, 10) || 10,
      inflationPercent: parseFloat(zinInflation) || 0,
      terPercent: parseFloat(zinTer) || 0,
      taxActive: zinTaxActive,
      taxRatePercent: parseFloat(zinTaxRate) || 0,
      payoutType: zinPayout,
    });
  }, [
    zinInitial,
    zinSavings,
    zinStepUp,
    zinReturn,
    zinYears,
    zinInflation,
    zinTer,
    zinTaxActive,
    zinTaxRate,
    zinPayout,
  ]);

  const chartOption = useMemo(() => {
    const years = result.yearlyPoints.map((p) => p.year);
    const contrib = result.yearlyPoints.map((p) => Math.round(p.contributionsCents / 100));
    const earnings = result.yearlyPoints.map((p) => Math.round(p.earningsCents / 100));

    const contributionsLabel = t("common.contributions");
    const earningsLabel = t("common.earnings");
    return {
      tooltip: { trigger: "axis" },
      legend: { data: [contributionsLabel, earningsLabel], bottom: 0 },
      xAxis: { type: "category", data: years },
      yAxis: {
        type: "value",
        axisLabel: amountAxisLabel(
          containerWidth > 0 && containerWidth < NARROW_CHART_BREAKPOINT,
        ),
      },
      series: [
        {
          name: contributionsLabel,
          type: "bar",
          stack: "total",
          data: contrib,
          itemStyle: { color: "#4a6fa5" },
        },
        {
          name: earningsLabel,
          type: "bar",
          stack: "total",
          data: earnings,
          itemStyle: { color: "#6f9a6d" },
        },
      ],
    };
  }, [result, containerWidth, t]);

  return {
    state: {
      zinInitial,
      zinSavings,
      zinStepUp,
      zinReturn,
      zinYears,
      zinInflation,
      zinTer,
      zinTaxActive,
      zinTaxRate,
      zinPayout,
    },
    actions: {
      setZinInitial,
      setZinSavings,
      setZinStepUp,
      setZinReturn,
      setZinYears,
      setZinInflation,
      setZinTer,
      setZinTaxActive,
      setZinTaxRate,
      setZinPayout,
    },
    computed: {
      result,
      chartOption,
    }
  };
}
