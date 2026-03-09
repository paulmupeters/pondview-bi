import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import type {
  CardConfig,
  Config,
  Result,
  TableConfig,
  TextConfig,
} from "@/lib/types";
import type { DashboardChart, LayoutRow, ResizeState } from "../types";
import { getGridColsClass } from "../utils";
import { MetricCardGroup } from "./MetricCardGroup";
import { SortableChartCard } from "./SortableChartCard";

type DashboardGridProps = {
  charts: DashboardChart[];
  chartData: Record<string, Result[]>;
  layoutRows: LayoutRow[];
  onDragEnd: (event: DragEndEvent) => void;
  onConfigChange: (chartId: string, newJson: string) => Promise<void>;
  onDelete: (chartId: string) => Promise<void>;
  expandedSqlChartId: string | null;
  onToggleSql: (chartId: string) => void;
  onSqlUpdate: (chartId: string, newSql: string) => Promise<void>;
  resizingChart: ResizeState;
  onResizeChange: (chartId: string, tempColSpan: number | null) => void;
  selectedChartId: string | null;
  onChartSelect: (chartId: string) => void;
  onPreviewChart: (chartId: string) => void;
};

export function DashboardGrid({
  charts,
  chartData,
  layoutRows,
  onDragEnd,
  onConfigChange,
  onDelete,
  expandedSqlChartId,
  onToggleSql,
  onSqlUpdate,
  resizingChart,
  onResizeChange,
  selectedChartId,
  onChartSelect,
  onPreviewChart,
}: DashboardGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <SortableContext
        items={charts.map((c) => c.id)}
        strategy={rectSortingStrategy}
      >
        {layoutRows.map((row, rowIndex) => {
          const rowKey =
            row.groups
              .map((group) => group.items.map((item) => item.id).join(","))
              .join("|") || `row-${rowIndex}`;
          // Check if any chart in this row is being resized
          const rowChartIds = row.groups.flatMap((g) =>
            g.items.map((item) => item.id),
          );
          const isRowResizing =
            resizingChart && rowChartIds.includes(resizingChart.chartId);
          return (
            <div key={rowKey} className="relative mb-6 last:mb-0">
              {/* Row-level resize snap indicator overlay */}
              {isRowResizing && (
                <div className="pointer-events-none absolute inset-x-0 top-0 bottom-0 z-50">
                  <div className="sticky top-2 flex justify-center mb-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-primary/50 bg-background/95 px-3 py-1.5 text-sm font-medium shadow-lg">
                      {resizingChart.tempColSpan} / {row.columns} columns
                    </span>
                  </div>
                  <div
                    className="grid h-full w-full gap-2 md:gap-4"
                    style={{
                      gridTemplateColumns: `repeat(${row.columns}, minmax(0, 1fr))`,
                    }}
                  >
                    {Array.from({ length: row.columns }).map((_, idx) => {
                      const guideKey = `snap-guide-${rowKey}-col-${idx + 1}`;
                      return (
                        <div
                          key={guideKey}
                          className={`rounded-lg border-2 border-dashed transition-colors ${
                            idx < resizingChart.tempColSpan
                              ? "border-primary bg-primary/10"
                              : "border-muted-foreground/30 bg-muted/20"
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
              <div
                className={`grid gap-2 md:gap-4 ${getGridColsClass(row.columns)}`}
              >
                {row.groups.map((group, groupIndex) => {
                  if (group.type === "metric-group") {
                    return (
                      <MetricCardGroup
                        key={`group-${group.items[0]?.id ?? groupIndex}-${rowKey}`}
                        charts={group.items}
                        chartData={chartData}
                        onConfigChange={onConfigChange}
                        onDelete={onDelete}
                        expandedSqlChartId={expandedSqlChartId}
                        onToggleSql={onToggleSql}
                        onSqlUpdate={onSqlUpdate}
                        totalColumns={row.columns}
                        selectedChartId={selectedChartId}
                        onChartSelect={onChartSelect}
                      />
                    );
                  }
                  // Render single chart/table/card as before
                  const chart = group.items[0];
                  let config:
                    | Config
                    | CardConfig
                    | TableConfig
                    | TextConfig
                    | null = null;
                  try {
                    const parsed = JSON.parse(chart.chartConfigJson);
                    config = parsed as
                      | Config
                      | CardConfig
                      | TableConfig
                      | TextConfig;
                  } catch {
                    config = null;
                  }
                  const rows = chartData[chart.id] || [];
                  return (
                    <SortableChartCard
                      key={chart.id}
                      chart={chart}
                      config={config}
                      rows={rows}
                      onConfigChange={(newJson) =>
                        onConfigChange(chart.id, newJson)
                      }
                      onDelete={() => onDelete(chart.id)}
                      expandedSqlChartId={expandedSqlChartId}
                      onToggleSql={onToggleSql}
                      onSqlUpdate={onSqlUpdate}
                      totalColumns={row.columns}
                      onResizeChange={(tempColSpan) =>
                        onResizeChange(chart.id, tempColSpan)
                      }
                      isSelected={selectedChartId === chart.id}
                      onSelect={onChartSelect}
                      onPreviewChart={onPreviewChart}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </SortableContext>
    </DndContext>
  );
}
