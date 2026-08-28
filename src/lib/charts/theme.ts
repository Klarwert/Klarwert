import type { EChartsOption } from "echarts";
import { formatEur, formatEurCompact, formatAxisAmount } from "@/lib/money";

export const chartColors = {
  petrol: "#123138",
  petrolLight: "#1d4750",
  sage: "#6f9a6d",
  brick: "#b6503a",
  gold: "#b79a5b",
  slate: "#6b7a80",
};

interface LineSeriesInput {
  labels: string[];
  values: number[];
  name?: string;
}

interface CashflowSeriesInput {
  labels: string[];
  incomeValues: number[];
  expenseValues: number[];
}

interface DonutSeriesInput {
  data: { name: string; value: number; color?: string }[];
}

interface SankeySeriesInput {
  incomeCents: number;
  savingCents: number;
  expenseCategories: { name: string; cents: number; color?: string }[];
  showToolbox?: boolean;
}

/**
 * Zentrale Y-Achsen-Beschriftung für Beträge (z. B. Rechner-Charts): Werte in der Chart-Einheit Euro
 * (nicht Cent!) werden gestuft abgekürzt (siehe formatAxisAmount) und gegen Überlappung abgesichert.
 * `narrow` reduziert bei schmalem Container zusätzlich die Anzahl der Ticks.
 */
export function amountAxisLabel(narrow = false) {
  return {
    formatter: (value: number) => formatAxisAmount(Math.round(value * 100)),
    hideOverlap: true,
    ...(narrow ? { interval: 1 as const } : {}),
  };
}

/** D2 Standard/Groß: beschriftete Y-Achse, Hover-Tooltip je Datenpunkt, echte Datenpunkte. */
export function createLineChartOption({ labels, values, name }: LineSeriesInput): EChartsOption {
  return {
    grid: { left: 56, right: 16, top: 16, bottom: 28 },
    xAxis: {
      type: "category",
      data: labels,
      axisLine: { lineStyle: { color: chartColors.slate } },
      axisLabel: { color: chartColors.slate, fontSize: 11 },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: chartColors.slate,
        fontSize: 11,
        formatter: (v: number) => formatEurCompact(v),
      },
      splitLine: { lineStyle: { color: "#e7e0d0" } },
    },
    tooltip: {
      trigger: "axis",
      valueFormatter: (v) => formatEur(Number(v)),
    },
    series: [
      {
        name,
        type: "line",
        data: values,
        smooth: false,
        symbol: "circle",
        symbolSize: 6,
        lineStyle: { color: chartColors.petrol, width: 2 },
        itemStyle: { color: chartColors.petrol },
        areaStyle: { color: "rgba(18, 49, 56, 0.08)" },
      },
    ],
  };
}

/** D2 Sparkline: keine Achsen, kein Hover, rein dekorativ. */
export function createSparklineOption(values: number[]): EChartsOption {
  const rising = values.length >= 2 && values[values.length - 1] >= values[0];
  return {
    grid: { left: 2, right: 2, top: 2, bottom: 2 },
    xAxis: { type: "category", show: false, data: values.map((_, i) => i) },
    yAxis: { type: "value", show: false, min: "dataMin", max: "dataMax" },
    tooltip: { show: false },
    series: [
      {
        type: "line",
        data: values,
        smooth: false,
        symbol: "none",
        silent: true,
        lineStyle: { color: rising ? chartColors.sage : chartColors.brick, width: 1.5 },
      },
    ],
  };
}

