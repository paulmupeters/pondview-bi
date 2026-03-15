import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DashboardMeasureCardDialog } from "@/components/dashboard-measure-card-dialog";
import { DashboardSlicersBar } from "@/components/dashboard-slicers-bar";
import { DashboardVisualCardDialog } from "@/components/dashboard-visual-card-dialog";
import { DynamicChart } from "@/components/dynamic-chart";
import {
  SqlPreviewPanel,
  type SqlPreviewRunResult,
} from "@/components/sql-preview-panel";
import { SqlResultsTable } from "@/components/sql-results-table";
import { TextConfigDialog } from "@/components/text-config-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { executeDashboardChartsWithFilters } from "@/lib/dashboard/browser-filter-engine";
import {
  buildMeasureOptions,
  buildMeasuresByName,
  extractLegacyMeasureOptionsFromMetricCards,
  formatFirstRowMeasureValue,
} from "@/lib/dashboard/measures";
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
  listMeasuresByDashboard,
  removeChartFromDashboard,
  reorderDashboardCharts,
  updateChartConfig,
  updateChartSql,
  updateDashboardMeasure,
  updateDashboardTitle,
} from "@/lib/workspace/dashboard-repo";
import { getPreference, setPreference } from "@/lib/workspace/preferences-repo";
import type { WorkspaceDashboardMeasure } from "@/lib/workspace/workspace-db";
import Link from "@/vite/next-link";
import { useSearchParams } from "@/vite/next-navigation";
import {
  DashboardGrid,
  DashboardHeader,
  DashboardSettingsDialog,
} from "../[dashboardId]/components";
import { FilterProvider, useFilters } from "../[dashboardId]/filter-context";
import type {
  Dashboard,
  DashboardChart,
  ResizeState,
} from "../[dashboardId]/types";
import {
  buildResizePreview,
  buildRows,
  canEqualizeRow,
  canFitRow,
  findLayoutRowForChart,
  getChartColSpan,
  groupConsecutiveMetricCards,
  isCardConfig,
  isResizableConfig,
  isTableConfig,
  isTextConfig,
  parseChartConfig,
} from "../[dashboardId]/utils";

const PREF_COLUMNS_PREFIX = "dashboard:columns:";
const PREF_AUTOFIT_PREFIX = "dashboard:auto-fit:";
const DASHBOARD_AUTH_ERROR_MESSAGE =
  "Dashboard queries need DuckDB HTTP authentication. Re-enter your DuckDB HTTP auth in Settings to load data.";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Failed to load dashboard data.";
}

function isUnauthorizedMessage(message: string | null | undefined): boolean {
  return Boolean(message && /unauthorized/i.test(message));
}

export default function DashboardViewPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-muted-foreground">Loading...</div>
      }
    >
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
  return (
    <FilterProvider dashboardId={dashboardId}>
      <DashboardDetailPageInner dashboardId={dashboardId} />
    </FilterProvider>
  );
}

