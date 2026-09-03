import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { calculateFire } from "@/lib/rechner/fire";
import { parseAmountToCentsOrZero } from "@/lib/money";
import { amountAxisLabel } from "@/lib/charts/theme";
import type { Person } from "@/db/types";

const NARROW_CHART_BREAKPOINT = 500;

export function useFireRechner(
  getStoredState: <T>(key: string, fallback: T) => T,
  defaultTaxRate: string,
  persons: Person[] | undefined,
  containerWidth: number
) {
  const [fireMode, setFireMode] = useState<"when_free" | "how_much">(() =>
    getStoredState("fireMode", "when_free"),
  );
  const [fireMonthlyNet, setFireMonthlyNet] = useState(() =>
    getStoredState("fireMonthlyNet", "2500"),
  );
  const [fireReturn, setFireReturn] = useState(() => getStoredState("fireReturn", "6.0"));
  const [fireInflation, setFireInflation] = useState(() => getStoredState("fireInflation", "2.0"));
  const [fireSwr, setFireSwr] = useState(() => getStoredState("fireSwr", "3.5"));
  const [fireTax, setFireTax] = useState(() => getStoredState("fireTax", defaultTaxRate));
  const [fireTeilfreistellung, setFireTeilfreistellung] = useState(() =>
    getStoredState("fireTeilfreistellung", true),
  );
  const [fireCapital, setFireCapital] = useState(() => getStoredState("fireCapital", "50000"));
  const [fireSavingsRate, setFireSavingsRate] = useState(() =>
    getStoredState("fireSavingsRate", "800"),
  );
  const [fireTargetAge, setFireTargetAge] = useState(() => getStoredState("fireTargetAge", "60"));
  const [fireCapitalDepletion, setFireCapitalDepletion] = useState(() =>
    getStoredState("fireCapitalDepletion", false),
  );
  const [firePersonId, setFirePersonId] = useState<string>(() =>
    getStoredState("firePersonId", "all"),
  );
  const { t } = useTranslation("rechner");

  const selectedPerson = persons?.find((p) => String(p.id) === firePersonId);
  const fireCurrentAge = selectedPerson?.birth_year
    ? new Date().getFullYear() - selectedPerson.birth_year
    : 35;

  const result = useMemo(() => {
    return calculateFire({
      mode: fireMode,
      monthlyNetIncomeCents: parseAmountToCentsOrZero(fireMonthlyNet),
      expectedReturnPercent: parseFloat(fireReturn) || 0,
      inflationPercent: parseFloat(fireInflation) || 0,
      swrPercent: parseFloat(fireSwr) || 0,
      taxRatePercent: parseFloat(fireTax) || 0,
      teilfreistellung: fireTeilfreistellung,
      currentCapitalCents: parseAmountToCentsOrZero(fireCapital),
      monthlySavingsRateCents: parseAmountToCentsOrZero(fireSavingsRate),
      targetAge: parseInt(fireTargetAge, 10) || 60,
      capitalDepletion: fireCapitalDepletion,
      currentAge: fireCurrentAge,
    });
  }, [
    fireMode,
    fireMonthlyNet,
    fireReturn,
    fireInflation,
    fireSwr,
    fireTax,
    fireTeilfreistellung,
    fireCapital,
    fireSavingsRate,
    fireTargetAge,
    fireCapitalDepletion,
    fireCurrentAge,
  ]);

  const chartOption = useMemo(() => {
    const years = result.yearlyPoints.map((p) => p.year);
    const contrib = result.yearlyPoints.map((p) => Math.round(p.contributionsCents / 100));
    const growth = result.yearlyPoints.map((p) => Math.round(p.growthCents / 100));

    const contributionsLabel = t("common.contributions");
    const growthLabel = t("common.growth");
    return {
      tooltip: { trigger: "axis" },
      legend: { data: [contributionsLabel, growthLabel], bottom: 0 },
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
          name: growthLabel,
          type: "bar",
          stack: "total",
          data: growth,
          itemStyle: { color: "#6f9a6d" },
        },
      ],
    };
  }, [result, containerWidth, t]);

  return {
    state: {
      fireMode,
      fireMonthlyNet,
      fireReturn,
      fireInflation,
      fireSwr,
      fireTax,
      fireTeilfreistellung,
      fireCapital,
      fireSavingsRate,
      fireTargetAge,
      fireCapitalDepletion,
      firePersonId,
    },
    actions: {
      setFireMode,
      setFireMonthlyNet,
      setFireReturn,
      setFireInflation,
      setFireSwr,
      setFireTax,
      setFireTeilfreistellung,
      setFireCapital,
      setFireSavingsRate,
      setFireTargetAge,
      setFireCapitalDepletion,
      setFirePersonId,
    },
    computed: {
      fireCurrentAge,
      result,
      chartOption,
    }
  };
}
