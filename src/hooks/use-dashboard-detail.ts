import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useCallback, useEffect, useState } from "react";
import { runQuery } from "@/lib/sql/run-query";
import type { CardConfig, Config, Result } from "@/lib/types";
import {
  listChartsByDashboard,
  listDashboards,
  removeChartFromDashboard,
  reorderDashboardCharts,
  updateChartConfig,
} from "@/lib/workspace/dashboard-repo";

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
  dashboardId: string,
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
        const dashboards = await listDashboards();
        const foundDashboard =
          dashboards.find((item) => item.id === dashboardId) ?? null;
        if (!cancelled) {
          setDashboard(foundDashboard as Dashboard | null);
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
      const dashboardCharts = await listChartsByDashboard(dashboardId);
      const sortedCharts = [...dashboardCharts].sort((a, b) => a.position - b.position);
      if (cancelled) {
        return;
      }

      setCharts(sortedCharts);

      const map: Record<string, Result[]> = {};
      await Promise.all(
        sortedCharts.map(async (chart) => {
          try {
            const result = await runQuery({
              sql: chart.sql,
              dbIdentifier: chart.dbIdentifier ?? undefined,
            });
            map[chart.id] = result.rows as Result[];
          } catch {
            map[chart.id] = [];
          }
        }),
      );

      if (!cancelled) {
        setChartData(map);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dashboardId]);

  const persistOrder = useCallback(
    async (previousOrder: DashboardChart[], nextOrder: DashboardChart[]) => {
      try {
        await reorderDashboardCharts(
          dashboardId,
          nextOrder.map((chart) => chart.id),
        );
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
      await updateChartConfig(chartId, newJson);
    },
    [],
  );

  const handleChartDelete = useCallback(async (chartId: string) => {
    try {
      await removeChartFromDashboard(chartId);
      setCharts((prev) => prev.filter((chart) => chart.id !== chartId));
      setChartData((prev) => {
        const next = { ...prev };
        delete next[chartId];
        return next;
      });
    } catch (error) {
      console.error(error);
    }
  }, []);

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
