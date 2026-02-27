import { DynamicChart } from "@/components/dynamic-chart";
import type { Config, Result } from "@/lib/types";

export function SqlChart({
  customChartConfig,
  dataOverride,
}: {
  customChartConfig?: Config;
    dataOverride?: {
      stage?: "loading" | "processing" | "analyzing" | "visualizing" | "complete";
    rows: Result[];
    chartConfig?: Config;
    summary?: {
      totalRows: number;
      executionTimeMs?: number;
      insights: string[];
      queryType?: string;
    };
  };
}) {
  const payload = dataOverride; // parent supplies data; avoid extra subscription

  if (!payload || payload.stage !== "complete") {
    return null;
  }

  const { rows, chartConfig, summary } = payload;

  const effectiveChartConfig = customChartConfig || chartConfig;
  const takeaway = effectiveChartConfig?.takeaway?.trim();
  const insights = (summary?.insights ?? []).filter(Boolean);
  const additionalInsights = takeaway
    ? insights.filter(
      (insight) => insight.trim().toLowerCase() !== takeaway.toLowerCase(),
    )
    : insights;


  if (!effectiveChartConfig || !rows.length) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        No chart data available
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">

      {/* Chart */}
      <div className="w-full">
        <DynamicChart
          chartData={rows}
          chartConfig={effectiveChartConfig as Config}
        />
      </div>

      {/* Takeaway + insights */}
      {(takeaway || additionalInsights.length > 0) && (
        <div className="space-y-3">
          {takeaway && (
            <div className="rounded-md border bg-muted/20 p-3">
              <h4 className="font-medium">Takeaway</h4>
              <p className="mt-1 text-sm text-muted-foreground">{takeaway}</p>
            </div>
          )}
          {additionalInsights.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium">
                {takeaway ? "" : "Insights"}
              </h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {additionalInsights.map((insight, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: we need to use the index as a key
                  <li key={index} className="flex items-start gap-2">
                    <span className="w-1 h-1 rounded-full bg-primary mt-2 shrink-0" />
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
