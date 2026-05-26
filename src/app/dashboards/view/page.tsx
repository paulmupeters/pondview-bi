import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DashboardDataCardDialog } from "@/components/dashboard-data-card-dialog";
import { DashboardSlicersBar } from "@/components/dashboard-slicers-bar";
import { DynamicChart } from "@/components/dynamic-chart";
import { MetricCard } from "@/components/metric-card";
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
import {
  executeDashboardChartsWithFilters,
  executeDashboardScopedQuery,
} from "@/lib/dashboard/browser-filter-engine";
import {
  buildMeasureOptions,
  buildMeasureRenderContextByName,
  extractFirstRowMeasurePrimitive,
  extractLegacyMeasureOptionsFromMetricCards,
  formatFirstRowMeasureValue,
  type MeasurePrimitive,
} from "@/lib/dashboard/measures";
import { resolveDashboardMode } from "@/lib/dashboard-mode";
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
  updateChartConfig,
  updateChartLayout,
  updateChartSql,
  updateDashboardMeasure,
  updateDashboardTitle,
} from "@/lib/workspace/dashboard-repo";
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
  DashboardChartLayout,
} from "../[dashboardId]/types";
import {
  isCardConfig,
  isTableConfig,
  isTextConfig,
} from "../[dashboardId]/utils";

const DASHBOARD_AUTH_ERROR_MESSAGE =
  "Dashboard queries need Bridge authentication. Re-enter your Bridge session secret in Settings to load data.";
const DEFAULT_DASHBOARD_COLUMNS = 4;

