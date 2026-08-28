import ReactECharts from "echarts-for-react";
import { createSparklineOption } from "@/lib/charts/theme";

interface SparklineProps {
  values: number[];
}

export function Sparkline({ values }: SparklineProps) {
  if (values.length < 2) {
    return <div className="h-[26px] w-20" aria-hidden="true" />;
  }
  return (
    <div className="h-[26px] w-20" aria-hidden="true">
      <ReactECharts
        option={createSparklineOption(values)}
        style={{ height: "100%", width: "100%" }}
        opts={{ renderer: "svg" }}
      />
    </div>
  );
}
