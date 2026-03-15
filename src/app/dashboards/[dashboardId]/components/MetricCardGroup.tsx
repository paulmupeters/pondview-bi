import type { MetricCardGroupProps } from "../types";
import { getColSpanClass } from "../utils";
import { MetricCardInGroup } from "./MetricCardInGroup";

export function MetricCardGroup({
  charts,
  chartData,
  measuresById,
  measureValuesById,
  onConfigChange,
  onMeasureChange,
  onDelete,
  expandedSqlChartId,
  onToggleSql,
  onSqlUpdate,
  totalColumns,
  selectedChartId,
  onChartSelect,
}: MetricCardGroupProps) {
  const colSpanClass = getColSpanClass(
    Math.min(charts.length, totalColumns),
    totalColumns,
  );

  return (
    <div
      className={`group relative flex rounded-xl bg-card border border-border shadow-md divide-x divide-border overflow-hidden ${colSpanClass}`}
    >
      {charts.map((chart, index) => (
        <MetricCardInGroup
          key={chart.id}
          chart={chart}
          chartData={chartData}
          measure={(() => {
            try {
              const parsed = JSON.parse(chart.chartConfigJson) as {
                measureId?: string;
              };
              return parsed.measureId
                ? (measuresById[parsed.measureId] ?? null)
                : null;
            } catch {
              return null;
            }
          })()}
          measureValue={(() => {
            try {
              const parsed = JSON.parse(chart.chartConfigJson) as {
                measureId?: string;
              };
              return parsed.measureId
                ? (measureValuesById[parsed.measureId] ?? "")
                : undefined;
            } catch {
              return undefined;
            }
          })()}
          onConfigChange={onConfigChange}
          onMeasureChange={onMeasureChange}
          onDelete={onDelete}
          expandedSqlChartId={expandedSqlChartId}
          onToggleSql={onToggleSql}
          onSqlUpdate={onSqlUpdate}
          isFirst={index === 0}
          isLast={index === charts.length - 1}
          isSelected={selectedChartId === chart.id}
          onSelect={onChartSelect}
        />
      ))}
    </div>
  );
}