function DashboardDetailPageInner({ dashboardId }: { dashboardId: string }) {
  const { dashboardFilters, chartFiltersById } = useFilters();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [charts, setCharts] = useState<DashboardChart[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<Record<string, Result[]>>({});
  const [columns, setColumns] = useState<number>(3);
  const [autoFitRows, setAutoFitRows] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [expandedSqlChartId, setExpandedSqlChartId] = useState<string | null>(
    null,
  );
  const [resizingChart, setResizingChart] = useState<ResizeState>(null);
  const [selectedChartId, setSelectedChartId] = useState<string | null>(null);
  const dashboardContentRef = useRef<HTMLDivElement>(null);
  const [previewChartId, setPreviewChartId] = useState<string | null>(null);
  const [previewRunRows, setPreviewRunRows] = useState<Result[] | null>(null);
  const [isAddingTextCard, setIsAddingTextCard] = useState(false);
  const [isTextCardDialogOpen, setIsTextCardDialogOpen] = useState(false);
  const [isMeasureCardDialogOpen, setIsMeasureCardDialogOpen] = useState(false);
  const [isVisualCardDialogOpen, setIsVisualCardDialogOpen] = useState(false);
  const [dashboardMeasures, setDashboardMeasures] = useState<
    WorkspaceDashboardMeasure[]
  >([]);
  const [measureValuesById, setMeasureValuesById] = useState<
    Record<string, string>
  >({});
  const [chartQueryError, setChartQueryError] = useState<string | null>(null);
  const [measureQueryError, setMeasureQueryError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const savedColumns = await getPreference<number>(
        `${PREF_COLUMNS_PREFIX}${dashboardId}`,
      );
      const savedAutoFit = await getPreference<boolean>(
        `${PREF_AUTOFIT_PREFIX}${dashboardId}`,
      );
      if (cancelled) return;
      if (
        typeof savedColumns === "number" &&
        savedColumns >= 1 &&
        savedColumns <= 6
      ) {
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
        const selected =
          dashboards.find((item) => item.id === dashboardId) ?? null;
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

  const refreshDashboardMeasures = useCallback(async () => {
    try {
      const measures = await listMeasuresByDashboard(dashboardId);
      setDashboardMeasures(measures);
      let nextMeasureError: string | null = null;

      const valueEntries = await Promise.all(
        measures.map(async (measure) => {
          try {
            const result = await runQuery({
              sql: measure.sql,
              dbIdentifier: measure.dbIdentifier ?? undefined,
              backendPreference: measure.sqlBackend ?? undefined,
            });

            return [
              measure.id,
              formatFirstRowMeasureValue(result.rows as Result[]),
            ] as const;
          } catch (error) {
            const message = getErrorMessage(error);
            if (!nextMeasureError) {
              nextMeasureError = isUnauthorizedMessage(message)
                ? DASHBOARD_AUTH_ERROR_MESSAGE
                : message;
            }
            console.error(
              `Failed to resolve value for dashboard measure ${measure.id}:`,
              error,
            );
            return [measure.id, ""] as const;
          }
        }),
      );

      setMeasureValuesById(Object.fromEntries(valueEntries));
      setMeasureQueryError(nextMeasureError);
    } catch (error) {
      console.error("Failed to refresh dashboard measures:", error);
      const message = getErrorMessage(error);
      setMeasureQueryError(
        isUnauthorizedMessage(message) ? DASHBOARD_AUTH_ERROR_MESSAGE : message,
      );
    }
  }, [dashboardId]);

  const refreshDashboardData = useCallback(async () => {
    try {
      const dashboardCharts = await listChartsByDashboard(dashboardId);
      const sortedCharts = [...dashboardCharts].sort(
        (a, b) => a.position - b.position,
      );
      const execution = await executeDashboardChartsWithFilters({
        dashboardId,
        charts: sortedCharts,
        dashboardFilters,
        chartFiltersById,
      });
      const metadataEntries = Object.values(execution.metadataByChartId);
      const firstError = metadataEntries.find((entry) => entry.errorMessage);

      setCharts(
        sortedCharts.map((chart) => ({
          ...chart,
          ...(execution.metadataByChartId[chart.id] ?? {
            filtersApplied: false,
            appliedFiltersCount: 0,
            skippedFilters: [],
          }),
        })),
      );
      setChartData(execution.rowsByChartId);
      setChartQueryError(
        firstError
          ? isUnauthorizedMessage(firstError.errorMessage)
            ? DASHBOARD_AUTH_ERROR_MESSAGE
            : (firstError.errorMessage ?? null)
          : null,
      );
    } catch (error) {
      console.error("Failed to refresh dashboard data:", error);
      const message = getErrorMessage(error);
      setChartQueryError(
        isUnauthorizedMessage(message) ? DASHBOARD_AUTH_ERROR_MESSAGE : message,
      );
    }
  }, [chartFiltersById, dashboardFilters, dashboardId]);

  useEffect(() => {
    void refreshDashboardData();
  }, [refreshDashboardData]);

  useEffect(() => {
    void refreshDashboardMeasures();
  }, [refreshDashboardMeasures]);

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

  const handleDashboardMeasureUpdate = useCallback(
    async (
      measureId: string,
      updates: Pick<WorkspaceDashboardMeasure, "label" | "sql">,
    ) => {
      const result = await updateDashboardMeasure(measureId, updates);
      if (!result.updated) {
        throw new Error("Failed to update measure");
      }

      await Promise.all([refreshDashboardData(), refreshDashboardMeasures()]);
    },
    [refreshDashboardData, refreshDashboardMeasures],
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
        setIsTextCardDialogOpen(false);
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
        await refreshDashboardData();
      } catch (error) {
        console.error("Failed to update SQL:", error);
        throw error;
      }
    },
    [refreshDashboardData],
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

  useEffect(() => {
    if (!selectedChartId) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      const clickedInsideDashboard =
        dashboardContentRef.current?.contains(target) ?? false;
      const clickedSelectedCard = Boolean(
        (target instanceof Element &&
          target.closest(`[data-chart-card-id="${selectedChartId}"]`)) ||
          (target instanceof Element &&
            target.closest(`[data-chart-group-card-id="${selectedChartId}"]`)),
      );
      const clickedInsideDialog = Boolean(
        target instanceof Element &&
          target.closest(
            '[role="dialog"], [data-radix-popper-content-wrapper]',
          ),
      );
      const clickedInsidePopoverTrigger = Boolean(
        target instanceof Element &&
          target.closest(
            '[data-state], [aria-haspopup="dialog"], [aria-expanded]',
          ),
      );
      const clickedInsideSlicerBar = Boolean(
        target instanceof Element && target.closest("[data-slicer-bar]"),
      );

      if (
        clickedInsideDashboard &&
        !clickedSelectedCard &&
        !clickedInsideDialog &&
        !clickedInsidePopoverTrigger &&
        !clickedInsideSlicerBar
      ) {
        setSelectedChartId(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [selectedChartId]);

  const chartGroups = useMemo(
    () => groupConsecutiveMetricCards(charts, chartData),
    [charts, chartData],
  );
  const legacyMeasureOptions = useMemo(
    () => extractLegacyMeasureOptionsFromMetricCards(charts, chartData),
    [charts, chartData],
  );
  const measureOptions = useMemo(
    () =>
      buildMeasureOptions({
        savedMeasures: dashboardMeasures,
        savedValuesByMeasureId: measureValuesById,
        legacyMeasureOptions,
      }),
    [dashboardMeasures, legacyMeasureOptions, measureValuesById],
  );
  const allMeasuresByName = useMemo(
    () => buildMeasuresByName(measureOptions),
    [measureOptions],
  );
  const measuresById = useMemo(
    () =>
      dashboardMeasures.reduce<Record<string, WorkspaceDashboardMeasure>>(
        (accumulator, measure) => {
          accumulator[measure.id] = measure;
          return accumulator;
        },
        {},
      ),
    [dashboardMeasures],
  );

  const layoutRows = useMemo(
    () => buildRows(chartGroups, columns, autoFitRows),
    [chartGroups, columns, autoFitRows],
  );

  const buildResizeState = useCallback(
    (
      chartId: string,
      mode: "single" | "equalize" | "fit" = "single",
      targetColSpan?: number,
    ): ResizeState => {
      const row = findLayoutRowForChart(layoutRows, chartId);
      if (!row) return null;

      return {
        chartId,
        mode,
        previewSpans: buildResizePreview(
          row,
          chartId,
          mode,
          columns,
          targetColSpan,
        ),
        canFit: canFitRow(row),
        canEqualize: canEqualizeRow(row),
      };
    },
    [columns, layoutRows],
  );

  const persistResizeState = useCallback(
    async (resizeState: NonNullable<ResizeState>) => {
      const updates = resizeState.previewSpans
        .filter((item) => item.kind === "single" && item.chartId)
        .map((item) => {
          const targetChart = charts.find((chart) => chart.id === item.chartId);
          if (!targetChart) return null;

          const config = parseChartConfig(targetChart);
          if (!config || !isResizableConfig(config)) return null;

          const currentSpan = getChartColSpan(
            targetChart,
            Number.MAX_SAFE_INTEGER,
          );
          if (currentSpan === item.colSpan) return null;

          return handleChartConfigChange(
            targetChart.id,
            JSON.stringify({
              ...config,
              colSpan: item.colSpan,
            }),
          );
        })
        .filter(
          (update): update is ReturnType<typeof handleChartConfigChange> =>
            Boolean(update),
        );

      await Promise.all(updates);
    },
    [charts, handleChartConfigChange],
  );

  const handleResizeOpen = useCallback(
    (chartId: string) => {
      const nextState = buildResizeState(chartId);
      if (!nextState) return;
      setResizingChart(nextState);
    },
    [buildResizeState],
  );

  const handleResizeSelect = useCallback(
    (
      chartId: string,
      mode: "single" | "equalize" | "fit",
      targetColSpan?: number,
    ) => {
      const nextState = buildResizeState(chartId, mode, targetColSpan);
      if (!nextState) return;
      setResizingChart(nextState);
      void persistResizeState(nextState).finally(() => {
        setResizingChart((current) =>
          current?.chartId === chartId ? null : current,
        );
      });
    },
    [buildResizeState, persistResizeState],
  );

  const handleResizeClose = useCallback(() => {
    setResizingChart(null);
  }, []);

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
  const dashboardWarningMessage = chartQueryError ?? measureQueryError;

  if (loading)
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  if (!dashboard)
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Dashboard not found
      </div>
    );

  return (
    <div
      ref={dashboardContentRef}
      className="mx-auto flex h-full w-full flex-col gap-1 overflow-y-auto px-6 md:px-12 lg:px-18 pt-2 pb-6 md:pb-10"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <DashboardHeader
          dashboard={dashboard}
          onTitleUpdate={handleTitleUpdate}
        />
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="default">
                Add Card
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onSelect={() => setIsMeasureCardDialogOpen(true)}
              >
                Metric / Measure card
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setIsVisualCardDialogOpen(true)}
              >
                Visual card
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isAddingTextCard}
                onSelect={() => setIsTextCardDialogOpen(true)}
              >
                Text card
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
        charts={charts}
        onClearChartSelection={() => setSelectedChartId(null)}
      />
      {dashboardWarningMessage ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div>{dashboardWarningMessage}</div>
          {isUnauthorizedMessage(dashboardWarningMessage) ? (
            <div className="mt-3">
              <Button asChild size="sm" variant="outline">
                <Link href="/settings">Open Settings</Link>
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <DashboardGrid
        charts={charts}
        chartData={chartData}
        measures={allMeasuresByName}
        measureOptions={measureOptions}
        measuresById={measuresById}
        measureValuesById={measureValuesById}
        layoutRows={layoutRows}
        dashboardColumns={columns}
        onDragEnd={handleDragEnd}
        onConfigChange={handleChartConfigChange}
        onMeasureChange={handleDashboardMeasureUpdate}
        onDelete={handleChartDelete}
        expandedSqlChartId={expandedSqlChartId}
        onToggleSql={handleToggleSql}
        onSqlUpdate={handleSqlUpdate}
        resizingChart={resizingChart}
        onResizeOpen={handleResizeOpen}
        onResizeClose={handleResizeClose}
        onResizeSelect={handleResizeSelect}
        selectedChartId={selectedChartId}
        onChartSelect={setSelectedChartId}
        onPreviewChart={setPreviewChartId}
      />
      <DashboardMeasureCardDialog
        open={isMeasureCardDialogOpen}
        onOpenChange={setIsMeasureCardDialogOpen}
        dashboardId={dashboardId}
        existingMeasures={measureOptions}
        onSaved={async () => {
          await Promise.all([
            refreshDashboardData(),
            refreshDashboardMeasures(),
          ]);
        }}
      />
      <DashboardVisualCardDialog
        open={isVisualCardDialogOpen}
        onOpenChange={setIsVisualCardDialogOpen}
        dashboardId={dashboardId}
        onSaved={async () => {
          await refreshDashboardData();
        }}
      />
      <TextConfigDialog
        open={isTextCardDialogOpen}
        onOpenChange={setIsTextCardDialogOpen}
        config={null}
        measures={allMeasuresByName}
        measureOptions={measureOptions}
        onConfigChange={(newConfig) => {
          void handleAddTextCard(newConfig);
        }}
      />
      <Dialog
        open={Boolean(previewChartId)}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewChartId(null);
            setPreviewRunRows(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-6xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>{previewChart?.title || "Chart preview"}</DialogTitle>
            <DialogDescription>
              Preview for this dashboard visual.
            </DialogDescription>
          </DialogHeader>
          {previewChart?.sql && (
            <SqlPreviewPanel
              query={previewChart.sql}
              dbIdentifier={previewChart.dbIdentifier ?? undefined}
              backendPreference={previewChart.sqlBackend ?? undefined}
              onSave={async (newSql) => {
                await handleSqlUpdate(previewChart.id, newSql);
                setPreviewRunRows(null);
              }}
              onRunStart={() => {
                setPreviewRunRows([]);
              }}
              onRun={(result: SqlPreviewRunResult) => {
                setPreviewRunRows(result.rows as Result[]);
              }}
              onCancel={() => {
                setPreviewRunRows(null);
              }}
            />
          )}
          <div className="max-h-[70vh] overflow-auto">
            {(() => {
              const displayRows = previewRunRows ?? previewRows;
              const hasData =
                previewChart && previewConfig && displayRows.length > 0;

              if (!hasData) {
                return (
                  <div className="p-3 text-sm text-muted-foreground">
                    Preview unavailable. The chart config or data could not be
                    loaded.
                  </div>
                );
              }

              if (isPreviewTable) {
                return (
                  <SqlResultsTable
                    dataOverride={{
                      stage: "complete",
                      columns: Object.keys(displayRows[0] || {}).map(
                        (name) => ({ name }),
                      ),
                      rows: displayRows as Record<string, unknown>[],
                    }}
                  />
                );
              }

              if (isPreviewChart) {
                return (
                  <DynamicChart
                    chartData={displayRows}
                    chartConfig={previewConfig as Config}
                    className="w-full"
                  />
                );
              }

              return (
                <div className="p-3 text-sm text-muted-foreground">
                  This visual type does not support preview.
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
