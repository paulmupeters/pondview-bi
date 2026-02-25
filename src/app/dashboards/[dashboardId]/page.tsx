"use client";

import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardSlicersBar } from "@/components/dashboard-slicers-bar";
import { TextConfigDialog } from "@/components/text-config-dialog";
import { Button } from "@/components/ui/button";
import type { Result, TextConfig } from "@/lib/types";
import {
  DashboardGrid,
  DashboardHeader,
  DashboardSettingsDialog,
} from "./components";
import { FilterProvider, useFilters } from "./filter-context";
import type { Dashboard, DashboardChart, ResizeState } from "./types";
import { buildRows, groupConsecutiveMetricCards } from "./utils";

export default function DashboardDetailPage() {
  const params = useParams<{ dashboardId: string }>();
  const dashboardId = params.dashboardId;
  return (
    <FilterProvider dashboardId={dashboardId}>
      <DashboardDetailPageContent dashboardId={dashboardId} />
    </FilterProvider>
  );
}

function DashboardDetailPageContent({ dashboardId }: { dashboardId: string }) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [charts, setCharts] = useState<DashboardChart[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<Record<string, Result[]>>({});
  const [columns, setColumns] = useState<number>(3);
  const [autoFitRows, setAutoFitRows] = useState<boolean>(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [expandedSqlChartId, setExpandedSqlChartId] = useState<string | null>(
    null,
  );
  const [resizingChart, setResizingChart] = useState<ResizeState>(null);
  const [selectedChartId, setSelectedChartId] = useState<string | null>(null);
  const [isAddingTextCard, setIsAddingTextCard] = useState(false);
  const { dashboardFilters, chartFiltersById } = useFilters();

  const filtersQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (dashboardFilters.length > 0) {
      params.set("dashboardFilters", JSON.stringify(dashboardFilters));
    }
    if (Object.keys(chartFiltersById).length > 0) {
      params.set("chartFilters", JSON.stringify(chartFiltersById));
    }
    const query = params.toString();
    return query ? `?${query}` : "";
  }, [dashboardFilters, chartFiltersById]);

  // Load saved preferences from localStorage
  useEffect(() => {
    const savedColumns = localStorage.getItem(
      `dashboard_${dashboardId}_columns`,
    );
    const savedAutoFit = localStorage.getItem(
      `dashboard_${dashboardId}_auto_fit_rows`,
    );
    if (savedColumns) {
      const parsed = parseInt(savedColumns, 10);
      if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 6) {
        setColumns(parsed);
      }
    }
    if (savedAutoFit === "false") {
      setAutoFitRows(false);
    }
  }, [dashboardId]);

  // Load dashboard metadata
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

  // Refresh dashboard data with filters
  const refreshDashboardData = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const res = await fetch(
          `/api/dashboard/${dashboardId}/data${filtersQueryString}`,
          {
            cache: "no-store",
            signal,
          },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          charts: (DashboardChart & {
            rows: Result[];
            filtersApplied?: boolean;
          })[];
        };
        if (signal?.aborted) return;
        const sortedCharts = [...data.charts].sort(
          (a, b) => a.position - b.position,
        );
        setCharts(sortedCharts);
        const map: Record<string, Result[]> = {};
        for (const c of data.charts) map[c.id] = c.rows;
        setChartData(map);
      } catch (error) {
        if (signal?.aborted) return;
        console.error("Failed to refresh dashboard data:", error);
      }
    },
    [dashboardId, filtersQueryString],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refreshDashboardData(controller.signal);
    return () => controller.abort();
  }, [refreshDashboardData]);

  // Title update handler
  const handleTitleUpdate = useCallback(
    async (newTitle: string) => {
      const res = await fetch(`/api/dashboards/${dashboardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      if (!res.ok) {
        throw new Error("Failed to update dashboard title");
      }
      setDashboard((prev) =>
        prev ? { ...prev, title: newTitle, updatedAt: Date.now() } : prev,
      );
    },
    [dashboardId],
  );

  // Persist chart order
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

  const handleAddTextCard = useCallback(
    async (textConfig: TextConfig) => {
      setIsAddingTextCard(true);
      try {
        const res = await fetch(`/api/dashboard/${dashboardId}/charts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: textConfig.title ?? "Text Card",
            description: textConfig.title ?? null,
            sql: "SELECT 1",
            dbIdentifier: "md:my_db",
            chartConfigJson: JSON.stringify(textConfig),
          }),
        });
        if (!res.ok) throw new Error("Failed to add text card");
        await refreshDashboardData();
      } catch (error) {
        console.error("Failed to add text card:", error);
      } finally {
        setIsAddingTextCard(false);
      }
    },
    [dashboardId, refreshDashboardData],
  );

  const handleChartDelete = useCallback(
    async (chartId: string) => {
      try {
        const res = await fetch(
          `/api/dashboard/${dashboardId}/charts?chartId=${chartId}`,
          {
            method: "DELETE",
          },
        );
        if (!res.ok) throw new Error("Failed to delete chart");
        setCharts((prev) => prev.filter((chart) => chart.id !== chartId));
        setSelectedChartId((prev) => (prev === chartId ? null : prev));
        setChartData((prev) => {
          const next = { ...prev };
          delete next[chartId];
          return next;
        });
      } catch (error) {
        console.error(error);
      }
    },
    [dashboardId],
  );

  const handleColumnsChange = useCallback(
    (value: string) => {
      const newColumns = parseInt(value, 10);
      setColumns(newColumns);
      localStorage.setItem(`dashboard_${dashboardId}_columns`, value);
      setIsSettingsOpen(false);
    },
    [dashboardId],
  );

  const handleAutoFitChange = useCallback(
    (checked: boolean) => {
      setAutoFitRows(checked);
      localStorage.setItem(
        `dashboard_${dashboardId}_auto_fit_rows`,
        checked ? "true" : "false",
      );
    },
    [dashboardId],
  );

  const handleToggleSql = useCallback((chartId: string) => {
    setExpandedSqlChartId((prev) => (prev === chartId ? null : chartId));
  }, []);

  const handleResizeChange = useCallback(
    (chartId: string, tempColSpan: number | null) => {
      if (tempColSpan !== null) {
        setResizingChart({ chartId, tempColSpan });
      } else {
        setResizingChart(null);
      }
    },
    [],
  );

  const handleSqlUpdate = useCallback(
    async (chartId: string, newSql: string) => {
      try {
        const res = await fetch(`/api/charts/${chartId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql: newSql }),
        });
        if (!res.ok) throw new Error("Failed to update SQL");

        setCharts((prev) =>
          prev.map((chart) =>
            chart.id === chartId ? { ...chart, sql: newSql } : chart,
          ),
        );

        // Re-fetch chart data to update the chart with new SQL
        const dataRes = await fetch(
          `/api/dashboard/${dashboardId}/data${filtersQueryString}`,
          {
            cache: "no-store",
          },
        );
        if (dataRes.ok) {
          const data = (await dataRes.json()) as {
            charts: (DashboardChart & {
              rows: Result[];
              filtersApplied?: boolean;
            })[];
          };
          const updatedChart = data.charts.find((c) => c.id === chartId);
          if (updatedChart) {
            setChartData((prev) => ({
              ...prev,
              [chartId]: updatedChart.rows,
            }));
          }
        }
      } catch (error) {
        console.error("Failed to update SQL:", error);
        throw error;
      }
    },
    [dashboardId, filtersQueryString],
  );

  useEffect(() => {
    if (!selectedChartId) return;
    if (!charts.some((chart) => chart.id === selectedChartId)) {
      setSelectedChartId(null);
    }
  }, [charts, selectedChartId]);

  const chartGroups = useMemo(
    () => groupConsecutiveMetricCards(charts, chartData),
    [charts, chartData],
  );

  const layoutRows = useMemo(
    () =>
      autoFitRows
        ? buildRows(chartGroups, columns)
        : [
            {
              columns,
              groups: chartGroups,
            },
          ],
    [chartGroups, columns, autoFitRows],
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
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <DashboardHeader
          dashboard={dashboard}
          onTitleUpdate={handleTitleUpdate}
        />
        <div className="flex items-center gap-2">
          <TextConfigDialog
            trigger={
              <Button
                variant="outline"
                size="default"
                disabled={isAddingTextCard}
              >
                Add Text Card
              </Button>
            }
            config={null}
            onConfigChange={(newConfig) => {
              void handleAddTextCard(newConfig);
            }}
          />
          <DashboardSettingsDialog
            isOpen={isSettingsOpen}
            onOpenChange={setIsSettingsOpen}
            columns={columns}
            onColumnsChange={handleColumnsChange}
            autoFitRows={autoFitRows}
            onAutoFitChange={handleAutoFitChange}
          />
        </div>
      </div>
      <DashboardSlicersBar
        dashboardId={dashboardId}
        selectedChartId={selectedChartId}
        onClearChartSelection={() => setSelectedChartId(null)}
      />

      <DashboardGrid
        charts={charts}
        chartData={chartData}
        layoutRows={layoutRows}
        onDragEnd={handleDragEnd}
        onConfigChange={handleChartConfigChange}
        onDelete={handleChartDelete}
        expandedSqlChartId={expandedSqlChartId}
        onToggleSql={handleToggleSql}
        onSqlUpdate={handleSqlUpdate}
        resizingChart={resizingChart}
        onResizeChange={handleResizeChange}
        selectedChartId={selectedChartId}
        onChartSelect={setSelectedChartId}
      />
    </div>
  );
}