export function createCashflowBarOption({
  labels,
  incomeValues,
  expenseValues,
}: CashflowSeriesInput): EChartsOption {
  return {
    grid: { left: 64, right: 16, top: 24, bottom: 32 },
    legend: { top: 0, textStyle: { color: chartColors.slate, fontSize: 11 } },
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return "";
        const label = params[0].name;
        let inc = 0;
        let exp = 0;
        for (const p of params) {
          if (p.seriesName === "Einnahmen") inc = Number(p.value) || 0;
          if (p.seriesName === "Ausgaben") exp = Number(p.value) || 0;
        }
        const diff = inc - exp;
        const diffStr = (diff >= 0 ? "+" : "") + formatEur(diff);
        const pct = inc > 0 ? ` (${Math.round((diff / inc) * 100)} %)` : "";
        return `
          <div style="font-weight: 600; margin-bottom: 4px;">${label}</div>
          <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 12px;">
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${chartColors.sage};margin-right:4px;"></span>Einnahmen:</span>
            <span>${formatEur(inc)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 12px;">
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${chartColors.brick};margin-right:4px;"></span>Ausgaben:</span>
            <span>${formatEur(exp)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 12px; margin-top: 4px; border-top: 1px solid #e7e0d0; padding-top: 4px; font-weight: 600;">
            <span>Differenz (Netto):</span>
            <span style="color: ${diff >= 0 ? chartColors.sage : chartColors.brick};">${diffStr}${pct}</span>
          </div>
        `;
      },
    },
    xAxis: {
      type: "category",
      data: labels,
      axisLine: { lineStyle: { color: chartColors.slate } },
      axisLabel: { color: chartColors.slate, fontSize: 11 },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: chartColors.slate,
        fontSize: 11,
        formatter: (v: number) => formatEurCompact(v),
      },
      splitLine: { lineStyle: { color: "#e7e0d0" } },
    },
    series: [
      {
        name: "Einnahmen",
        type: "bar",
        data: incomeValues,
        itemStyle: { color: chartColors.sage, borderRadius: [3, 3, 0, 0] },
      },
      {
        name: "Ausgaben",
        type: "bar",
        data: expenseValues,
        itemStyle: { color: chartColors.brick, borderRadius: [3, 3, 0, 0] },
      },
    ],
  };
}

export function createDonutOption({ data }: DonutSeriesInput): EChartsOption {
  return {
    tooltip: {
      trigger: "item",
      valueFormatter: (v) => formatEur(Number(v)),
    },
    series: [
      {
        type: "pie",
        radius: ["48%", "74%"],
        avoidLabelOverlap: true,
        itemStyle: {
          borderColor: "#fffdf8",
          borderWidth: 2,
        },
        label: {
          color: chartColors.slate,
          formatter: "{b}",
        },
        data: data.map((item) => ({
          name: item.name,
          value: item.value,
          itemStyle: item.color ? { color: item.color } : undefined,
        })),
      },
    ],
  };
}

export function createOverviewSankeyOption({
  incomeCents: _incomeCents,
  savingCents,
  expenseCategories,
  showToolbox = true,
}: SankeySeriesInput): EChartsOption {
  const nodes = [
    { name: "Einnahmen" },
    { name: "Sparen" },
    ...expenseCategories.map((category) => ({ name: category.name })),
  ];
  return {
    tooltip: {
      trigger: "item",
      valueFormatter: (v) => formatEur(Number(v)),
    },
    // ECharts liefert den Bild-Export bereits mitgeliefert (toolbox.feature.saveAsImage) – keine
    // eigene Canvas-Export-Lösung nötig (siehe Bugfix-Runde 3, Punkt 5).
    toolbox: showToolbox ? {
      feature: {
        saveAsImage: { title: "Als Bild speichern", name: "geldfluss" },
      },
      right: 4,
      top: 0,
      iconStyle: { borderColor: chartColors.slate },
    } : undefined,
    series: [
      {
        type: "sankey",
        emphasis: { focus: "adjacency" },
        nodeWidth: 12,
        nodeGap: 10,
        left: 8,
        // Rechter Rand relativ statt fix in Pixeln: bei vielen/langen Kategorienamen skaliert der
        // Platz für die Labels mit der tatsächlichen Container-Breite, statt bei schmaler
        // Darstellung abgeschnitten zu werden (Bugfix-Runde 3, Punkt 5).
        right: "18%",
        top: 28,
        bottom: 12,
        label: { color: chartColors.petrol, fontSize: 11 },
        lineStyle: { color: "gradient", opacity: 0.28, curveness: 0.45 },
        data: nodes,
        links: [
          ...(savingCents > 0
            ? [{ source: "Einnahmen", target: "Sparen", value: savingCents }]
            : []),
          ...expenseCategories
            .filter((category) => category.cents > 0)
            .map((category) => ({
              source: "Einnahmen",
              target: category.name,
              value: category.cents,
            })),
        ],
        itemStyle: { color: chartColors.petrol },
      },
    ],
  };
}
