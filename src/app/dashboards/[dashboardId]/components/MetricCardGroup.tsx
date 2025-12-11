"use client";

import type { MetricCardGroupProps } from "../types";
import { getColSpanClass } from "../utils";
import { MetricCardInGroup } from "./MetricCardInGroup";

export function MetricCardGroup({
  charts,
  chartData,
  onConfigChange,
  onDelete,
  expandedSqlChartId,
  onToggleSql,
  onSqlUpdate,
  totalColumns,
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
          onConfigChange={onConfigChange}
          onDelete={onDelete}
          expandedSqlChartId={expandedSqlChartId}
          onToggleSql={onToggleSql}
          onSqlUpdate={onSqlUpdate}
          isFirst={index === 0}
          isLast={index === charts.length - 1}
        />
      ))}
    </div>
  );
}
