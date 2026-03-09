import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useSearchParams } from '@/vite/next-navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { TextConfigDialog } from "@/components/text-config-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DynamicChart } from "@/components/dynamic-chart";
import { SqlResultsTable } from "@/components/sql-results-table";
import { runQuery } from "@/lib/sql/run-query";
import { DEFAULT_WASM_DB_IDENTIFIER } from "@/lib/sql/sql-runtime";
import type {
  CardConfig,
  Config,
  Result,
  TableConfig,
  TextConfig,
} from "@/lib/types";
import {
  addChartToDashboard,
  listChartsByDashboard,
  listDashboards,
  removeChartFromDashboard,
  reorderDashboardCharts,
  updateChartConfig,
  updateChartSql,
  updateDashboardTitle,
} from "@/lib/workspace/dashboard-repo";
import { getPreference, setPreference } from "@/lib/workspace/preferences-repo";
import {
  DashboardGrid,
  DashboardHeader,
  DashboardSettingsDialog,
} from "../[dashboardId]/components";
import { FilterProvider } from "../[dashboardId]/filter-context";
import type {
  Dashboard,
  DashboardChart,
  ResizeState,
} from "../[dashboardId]/types";
import { isCardConfig, isTableConfig, isTextConfig } from "../[dashboardId]/utils";
import { buildRows, groupConsecutiveMetricCards } from "../[dashboardId]/utils";

const PREF_COLUMNS_PREFIX = "dashboard:columns:";
const PREF_AUTOFIT_PREFIX = "dashboard:auto-fit:";

export default function DashboardViewPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading...</div>}>
      <DashboardViewPageContent />
    </Suspense>
  );
}

