import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import {
  formatFirstRowMeasureValue,
  type MeasureOption,
  type MeasureRenderContextByName,
} from "@/lib/dashboard/measures";
import type { Result } from "@/lib/types";
import type { WorkspaceDashboardMeasure } from "@/lib/workspace/workspace-db";
import type { DashboardChart, LayoutRow, ResizeState } from "../types";
import { getGridColsClass, isCardConfig, parseChartConfig } from "../utils";
import { MetricCardGroup } from "./MetricCardGroup";
import { SortableChartCard } from "./SortableChartCard";

type DashboardGridProps = {
  charts: DashboardChart[];
  chartData: Record<string, Result[]>;
  measures: MeasureRenderContextByName;
  measureOptions: MeasureOption[];
  measuresById: Record<string, WorkspaceDashboardMeasure>;
  measureValuesById: Record<string, string>;
  layoutRows: LayoutRow[];
  dashboardColumns: number;
  onDragEnd: (event: DragEndEvent) => void;
  onConfigChange: (chartId: string, newJson: string) => Promise<void>;
  onMeasureChange: (
    measureId: string,
    updates: Pick<WorkspaceDashboardMeasure, "label" | "sql">,
  ) => Promise<void>;
  onDelete: (chartId: string) => Promise<void>;
  expandedSqlChartId: string | null;
  onToggleSql: (chartId: string) => void;
  onSqlUpdate: (chartId: string, newSql: string) => Promise<void>;
  resizingChart: ResizeState;
  onResizeOpen: (chartId: string, currentColSpan: number) => void;
  onResizeClose: () => void;
  onResizeSelect: (
    chartId: string,
    mode: "single" | "equalize" | "fit",
    targetColSpan?: number,
  ) => Promise<void> | void;
  selectedChartId: string | null;
  onChartSelect: (chartId: string) => void;
  onPreviewChart: (chartId: string) => void;
};

export function DashboardGrid({
  charts,
  chartData,
  measures,
  measureOptions,
  measuresById,
  measureValuesById,
  layoutRows,
  dashboardColumns,
  onDragEnd,
  onConfigChange,
  onMeasureChange,
  onDelete,
  expandedSqlChartId,
  onToggleSql,
  onSqlUpdate,
  resizingChart,
  onResizeOpen,
  onResizeClose,
  onResizeSelect,
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
          const previewItems = isRowResizing ? resizingChart.previewSpans : [];
          const previewMap = new Map(
            previewItems
              .filter((item) => item.chartId)
              .map((item) => [item.chartId as string, item.colSpan]),
          );
          const equalizedSpans = previewItems
            .filter((item) => item.kind === "single" && item.chartId)
            .map((item) => item.colSpan);
          return (
            <div key={rowKey} className="relative mb-6 last:mb-0">
              {/* Row-level resize snap indicator overlay */}
              {isRowResizing && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={onResizeClose}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") onResizeClose();
                    }}
                    aria-label="Cancel resize"
                  />
                  <div className="pointer-events-none absolute inset-x-0 top-0 bottom-0 z-50">
                    <div className="sticky top-2 flex justify-center mb-2">
                      <div className="pointer-events-auto flex max-w-[min(100%,calc(100vw-3rem))] flex-wrap items-center justify-center gap-2 rounded-2xl border border-primary/50 bg-background/95 px-3 py-2 text-sm font-medium shadow-lg">
                        <span className="px-1 text-center">
                          {resizingChart.mode === "equalize"
                            ? `Split evenly: ${equalizedSpans.join(" + ")}`
                            : resizingChart.mode === "fit"
                              ? `Fit row: ${equalizedSpans.join(" + ")}`
                              : `${previewMap.get(resizingChart.chartId) ?? 1} / ${dashboardColumns} columns`}
                        </span>
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          {Array.from({ length: dashboardColumns }).map(
                            (_, index) => {
                              const nextSpan = index + 1;
                              const isActive =
                                resizingChart.mode === "single" &&
                                (previewMap.get(resizingChart.chartId) ?? 0) ===
                                  nextSpan;
                              return (
                                <button
                                  key={`resize-span-${rowKey}-${nextSpan}`}
                                  type="button"
                                  className={`rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${
                                    isActive
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border bg-background text-foreground hover:bg-muted"
                                  }`}
                                  onClick={() =>
                                    void onResizeSelect(
                                      resizingChart.chartId,
                                      "single",
                                      nextSpan,
                                    )
                                  }
                                >
                                  {nextSpan}/{dashboardColumns}
                                </button>
                              );
                            },
                          )}
                        </div>
                        {resizingChart.canFit ? (
                          <button
                            type="button"
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                              resizingChart.mode === "fit"
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background text-foreground hover:bg-muted"
                            }`}
                            onClick={() =>
                              void onResizeSelect(resizingChart.chartId, "fit")
                            }
                          >
                            Fill
                          </button>
                        ) : null}
                        {resizingChart.canEqualize ? (
                          <button
                            type="button"
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                              resizingChart.mode === "equalize"
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background text-foreground hover:bg-muted"
                            }`}
                            onClick={() =>
                              void onResizeSelect(
                                resizingChart.chartId,
                                "equalize",
                              )
                            }
                          >
                            Equalize
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                          onClick={onResizeClose}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </>
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
                        measuresById={measuresById}
                        measureValuesById={measureValuesById}
                        onConfigChange={onConfigChange}
                        onMeasureChange={onMeasureChange}
                        onDelete={onDelete}
                        expandedSqlChartId={expandedSqlChartId}
                        onToggleSql={onToggleSql}
                        onSqlUpdate={onSqlUpdate}
                        totalColumns={row.columns}
                        selectedChartId={selectedChartId}
                        onChartSelect={onChartSelect}
                        onPreviewChart={onPreviewChart}
                      />
                    );
                  }
                  // Render single chart/table/card as before
                  const chart = group.items[0];
                  const config = parseChartConfig(chart);
                  const rows = chartData[chart.id] || [];
                  const measureId =
                    config && isCardConfig(config)
                      ? config.measureId
                      : undefined;
                  const measure = measureId
                    ? (measuresById[measureId] ?? null)
                    : null;
                  const measureValue =
                    measure && measureValuesById[measure.id] !== undefined
                      ? measureValuesById[measure.id]
                      : measure
                        ? formatFirstRowMeasureValue(rows)
                        : undefined;
                  return (
                    <SortableChartCard
                      key={chart.id}
                      chart={chart}
                      config={config}
                      rows={rows}
                      measures={measures}
                      measureOptions={measureOptions}
                      measure={measure}
                      measureValue={measureValue}
                      onConfigChange={(newJson) =>
                        onConfigChange(chart.id, newJson)
                      }
                      onMeasureChange={
                        measure
                          ? (nextMeasureId, updates) =>
                              onMeasureChange(nextMeasureId, updates)
                          : undefined
                      }
                      onDelete={() => onDelete(chart.id)}
                      expandedSqlChartId={expandedSqlChartId}
                      onToggleSql={onToggleSql}
                      onSqlUpdate={onSqlUpdate}
                      totalColumns={row.columns}
                      onResizeOpen={onResizeOpen}
                      previewColSpan={previewMap.get(chart.id) ?? null}
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
