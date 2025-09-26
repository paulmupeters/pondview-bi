"use client";

import { useArtifact } from "@ai-sdk-tools/artifacts/client";
import { ExecuteSqlArtifact } from "@/ai/artifacts/execute-sql";
import { DynamicChart } from "@/components/dynamic-chart";

export function SqlChart() {
  const sqlData = useArtifact(ExecuteSqlArtifact);

  if (!sqlData?.data || sqlData.data.stage !== "complete") {
    return null;
  }

  const { rows, chartConfig, summary } = sqlData.data;

  if (!chartConfig || !rows.length) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        No chart data available
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
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
        <DynamicChart chartData={rows} chartConfig={chartConfig} />
      </div>

      {/* Insights */}
      {summary?.insights && summary.insights.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium">Insights</h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {summary.insights.map((insight, index) => (
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