function DashboardLoadingPlaceholder() {
  return <div className="h-full w-full" aria-busy="true" />;
}

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
    <Suspense fallback={<DashboardLoadingPlaceholder />}>
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
  const isDashboardMode = resolveDashboardMode(
    typeof window === "undefined" ? "" : window.location.search,
  );
  const { dashboardFilters, chartFiltersById } = useFilters();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [charts, setCharts] = useState<DashboardChart[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<Record<string, Result[]>>({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [expandedSqlChartId, setExpandedSqlChartId] = useState<string | null>(
    null,
  );
  const [selectedChartId, setSelectedChartId] = useState<string | null>(null);
  const dashboardContentRef = useRef<HTMLDivElement>(null);
  const [previewChartId, setPreviewChartId] = useState<string | null>(null);
  const [previewRunRows, setPreviewRunRows] = useState<Result[] | null>(null);
  const [isAddingTextCard, setIsAddingTextCard] = useState(false);
  const [isTextCardDialogOpen, setIsTextCardDialogOpen] = useState(false);
  const [isDataCardDialogOpen, setIsDataCardDialogOpen] = useState(false);
  const [dashboardMeasures, setDashboardMeasures] = useState<
    WorkspaceDashboardMeasure[]
  >([]);
  const [measureValuesById, setMeasureValuesById] = useState<
    Record<string, string>
  >({});
  const [measureRawValuesById, setMeasureRawValuesById] = useState<
    Record<string, MeasurePrimitive>
  >({});
  const [chartQueryError, setChartQueryError] = useState<string | null>(null);
  const [measureQueryError, setMeasureQueryError] = useState<string | null>(
    null,
  );
  const [isRefreshingDashboard, setIsRefreshingDashboard] = useState(false);
  const [refreshingChartIds, setRefreshingChartIds] = useState<Set<string>>(
    () => new Set(),
  );

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

  const refreshDashboardMeasures = useCallback(
    async (options?: { forceRefresh?: boolean }) => {
      try {
        const measures = await listMeasuresByDashboard(dashboardId);
        setDashboardMeasures(measures);
        let nextMeasureError: string | null = null;

        const valueEntries = await Promise.all(
          measures.map(async (measure) => {
            try {
              const result = await executeDashboardScopedQuery({
                dashboardId,
                sql: measure.sql,
                sourceDescriptor: measure.sourceDescriptor ?? null,
                snapshotId: measure.snapshotId ?? null,
                forceRefresh: options?.forceRefresh,
              });

              return [
                measure.id,
                {
                  formattedValue: formatFirstRowMeasureValue(result.rows),
                  rawValue: extractFirstRowMeasurePrimitive(result.rows),
                },
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
              return [
                measure.id,
                {
                  formattedValue: "",
                  rawValue: undefined,
                },
              ] as const;
            }
          }),
        );

        setMeasureValuesById(
          Object.fromEntries(
            valueEntries.map(([measureId, value]) => [
              measureId,
              value.formattedValue,
            ]),
          ),
        );
        setMeasureRawValuesById(
          Object.fromEntries(
            valueEntries.map(([measureId, value]) => [
              measureId,
              value.rawValue,
            ]),
          ),
        );
        setMeasureQueryError(nextMeasureError);
      } catch (error) {
        console.error("Failed to refresh dashboard measures:", error);
        const message = getErrorMessage(error);
        setMeasureQueryError(
          isUnauthorizedMessage(message)
            ? DASHBOARD_AUTH_ERROR_MESSAGE
            : message,
        );
      }
    },
    [dashboardId],
  );

  const refreshDashboardData = useCallback(
    async (options?: { forceRefresh?: boolean }) => {
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
          forceRefresh: options?.forceRefresh,
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
          isUnauthorizedMessage(message)
            ? DASHBOARD_AUTH_ERROR_MESSAGE
            : message,
        );
      }
    },
    [chartFiltersById, dashboardFilters, dashboardId],
  );

  const handleDashboardRefresh = useCallback(async () => {
    setIsRefreshingDashboard(true);
    try {
      await Promise.all([
        refreshDashboardData({ forceRefresh: true }),
        refreshDashboardMeasures({ forceRefresh: true }),
      ]);
    } finally {
      setIsRefreshingDashboard(false);
    }
  }, [refreshDashboardData, refreshDashboardMeasures]);

  const handleChartRefresh = useCallback(
    async (chartId: string) => {
      const chart = charts.find((item) => item.id === chartId);
      if (!chart) {
        return;
      }

      setRefreshingChartIds((prev) => new Set(prev).add(chartId));
      try {
        const dashboardCharts = await listChartsByDashboard(dashboardId);
        const chartForExecution =
          dashboardCharts.find((item) => item.id === chartId) ?? null;
        if (!chartForExecution) {
          return;
        }
        const execution = await executeDashboardChartsWithFilters({
          dashboardId,
          charts: [chartForExecution],
          dashboardFilters,
          chartFiltersById,
          forceRefresh: true,
        });
        const metadata = execution.metadataByChartId[chartId] ?? {
          filtersApplied: false,
          appliedFiltersCount: 0,
          skippedFilters: [],
        };
        setCharts((prev) =>
          prev.map((item) =>
            item.id === chartId ? { ...item, ...metadata } : item,
          ),
        );
        setChartData((prev) => ({
          ...prev,
          [chartId]: execution.rowsByChartId[chartId] ?? [],
        }));
        setChartQueryError(
          metadata.errorMessage
            ? isUnauthorizedMessage(metadata.errorMessage)
              ? DASHBOARD_AUTH_ERROR_MESSAGE
              : metadata.errorMessage
            : null,
        );

        let measureId: string | null = null;
        try {
          const config = JSON.parse(chart.chartConfigJson) as
            | CardConfig
            | Config
            | TableConfig
            | TextConfig;
          measureId =
            isCardConfig(config) && config.measureId ? config.measureId : null;
        } catch {
          measureId = null;
        }

        if (measureId) {
          const measure = dashboardMeasures.find(
            (item) => item.id === measureId,
          );
          if (measure) {
            const result = await executeDashboardScopedQuery({
              dashboardId,
              sql: measure.sql,
              sourceDescriptor: measure.sourceDescriptor ?? null,
              snapshotId: measure.snapshotId ?? null,
              forceRefresh: true,
            });
            setMeasureValuesById((prev) => ({
              ...prev,
              [measure.id]: formatFirstRowMeasureValue(result.rows),
            }));
            setMeasureRawValuesById((prev) => ({
              ...prev,
              [measure.id]: extractFirstRowMeasurePrimitive(result.rows),
            }));
            setMeasureQueryError(null);
          }
        }
      } catch (error) {
        console.error(`Failed to refresh dashboard chart ${chartId}:`, error);
        const message = getErrorMessage(error);
        setChartQueryError(
          isUnauthorizedMessage(message)
            ? DASHBOARD_AUTH_ERROR_MESSAGE
            : message,
        );
      } finally {
        setRefreshingChartIds((prev) => {
          const next = new Set(prev);
          next.delete(chartId);
          return next;
        });
      }
    },
    [
      chartFiltersById,
      charts,
      dashboardFilters,
      dashboardId,
      dashboardMeasures,
    ],
  );

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

  const handleLayoutCommit = useCallback(
    (
      layoutUpdates: Array<{
        chartId: string;
        layout: DashboardChartLayout;
        position: number;
      }>,
    ) => {
      const updateByChartId = new Map(
        layoutUpdates.map((update) => [update.chartId, update]),
      );

      setCharts((prev) =>
        prev
          .map((chart) => {
            const update = updateByChartId.get(chart.id);
            if (!update) return chart;

            return {
              ...chart,
              position: update.position,
              layoutX: update.layout.x,
              layoutY: update.layout.y,
              layoutW: update.layout.w,
              layoutH: update.layout.h,
            };
          })
          .sort((left, right) => left.position - right.position),
      );

      void Promise.all(
        layoutUpdates.map((update) =>
          updateChartLayout(update.chartId, update.layout, update.position),
        ),
      ).catch((error) => {
        console.error("Failed to persist dashboard layout:", error);
        void refreshDashboardData();
      });
    },
    [refreshDashboardData],
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
          dbIdentifier: null,
          sqlBackend: null,
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

  const legacyMeasureOptions = useMemo(
    () => extractLegacyMeasureOptionsFromMetricCards(charts, chartData),
    [charts, chartData],
  );
  const measureOptions = useMemo(
    () =>
      buildMeasureOptions({
        savedMeasures: dashboardMeasures,
        savedValuesByMeasureId: measureValuesById,
        savedRawValuesByMeasureId: measureRawValuesById,
        legacyMeasureOptions,
      }),
    [
      dashboardMeasures,
      measureRawValuesById,
      measureValuesById,
      legacyMeasureOptions,
    ],
  );
  const allMeasuresByName = useMemo(
    () => buildMeasureRenderContextByName(measureOptions),
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
  const previewMeasure = useMemo(() => {
    if (
      !previewConfig ||
      !isCardConfig(previewConfig) ||
      !previewConfig.measureId
    ) {
      return null;
    }

    return measuresById[previewConfig.measureId] ?? null;
  }, [measuresById, previewConfig]);
  const previewSql = previewMeasure?.sql ?? previewChart?.sql ?? "";
  const previewDbIdentifier =
    previewMeasure?.dbIdentifier ?? previewChart?.dbIdentifier ?? undefined;
  const previewBackendPreference =
    previewMeasure?.sqlBackend ?? previewChart?.sqlBackend ?? undefined;
  const previewDisplayRows = previewRunRows ?? previewRows;
  const previewDialogTitle =
    previewConfig && "title" in previewConfig && previewConfig.title
      ? previewConfig.title
      : previewChart?.title || "Chart preview";
  const isPreviewTable = isTableConfig(previewConfig);
  const previewCardConfig =
    previewConfig && isCardConfig(previewConfig) ? previewConfig : null;
  const isPreviewChart =
    previewConfig &&
    !isCardConfig(previewConfig) &&
    !isTableConfig(previewConfig) &&
    !isTextConfig(previewConfig);
  const previewMetricValue = useMemo(() => {
    if (!previewCardConfig) {
      return "";
    }

    if (previewRunRows !== null) {
      return formatFirstRowMeasureValue(previewRunRows);
    }

    if (previewMeasure && measureValuesById[previewMeasure.id] !== undefined) {
      return measureValuesById[previewMeasure.id];
    }

    return formatFirstRowMeasureValue(previewRows);
  }, [
    measureValuesById,
    previewCardConfig,
    previewMeasure,
    previewRows,
    previewRunRows,
  ]);
  const dashboardWarningMessage = chartQueryError ?? measureQueryError;
  const isReadOnlyDashboard =
    isDashboardMode || dashboard?.sourceKind === "attached";

  if (loading) return <DashboardLoadingPlaceholder />;
  if (!dashboard)
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Dashboard not found
      </div>
    );

  return (
    <div
      ref={dashboardContentRef}
      className={`mx-auto flex h-full w-full flex-col gap-1 overflow-y-auto px-6 md:px-12 lg:px-18 pt-2 pb-6 md:pb-10 ${isDashboardMode ? "md:max-w-[calc(100vw-3.5rem)]" : ""}`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <DashboardHeader
          dashboard={dashboard}
          onTitleUpdate={handleTitleUpdate}
          onRefresh={handleDashboardRefresh}
          isRefreshing={isRefreshingDashboard}
          readOnly={isReadOnlyDashboard}
        />
        {!isReadOnlyDashboard ? (
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="default">
                  Add Card
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  onSelect={() => setIsDataCardDialogOpen(true)}
                >
                  Metric / Visual card
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
            />
          </div>
        ) : null}
      </div>

      <DashboardSlicersBar
        dashboardId={dashboardId}
        selectedChartId={selectedChartId}
        charts={charts}
        onClearChartSelection={() => setSelectedChartId(null)}
        readOnly={isReadOnlyDashboard}
      />
      {dashboardWarningMessage ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div>{dashboardWarningMessage}</div>
          {isUnauthorizedMessage(dashboardWarningMessage) &&
          !isReadOnlyDashboard ? (
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
        dashboardColumns={DEFAULT_DASHBOARD_COLUMNS}
        onLayoutCommit={handleLayoutCommit}
        onConfigChange={handleChartConfigChange}
        onMeasureChange={handleDashboardMeasureUpdate}
        onDelete={handleChartDelete}
        expandedSqlChartId={expandedSqlChartId}
        onToggleSql={handleToggleSql}
        onSqlUpdate={handleSqlUpdate}
        selectedChartId={selectedChartId}
        onChartSelect={setSelectedChartId}
        onPreviewChart={(chartId) => {
          setPreviewRunRows(null);
          setPreviewChartId(chartId);
        }}
        onRefreshChart={handleChartRefresh}
        refreshingChartIds={refreshingChartIds}
        readOnly={isReadOnlyDashboard}
      />
      {!isReadOnlyDashboard ? (
        <>
          <DashboardDataCardDialog
            open={isDataCardDialogOpen}
            onOpenChange={setIsDataCardDialogOpen}
            dashboardId={dashboardId}
            existingMeasures={measureOptions}
            onSaved={async () => {
              await Promise.all([
                refreshDashboardData(),
                refreshDashboardMeasures(),
              ]);
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
        </>
      ) : null}
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
            <DialogTitle>{previewDialogTitle}</DialogTitle>
            <DialogDescription>
              Preview for this dashboard visual.
            </DialogDescription>
          </DialogHeader>
          {previewSql ? (
            <SqlPreviewPanel
              query={previewSql}
              dbIdentifier={previewDbIdentifier}
              backendPreference={previewBackendPreference}
              onSave={async (newSql) => {
                if (!previewChart) {
                  return;
                }

                if (previewMeasure) {
                  await handleDashboardMeasureUpdate(previewMeasure.id, {
                    label: previewMeasure.label,
                    sql: newSql,
                  });
                } else {
                  await handleSqlUpdate(previewChart.id, newSql);
                }
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
          ) : null}
          <div className="max-h-[70vh] overflow-auto">
            {(() => {
              const hasRows = previewDisplayRows.length > 0;

              if (!previewChart || !previewConfig) {
                return (
                  <div className="p-3 text-sm text-muted-foreground">
                    Preview unavailable. The chart config or data could not be
                    loaded.
                  </div>
                );
              }

              if (previewCardConfig) {
                return (
                  <div className="space-y-4 p-1">
                    <div className="rounded-xl border border-border bg-muted/20 p-3">
                      <MetricCard
                        value={previewMetricValue}
                        title={previewCardConfig.title}
                        description={previewCardConfig.description}
                        className="border-0 bg-transparent shadow-none"
                      />
                    </div>
                    {hasRows ? (
                      <SqlResultsTable
                        dataOverride={{
                          stage: "complete",
                          columns: Object.keys(previewDisplayRows[0] || {}).map(
                            (name) => ({ name }),
                          ),
                          rows: previewDisplayRows as Record<string, unknown>[],
                        }}
                      />
                    ) : (
                      <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                        No preview rows yet. Run the query to inspect the metric
                        result set.
                      </div>
                    )}
                  </div>
                );
              }

              if (!hasRows) {
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
                      columns: Object.keys(previewDisplayRows[0] || {}).map(
                        (name) => ({ name }),
                      ),
                      rows: previewDisplayRows as Record<string, unknown>[],
                    }}
                  />
                );
              }

              if (isPreviewChart) {
                return (
                  <DynamicChart
                    chartData={previewDisplayRows}
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
