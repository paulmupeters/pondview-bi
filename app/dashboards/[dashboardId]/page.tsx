"use client";

import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Settings } from "lucide-react";
import { useParams } from "next/navigation";
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { ChartConfigDialog } from "@/components/chart-config-dialog";
import { DynamicChart } from "@/components/dynamic-chart";
import type { Config, Result } from "@/lib/types";

type Dashboard = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};
type DashboardChart = {
  id: string;
  title: string | null;
  description: string | null;
  sql: string;
  dbIdentifier: string | null;
  chartConfigJson: string;
  position: number;
  createdAt: number;
  updatedAt: number;
};

type SortableChartCardProps = {
  chart: DashboardChart;
  config: Config | null;
  rows: Result[];
  onConfigChange: (newChartJson: string) => Promise<void>;
};

function SortableChartCard({
  chart,
  config,
  rows,
  onConfigChange,
}: SortableChartCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: chart.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative flex flex-col rounded-xl bg-card p-4 md:p-2"
    >
      <div className="absolute left-2 top-2 flex items-center gap-1">
        <button
          type="button"
          aria-label="Reorder chart"
          title="Drag to reorder"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-input bg-background text-muted-foreground hover:bg-muted"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
      {config && rows.length > 0 ? (
        <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
          <ChartConfigDialog
            trigger={
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Configure chart"
                title="Configure chart"
              >
                <Settings className="h-4 w-4" />
              </button>
            }
            config={config}
            columns={Object.keys(rows[0] || {}).map((name) => ({
              name,
            }))}
            rows={rows}
            onConfigChange={async (newConfig) => {
              const newJson = JSON.stringify(newConfig);
              await onConfigChange(newJson);
            }}
          />
        </div>
      ) : null}
      {config && rows.length > 0 ? (
        <DynamicChart
          chartData={rows}
          chartConfig={config}
          className="w-full"
        />
      ) : (
        <div className="text-xs text-muted-foreground">No data</div>
      )}
    </div>
  );
}

export default function DashboardDetailPage() {
  const params = useParams<{ dashboardId: string }>();
  const dashboardId = params.dashboardId;
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [charts, setCharts] = useState<DashboardChart[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<Record<string, Result[]>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/dashboards`);
        if (res.ok) {
          const list = (await res.json()) as { dashboards: Dashboard[] };
          const d = list.dashboards.find((x) => x.id === dashboardId) || null;
          if (!cancelled) setDashboard(d);
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dashboardId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/dashboard/${dashboardId}/data`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        charts: (DashboardChart & { rows: Result[] })[];
      };
      if (cancelled) return;
      const sortedCharts = [...data.charts].sort(
        (a, b) => a.position - b.position,
      );
      setCharts(sortedCharts);
      const map: Record<string, Result[]> = {};
      for (const c of data.charts) map[c.id] = c.rows;
      setChartData(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [dashboardId]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const persistOrder = useCallback(
    async (previousOrder: DashboardChart[], nextOrder: DashboardChart[]) => {
      try {
        const res = await fetch(`/api/dashboard/${dashboardId}/charts`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chartIds: nextOrder.map((chart) => chart.id),
          }),
        });
        if (!res.ok) throw new Error("Failed to save order");
      } catch (error) {
        console.error(error);
        setCharts(previousOrder);
      }
    },
    [dashboardId],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setCharts((prev) => {
        const oldIndex = prev.findIndex((item) => item.id === active.id);
        const newIndex = prev.findIndex((item) => item.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return prev;
        const previousOrder = prev.map((chart, index) => ({
          ...chart,
          position: index,
        }));
        const moved = arrayMove(prev, oldIndex, newIndex);
        const nextOrder = moved.map((chart, index) => ({
          ...chart,
          position: index,
        }));
        void persistOrder(previousOrder, nextOrder);
        return nextOrder;
      });
    },
    [persistOrder],
  );

  const handleChartConfigChange = useCallback(
    async (chartId: string, newJson: string) => {
      setCharts((prev) =>
        prev.map((chart) =>
          chart.id === chartId ? { ...chart, chartConfigJson: newJson } : chart,
        ),
      );
      await fetch(`/api/charts/${chartId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chartConfigJson: newJson }),
      });
    },
    [],
  );

  if (loading)
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!dashboard)
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Dashboard not found
      </div>
    );

  return (
    <div className="mx-auto flex h-full w-full flex-col gap-1 overflow-y-auto px-6 md:px-12 lg:px-18 pt-2 pb-6 md:pb-10">
      <h1 className="text-2xl font-semibold">{dashboard.title}</h1>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext
          items={charts.map((c) => c.id)}
          strategy={rectSortingStrategy}
        >
          <div className="grid gap-6 md:grid-cols-2">
            {charts.map((c) => {
              let config: Config | null = null;
              try {
                config = JSON.parse(c.chartConfigJson) as Config;
              } catch {
                config = null;
              }
              const rows = chartData[c.id] || [];
              return (
                <SortableChartCard
                  key={c.id}
                  chart={c}
                  config={config}
                  rows={rows}
                  onConfigChange={(newJson) =>
                    handleChartConfigChange(c.id, newJson)
                  }
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
