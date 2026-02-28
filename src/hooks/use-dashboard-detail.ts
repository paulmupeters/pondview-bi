import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useCallback, useEffect, useState } from "react";
import type { CardConfig, Config, Result } from "@/lib/types";

export type Dashboard = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type DashboardChart = {
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

type UseDashboardDetailReturn = {
  dashboard: Dashboard | null;
  charts: DashboardChart[];
  chartData: Record<string, Result[]>;
  loading: boolean;
  handleDragEnd: (event: DragEndEvent) => void;
  handleChartConfigChange: (chartId: string, newJson: string) => Promise<void>;
  handleChartDelete: (chartId: string) => Promise<void>;
};

export function useDashboardDetail(
  dashboardId: string
): UseDashboardDetailReturn {
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
        if (!res.ok) return;
        const list = (await res.json()) as { dashboards: Dashboard[] };
        const foundDashboard =
          list.dashboards.find((item) => item.id === dashboardId) ?? null;
        if (!cancelled) {
          setDashboard(foundDashboard);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
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
        (a, b) => a.position - b.position
      );
      setCharts(sortedCharts);
      const map: Record<string, Result[]> = {};
      for (const chart of data.charts) {
        map[chart.id] = chart.rows;
      }
      setChartData(map);
    })();

    return () => {
      cancelled = true;
    };
  }, [dashboardId]);

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
    [dashboardId]
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
    [persistOrder]
  );

  const handleChartConfigChange = useCallback(
    async (chartId: string, newJson: string) => {
      setCharts((prev) =>
        prev.map((chart) =>
          chart.id === chartId ? { ...chart, chartConfigJson: newJson } : chart
        )
      );
      await fetch(`/api/charts/${chartId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chartConfigJson: newJson }),
      });
    },
    []
  );

  const handleChartDelete = useCallback(
    async (chartId: string) => {
      try {
        const res = await fetch(
          `/api/dashboard/${dashboardId}/charts?chartId=${chartId}`,
          {
            method: "DELETE",
          }
        );
        if (!res.ok) throw new Error("Failed to delete chart");
        setCharts((prev) => prev.filter((chart) => chart.id !== chartId));
        setChartData((prev) => {
          const next = { ...prev };
          delete next[chartId];
          return next;
        });
      } catch (error) {
        console.error(error);
      }
    },
    [dashboardId]
  );

  return {
    dashboard,
    charts,
    chartData,
    loading,
    handleDragEnd,
    handleChartConfigChange,
    handleChartDelete,
  };
}
