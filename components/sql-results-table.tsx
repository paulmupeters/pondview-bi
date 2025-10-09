"use client";

import { useArtifact } from "@ai-sdk-tools/artifacts/client";
import { ExecuteSqlArtifact } from "@/ai/artifacts/execute-sql";

export function SqlResultsTable({
  dataOverride,
}: {
  dataOverride?: {
    stage?: "loading" | "processing" | "analyzing" | "complete";
    columns: { name: string; type?: string }[];
    rows: Record<string, unknown>[];
    summary?: {
      totalRows: number;
      executionTimeMs?: number;
      insights: string[];
      queryType?: string;
    };
  };
}) {
  const sqlData = useArtifact(ExecuteSqlArtifact);

  const payload = dataOverride ?? sqlData?.data;

  if (!payload || payload.stage !== "complete") {
    return null;
  }

  const { columns, rows, summary } = payload;

  if (!rows.length) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        No results found
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

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-96">
          <table className="w-full border-collapse">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.name}
                    className="text-left p-3 font-medium text-sm border-b border-border"
                  >
                    {column.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowKey = columns
                  .map((c) => String(row[c.name] ?? ""))
                  .join("|");
                return (
                  <tr
                    key={rowKey}
                  className="hover:bg-muted/30 border-b border-border last:border-b-0"
                >
                    {columns.map((column) => (
                    <td
                      key={column.name}
                      className="p-3 text-sm max-w-xs truncate"
                      title={String(row[column.name] || "")}
                    >
                      {String(row[column.name] || "")}
                    </td>
                  ))}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Insights */}
      {summary?.insights && summary.insights.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium">Insights</h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {summary.insights.map((insight) => (
              <li key={insight} className="flex items-start gap-2">
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
