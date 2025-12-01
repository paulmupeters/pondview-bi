"use client";

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


  if (!effectiveChartConfig || !rows.length) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        No chart data available
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2">
      {/* Summary */}
      {summary && (
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">Query Results</h3>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>{summary.totalRows} rows</span>
            {summary.executionTimeMs && (
              <span>{summary.executionTimeMs}ms</span>
            )}
            {summary.queryType && <span>{summary.queryType}</span>}
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="w-full">
        <DynamicChart
          chartData={rows}
          chartConfig={effectiveChartConfig as Config}
        />
      </div>

      {/* Insights */}
      {summary?.insights && summary.insights.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium">Insights</h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {summary.insights.map((insight, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: we need to use the index as a key
              <li key={index} className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-primary mt-2 flex-shrink-0" />
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
