import { useState, useMemo } from "react";
import { calculateEntnahme } from "@/lib/rechner/entnahme";
import { parseAmountToCentsOrZero } from "@/lib/money";
import { amountAxisLabel } from "@/lib/charts/theme";

const NARROW_CHART_BREAKPOINT = 500;

export function useEntnahmeRechner(
  getStoredState: <T>(key: string, fallback: T) => T,
  defaultTaxRate: string,
  containerWidth: number,
  userAge: number
) {
  const [entInitial, setEntInitial] = useState(() => getStoredState("entInitial", "300000"));
  const [entMonthly, setEntMonthly] = useState(() => getStoredState("entMonthly", "1200"));
  const [entAdjustInf, setEntAdjustInf] = useState(() => getStoredState("entAdjustInf", true));
  const [entHorizon, setEntHorizon] = useState(() => getStoredState("entHorizon", "30"));
  const [entReturn, setEntReturn] = useState(() => getStoredState("entReturn", "5.0"));
  const [entInflation, setEntInflation] = useState(() => getStoredState("entInflation", "2.0"));
  const [entTer, setEntTer] = useState(() => getStoredState("entTer", "0.2"));
  const [entTaxActive, setEntTaxActive] = useState(() => getStoredState("entTaxActive", true));
  const [entTaxRate, setEntTaxRate] = useState(() => getStoredState("entTaxRate", defaultTaxRate));

  const result = useMemo(() => {
    return calculateEntnahme({
      initialCapitalCents: parseAmountToCentsOrZero(entInitial),
      monthlyWithdrawalCents: parseAmountToCentsOrZero(entMonthly),
      adjustForInflation: entAdjustInf,
      horizonYears: parseInt(entHorizon, 10) || 30,
      interestRatePercent: parseFloat(entReturn) || 0,
      inflationPercent: parseFloat(entInflation) || 0,
      terPercent: parseFloat(entTer) || 0,
      taxActive: entTaxActive,
      taxRatePercent: parseFloat(entTaxRate) || 0,
      userAge,
    });
  }, [
    entInitial,
    entMonthly,
    entAdjustInf,
    entHorizon,
    entReturn,
    entInflation,
    entTer,
    entTaxActive,
    entTaxRate,
    userAge,
  ]);

  const chartOption = useMemo(() => {
    const years = result.yearlyPoints.map((p) => p.year);
    const amounts = result.yearlyPoints.map((p) => Math.round(p.capitalRemainingCents / 100));
    return {
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: years },
      yAxis: {
        type: "value",
        axisLabel: amountAxisLabel(
          containerWidth > 0 && containerWidth < NARROW_CHART_BREAKPOINT,
        ),
      },
      series: [
        {
          data: amounts,
          type: "line",
          areaStyle: { opacity: 0.2, color: "#4a6fa5" },
          itemStyle: { color: "#4a6fa5" },
          smooth: true,
        },
      ],
    };
  }, [result, containerWidth]);

  return {
    state: {
      entInitial,
      entMonthly,
      entAdjustInf,
      entHorizon,
      entReturn,
      entInflation,
      entTer,
      entTaxActive,
      entTaxRate,
    },
    actions: {
      setEntInitial,
      setEntMonthly,
      setEntAdjustInf,
      setEntHorizon,
      setEntReturn,
      setEntInflation,
      setEntTer,
      setEntTaxActive,
      setEntTaxRate,
    },
    computed: {
      result,
      chartOption,
    }
  };
}
