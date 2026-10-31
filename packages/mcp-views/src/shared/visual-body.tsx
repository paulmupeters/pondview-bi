import { DynamicChart } from "@/components/dynamic-chart";
import { MetricCard } from "@/components/metric-card";
import type { Config, Result } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { VisualKind, VisualPayload } from "../visual/visual-payload";
import { Message } from "./message";

const TABLE_ROW_LIMIT = 200;

// Renders a visual's rows as a chart, metric card, or table. With `fill`, the
// body stretches to its container (dashboard cards) instead of a fixed height.
export function VisualBody({
  payload,
  kind,
  fill = false,
}: {
  payload: VisualPayload;
  kind: VisualKind;
  fill?: boolean;
}) {
  if (payload.rows.length === 0) {
    return <Message>The query returned no rows.</Message>;
  }

  if (kind === "card") {
    const firstColumn = payload.columns[0]?.name;
    const value = firstColumn ? payload.rows[0]?.[firstColumn] : undefined;
    return (
      <MetricCard
        value={value as string | number | boolean | null | undefined}
        title={payload.title}
        showTitle={false}
      />
    );
  }

  if (kind === "table") {
    return <ResultsTable payload={payload} fill={fill} />;
  }

  return (
    <DynamicChart
      chartData={payload.rows as Result[]}
      chartConfig={{ ...payload.config, type: kind } as Config}
      chartHeightClassName="h-[300px]"
      fillAvailableHeight={fill}
      showMetadata={false}
    />
  );
}

export function ResultsTable({
  payload,
  fill = false,
}: {
  payload: VisualPayload;
  fill?: boolean;
}) {
  const rows = payload.rows.slice(0, TABLE_ROW_LIMIT);
  return (
    <div
      className={cn(
        "overflow-auto rounded-md border",
        fill ? "h-full min-h-0" : "max-h-[360px]",
      )}
    >
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-background">
          <tr>
            {payload.columns.map((column) => (
              <th
                key={column.name}
                className="border-b px-2 py-1.5 font-medium"
              >
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: result rows have no stable id
            <tr key={index} className="border-b last:border-0">
              {payload.columns.map((column) => (
                <td key={column.name} className="px-2 py-1 tabular-nums">
                  {formatCell(row[column.name])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
