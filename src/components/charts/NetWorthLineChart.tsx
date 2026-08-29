import ReactECharts from "echarts-for-react";
import { createLineChartOption } from "@/lib/charts/theme";
import { formatEur, getCurrencySymbol } from "@/lib/money";
import type { NetWorthPoint } from "@/db/repositories/networth";
import i18n from "@/i18n";

interface NetWorthLineChartProps {
  data: NetWorthPoint[];
}

function formatLabel(iso: string): string {
  const [year, month] = iso.split("-");
  return `${month}/${year.slice(2)}`;
}

/** Rounds a value to a "nice" tick boundary */
function niceRound(v: number, up: boolean): number {
  if (v === 0) return 0;
  const abs = Math.abs(v);
  const magnitude = Math.pow(10, Math.floor(Math.log10(abs)));
  const factor = magnitude >= 10000 ? 10000 : magnitude >= 1000 ? 1000 : magnitude >= 100 ? 100 : 10;
  return up ? Math.ceil(v / factor) * factor : Math.floor(v / factor) * factor;
}

export function NetWorthLineChart({ data }: NetWorthLineChartProps) {
  if (!data || data.length === 0) return null;
  const labels = data.map((d) => formatLabel(d.period));
  const values = data.map((d) => d.cents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const summary = i18n.t("vermoegen:netWorthChartSummary", {
    from: formatEur(values[0] ?? 0),
    to: formatEur(values[values.length - 1] ?? 0),
  });

  const yMin = niceRound(min * 0.97, false);
  const yMax = niceRound(max * 1.03, true);

  const baseOption = createLineChartOption({ labels, values });
  const option = {
    ...baseOption,
    grid: { left: 72, right: 16, top: 16, bottom: 28 },
    yAxis: {
      type: "value",
      min: yMin,
      max: yMax,
      axisLabel: {
        color: "#6b7a80",
        fontSize: 11,
        formatter: (v: number) => {
          if (Math.abs(v) >= 100000) return `${(v / 100000).toFixed(0)}k${getCurrencySymbol()}`;
          return formatEur(v);
        },
      },
      splitLine: { lineStyle: { color: "#e7e0d0" } },
    },
  };

  return (
    <div>
      <div className="h-[160px]" role="img" aria-label={summary}>
        <ReactECharts
          option={option}
          style={{ height: "100%", width: "100%" }}
          opts={{ renderer: "svg" }}
        />
      </div>
      <span className="sr-only">{summary}</span>
    </div>
  );
}
