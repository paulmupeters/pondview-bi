import {
  type EventCallback,
  type Layout,
  ResponsiveGridLayout,
  type ResponsiveLayouts,
  useContainerWidth,
} from "react-grid-layout";
import {
  formatFirstRowMeasureValue,
  type MeasureOption,
  type MeasureRenderContextByName,
} from "@/lib/dashboard/measures";
import type { Result } from "@/lib/types";
import type { WorkspaceDashboardMeasure } from "@/lib/workspace/workspace-db";
import type { DashboardChart, DashboardChartLayout } from "../types";
import { getChartColSpan, isCardConfig, parseChartConfig } from "../utils";
import { DashboardChartCard } from "./SortableChartCard";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

type DashboardGridProps = {
  charts: DashboardChart[];
  chartData: Record<string, Result[]>;
  measures: MeasureRenderContextByName;
  measureOptions: MeasureOption[];
  measuresById: Record<string, WorkspaceDashboardMeasure>;
  measureValuesById: Record<string, string>;
  dashboardColumns: number;
  onLayoutCommit: (
    layouts: Array<{
      chartId: string;
      layout: DashboardChartLayout;
      position: number;
    }>,
  ) => void;
  onConfigChange: (chartId: string, newJson: string) => Promise<void>;
  onMeasureChange: (
    measureId: string,
    updates: Pick<WorkspaceDashboardMeasure, "label" | "sql">,
  ) => Promise<void>;
  onDelete: (chartId: string) => Promise<void>;
  expandedSqlChartId: string | null;
  onToggleSql: (chartId: string) => void;
  onSqlUpdate: (chartId: string, newSql: string) => Promise<void>;
  selectedChartId: string | null;
  onChartSelect: (chartId: string) => void;
  onPreviewChart: (chartId: string) => void;
  readOnly?: boolean;
};

const ROW_HEIGHT = 120;
const DEFAULT_TILE_HEIGHT = 3;
const MIN_TILE_WIDTH = 1;
const MIN_TILE_HEIGHT = 2;
const MAX_TILE_HEIGHT = 12;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getChartLayout(
  chart: DashboardChart,
  columns: number,
): DashboardChartLayout {
  const hasPersistedLayout =
    chart.layoutX !== null &&
    chart.layoutX !== undefined &&
    chart.layoutY !== null &&
    chart.layoutY !== undefined &&
    chart.layoutW !== null &&
    chart.layoutW !== undefined &&
    chart.layoutH !== null &&
    chart.layoutH !== undefined;

  if (hasPersistedLayout) {
    const w = clamp(
      Math.round(chart.layoutW as number),
      MIN_TILE_WIDTH,
      columns,
    );
    return {
      x: clamp(
        Math.round(chart.layoutX as number),
        0,
        Math.max(0, columns - w),
      ),
      y: Math.max(0, Math.round(chart.layoutY as number)),
      w,
      h: clamp(
        Math.round(chart.layoutH as number),
        MIN_TILE_HEIGHT,
        MAX_TILE_HEIGHT,
      ),
    };
  }

  const w = clamp(getChartColSpan(chart, columns), MIN_TILE_WIDTH, columns);
  const position = Math.max(0, chart.position);
  return {
    x: (position % columns) % Math.max(1, columns - w + 1),
    y: Math.floor(position / columns) * DEFAULT_TILE_HEIGHT,
    w,
    h: DEFAULT_TILE_HEIGHT,
  };
}

function chartsToLayout(charts: DashboardChart[], columns: number): Layout {
  return charts.map((chart) => {
    const layout = getChartLayout(chart, columns);
    return {
      i: chart.id,
      x: layout.x,
      y: layout.y,
      w: layout.w,
      h: layout.h,
      minW: MIN_TILE_WIDTH,
      minH: MIN_TILE_HEIGHT,
      maxW: columns,
      maxH: MAX_TILE_HEIGHT,
    };
  });
}

function layoutForColumns(layout: Layout, columns: number): Layout {
  return layout.map((item, index) => {
    const w = clamp(item.w, MIN_TILE_WIDTH, columns);
    return {
      ...item,
      x: clamp(item.x, 0, Math.max(0, columns - w)),
      y: item.y ?? index * DEFAULT_TILE_HEIGHT,
      w,
      maxW: columns,
    };
  });
}

function sortLayoutForPosition(layout: Layout): Layout {
  return [...layout].sort((left, right) => {
    if (left.y !== right.y) return left.y - right.y;
    if (left.x !== right.x) return left.x - right.x;
    return left.i.localeCompare(right.i);
  });
}

export function DashboardGrid({
  charts,
  chartData,
  measures,
  measureOptions,
  measuresById,
  measureValuesById,
  dashboardColumns,
  onLayoutCommit,
  onConfigChange,
  onMeasureChange,
  onDelete,
  expandedSqlChartId,
  onToggleSql,
  onSqlUpdate,
  selectedChartId,
  onChartSelect,
  onPreviewChart,
  readOnly = false,
}: DashboardGridProps) {
  const { width, containerRef, mounted } = useContainerWidth({
    measureBeforeMount: true,
    initialWidth: 1200,
  });

  const columns = Math.max(1, dashboardColumns);
  const baseLayout = chartsToLayout(charts, columns);
  const layouts: ResponsiveLayouts<"lg" | "md" | "sm" | "xs"> = {
    lg: baseLayout,
    md: layoutForColumns(baseLayout, Math.min(columns, 4)),
    sm: layoutForColumns(baseLayout, Math.min(columns, 2)),
    xs: layoutForColumns(baseLayout, 1),
  };

  const commitLayout = (layout: Layout) => {
    const positions = new Map(
      sortLayoutForPosition(layout).map((item, index) => [item.i, index]),
    );

    onLayoutCommit(
      layout.map((item) => ({
        chartId: item.i,
        layout: { x: item.x, y: item.y, w: item.w, h: item.h },
        position: positions.get(item.i) ?? 0,
      })),
    );
  };

  const handleDragStop: EventCallback = (layout) => commitLayout(layout);
  const handleResizeStop: EventCallback = (layout) => commitLayout(layout);

  return (
    <div ref={containerRef}>
      {mounted ? (
        <ResponsiveGridLayout
          width={width}
          layouts={layouts}
          breakpoints={{ lg: 1200, md: 996, sm: 640, xs: 0 }}
          cols={{
            lg: columns,
            md: Math.min(columns, 4),
            sm: Math.min(columns, 2),
            xs: 1,
          }}
          rowHeight={ROW_HEIGHT}
          margin={[16, 16]}
          containerPadding={[0, 0]}
          dragConfig={{
            enabled: !readOnly,
            handle: ".dashboard-tile-drag-handle",
            threshold: 8,
          }}
          resizeConfig={{
            enabled: !readOnly,
            handles: ["se", "sw", "ne", "nw"],
          }}
          onDragStop={handleDragStop}
          onResizeStop={handleResizeStop}
          compactor={undefined}
        >
          {charts.map((chart) => {
            const config = parseChartConfig(chart);
            const rows = chartData[chart.id] || [];
            const measureId =
              config && isCardConfig(config) ? config.measureId : undefined;
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
              <div key={chart.id} className="h-full">
                <DashboardChartCard
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
                  isSelected={selectedChartId === chart.id}
                  onSelect={onChartSelect}
                  onPreviewChart={onPreviewChart}
                  readOnly={readOnly}
                />
              </div>
            );
          })}
        </ResponsiveGridLayout>
      ) : null}
    </div>
  );
}