function DashboardViewPageContent() {
  const searchParams = useSearchParams();
  const dashboardId = searchParams.get("id");

  if (!dashboardId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Missing dashboard id
      </div>
    );
  }

  return <DashboardDetailPageContent dashboardId={dashboardId} />;
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
  const [previewChartId, setPreviewChartId] = useState<string | null>(null);
  const [isAddingTextCard, setIsAddingTextCard] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const savedColumns = await getPreference<number>(`${PREF_COLUMNS_PREFIX}${dashboardId}`);
      const savedAutoFit = await getPreference<boolean>(`${PREF_AUTOFIT_PREFIX}${dashboardId}`);
      if (cancelled) return;
      if (typeof savedColumns === "number" && savedColumns >= 1 && savedColumns <= 6) {
        setColumns(savedColumns);
      }
      if (typeof savedAutoFit === "boolean") {
        setAutoFitRows(savedAutoFit);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dashboardId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const dashboards = await listDashboards();
        const selected = dashboards.find((item) => item.id === dashboardId) ?? null;
        if (!cancelled) {
          setDashboard(selected as Dashboard | null);
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

  const refreshDashboardData = useCallback(async () => {
    try {
      const dashboardCharts = await listChartsByDashboard(dashboardId);
      const sortedCharts = [...dashboardCharts].sort((a, b) => a.position - b.position);
      setCharts(sortedCharts);

      const chartRows = await Promise.all(
        sortedCharts.map(async (chart) => {
          try {
            const result = await runQuery({
              sql: chart.sql,
              dbIdentifier: chart.dbIdentifier ?? undefined,
            });
            return { chartId: chart.id, rows: result.rows as Result[] };
          } catch (error) {
            console.error(`[Dashboard] Failed to execute chart ${chart.id}:`, error);
            return { chartId: chart.id, rows: [] as Result[] };
          }
        }),
      );

      const nextMap: Record<string, Result[]> = {};
      for (const item of chartRows) {
        nextMap[item.chartId] = item.rows;
      }
      setChartData(nextMap);
    } catch (error) {
      console.error("Failed to refresh dashboard data:", error);
    }
  }, [dashboardId]);

  useEffect(() => {
    void refreshDashboardData();
  }, [refreshDashboardData]);

  const handleTitleUpdate = useCallback(
    async (newTitle: string) => {
      const result = await updateDashboardTitle(dashboardId, newTitle);
      if (!result.updated) {
        throw new Error("Failed to update dashboard title");
      }
      setDashboard((prev) =>
        prev ? { ...prev, title: newTitle, updatedAt: Date.now() } : prev,
      );
    },
    [dashboardId],
  );

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

  const handleAddTextCard = useCallback(
    async (textConfig: TextConfig) => {
      setIsAddingTextCard(true);
      try {
        await addChartToDashboard({
          dashboardId,
          title: textConfig.title ?? "Text Card",
          description: textConfig.title ?? null,
          sql: "SELECT 1",
          dbIdentifier: DEFAULT_WASM_DB_IDENTIFIER,
          chartConfigJson: JSON.stringify(textConfig),
        });
        await refreshDashboardData();
      } catch (error) {
        console.error("Failed to add text card:", error);
      } finally {
        setIsAddingTextCard(false);
      }
    },
    [dashboardId, refreshDashboardData],
  );

  const handleChartDelete = useCallback(async (chartId: string) => {
    try {
      await removeChartFromDashboard(chartId);
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
  }, []);

  const handleColumnsChange = useCallback(
    (value: string) => {
      const newColumns = parseInt(value, 10);
      setColumns(newColumns);
      void setPreference(`${PREF_COLUMNS_PREFIX}${dashboardId}`, newColumns);
      setIsSettingsOpen(false);
    },
    [dashboardId],
  );

  const handleAutoFitChange = useCallback(
    (checked: boolean) => {
      setAutoFitRows(checked);
      void setPreference(`${PREF_AUTOFIT_PREFIX}${dashboardId}`, checked);
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
        const result = await updateChartSql(chartId, newSql);
        if (!result.updated) throw new Error("Failed to update SQL");

        setCharts((prev) =>
          prev.map((chart) =>
            chart.id === chartId ? { ...chart, sql: newSql } : chart,
          ),
        );

        const updatedChart = charts.find((item) => item.id === chartId);
        if (!updatedChart) return;

        const queryResult = await runQuery({
          sql: newSql,
          dbIdentifier: updatedChart.dbIdentifier ?? undefined,
        });

        setChartData((prev) => ({
          ...prev,
          [chartId]: queryResult.rows as Result[],
        }));
      } catch (error) {
        console.error("Failed to update SQL:", error);
        throw error;
      }
    },
    [charts],
  );

  useEffect(() => {
    if (!selectedChartId) return;
    if (!charts.some((chart) => chart.id === selectedChartId)) {
      setSelectedChartId(null);
    }
  }, [charts, selectedChartId]);

  useEffect(() => {
    if (!previewChartId) return;
    if (!charts.some((chart) => chart.id === previewChartId)) {
      setPreviewChartId(null);
    }
  }, [charts, previewChartId]);

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

  const previewChart = useMemo(
    () => charts.find((chart) => chart.id === previewChartId) ?? null,
    [charts, previewChartId],
  );
  const previewRows = useMemo(
    () => (previewChart ? chartData[previewChart.id] || [] : []),
    [previewChart, chartData],
  );
  const previewConfig = useMemo(() => {
    if (!previewChart) return null;
    try {
      return JSON.parse(previewChart.chartConfigJson) as
        | Config
        | CardConfig
        | TableConfig
        | TextConfig;
    } catch {
      return null;
    }
  }, [previewChart]);
  const isPreviewTable = isTableConfig(previewConfig);
  const isPreviewChart =
    previewConfig &&
    !isCardConfig(previewConfig) &&
    !isTableConfig(previewConfig) &&
    !isTextConfig(previewConfig);

  if (loading)
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  if (!dashboard)
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Dashboard not found
      </div>
    );

  return (
    <FilterProvider dashboardId={dashboardId}>
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

        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          Dashboard slicers and materialized semantic filters are deferred in browser mode.
        </div>

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
          onPreviewChart={setPreviewChartId}
        />
        <Dialog
          open={Boolean(previewChartId)}
          onOpenChange={(open) => {
            if (!open) setPreviewChartId(null);
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-6xl overflow-hidden">
            <DialogHeader>
              <DialogTitle>{previewChart?.title || "Chart preview"}</DialogTitle>
              <DialogDescription>
                Preview for this dashboard visual.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-auto">
              {previewChart && previewConfig && previewRows.length > 0 ? (
                isPreviewTable ? (
                  <SqlResultsTable
                    dataOverride={{
                      stage: "complete",
                      columns: Object.keys(previewRows[0] || {}).map((name) => ({
                        name,
                      })),
                      rows: previewRows as Record<string, unknown>[],
                    }}
                  />
                ) : isPreviewChart ? (
                  <DynamicChart
                    chartData={previewRows}
                    chartConfig={previewConfig as Config}
                    className="w-full"
                  />
                ) : (
                  <div className="p-3 text-sm text-muted-foreground">
                    This visual type does not support preview.
                  </div>
                )
              ) : (
                <div className="p-3 text-sm text-muted-foreground">
                  Preview unavailable. The chart config or data could not be loaded.
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </FilterProvider>
  );
}
