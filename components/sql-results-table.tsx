"use client";

import { useArtifact } from "@ai-sdk-tools/artifacts/client";
import { ExecuteSqlArtifact } from "@/ai/artifacts/execute-sql";

export function SqlResultsTable() {
  const sqlData = useArtifact(ExecuteSqlArtifact);

  if (!sqlData?.data || sqlData.data.stage !== "complete") {
    return null;
  }

  const { columns, rows, summary } = sqlData.data;

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
            {summary.queryType && (
              <span>{summary.queryType}</span>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-96">
          <table className="w-full border-collapse">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                {columns.map((column, index) => (
                  <th
                    key={index}
                    className="text-left p-3 font-medium text-sm border-b border-border"
                  >
                    {column.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="hover:bg-muted/30 border-b border-border last:border-b-0"
                >
                  {columns.map((column, colIndex) => (
                    <td
                      key={colIndex}
                      className="p-3 text-sm max-w-xs truncate"
                      title={String(row[column.name] || "")}
                    >
                      {String(row[column.name] || "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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