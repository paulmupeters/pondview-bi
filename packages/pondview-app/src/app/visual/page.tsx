import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { DashboardChartCard } from "@/app/dashboards/[dashboardId]/components/SortableChartCard";
import type { DashboardChart } from "@/app/dashboards/[dashboardId]/types";
import {
  isCardConfig,
  isTableConfig,
  isTextConfig,
} from "@/app/dashboards/[dashboardId]/utils";
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
import type {
  CardConfig,
  Config,
  Result,
  TableConfig,
  TextConfig,
} from "@/lib/types";
import {
  getChartById,
  listMeasuresByDashboard,
} from "@/lib/workspace/dashboard-repo";
import type { WorkspaceDashboardMeasure } from "@/lib/workspace/workspace-db";

const VISUAL_AUTH_ERROR_MESSAGE =
  "This visual needs Bridge authentication. Re-enter your Bridge session secret in Settings to load data.";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Failed to load visual.";
}

function isUnauthorizedMessage(message: string | null | undefined): boolean {
  return Boolean(message && /unauthorized/i.test(message));
}

function parseChartConfig(
  chartConfigJson: string,
): Config | CardConfig | TableConfig | TextConfig | null {
  try {
    const config = JSON.parse(chartConfigJson) as
      | Config
      | CardConfig
      | TableConfig
      | TextConfig;
    if (
      isCardConfig(config) ||
      isTableConfig(config) ||
      isTextConfig(config) ||
      ("visualType" in config && config.visualType === "chart")
    ) {
      return config;
    }
    return config;
  } catch {
    return null;
  }
}

export default function VisualViewPage() {
  const params = useParams<{ visualId: string }>();
  const visualId = params.visualId;

  if (!visualId) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-sm text-muted-foreground">
        Missing visual id
      </div>
    );
  }

  return <VisualViewPageContent visualId={visualId} />;
}

function VisualViewPageContent({ visualId }: { visualId: string }) {
  const [chart, setChart] = useState<DashboardChart | null>(null);
  const [rows, setRows] = useState<Result[]>([]);
  const [measures, setMeasures] = useState<WorkspaceDashboardMeasure[]>([]);
  const [measureValuesById, setMeasureValuesById] = useState<
    Record<string, string>
  >({});
  const [measureRawValuesById, setMeasureRawValuesById] = useState<
    Record<string, MeasurePrimitive>
  >({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadVisual = useCallback(
    async (options?: { forceRefresh?: boolean }) => {
      setErrorMessage(null);
      const loadedChart = await getChartById(visualId);
      if (!loadedChart) {
        setChart(null);
        setRows([]);
        setMeasures([]);
        return;
      }

      const dashboardChart = loadedChart as DashboardChart;
      setChart(dashboardChart);

      const execution = await executeDashboardChartsWithFilters({
        dashboardId: loadedChart.dashboardId,
        charts: [loadedChart],
        dashboardFilters: [],
        chartFiltersById: {},
        forceRefresh: options?.forceRefresh,
      });
      const metadata = execution.metadataByChartId[loadedChart.id];
      setChart({
        ...dashboardChart,
        ...(metadata ?? {
          filtersApplied: false,
          appliedFiltersCount: 0,
          skippedFilters: [],
        }),
      });
      setRows(execution.rowsByChartId[loadedChart.id] ?? []);

      const dashboardMeasures = await listMeasuresByDashboard(
        loadedChart.dashboardId,
      );
      setMeasures(dashboardMeasures);

      let nextMeasureError: string | null = null;
      const valueEntries = await Promise.all(
        dashboardMeasures.map(async (measure) => {
          try {
            const result = await executeDashboardScopedQuery({
              dashboardId: loadedChart.dashboardId,
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
            nextMeasureError ??= isUnauthorizedMessage(message)
              ? VISUAL_AUTH_ERROR_MESSAGE
              : message;
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
          valueEntries.map(([measureId, value]) => [measureId, value.rawValue]),
        ),
      );

      const chartError = metadata?.errorMessage
        ? isUnauthorizedMessage(metadata.errorMessage)
          ? VISUAL_AUTH_ERROR_MESSAGE
          : metadata.errorMessage
        : null;
      setErrorMessage(chartError ?? nextMeasureError);
    },
    [visualId],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await loadVisual();
      } catch (error) {
        if (!cancelled) {
          const message = getErrorMessage(error);
          setErrorMessage(
            isUnauthorizedMessage(message)
              ? VISUAL_AUTH_ERROR_MESSAGE
              : message,
          );
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
  }, [loadVisual]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadVisual({ forceRefresh: true });
    } catch (error) {
      const message = getErrorMessage(error);
      setErrorMessage(
        isUnauthorizedMessage(message) ? VISUAL_AUTH_ERROR_MESSAGE : message,
      );
    } finally {
      setRefreshing(false);
    }
  }, [loadVisual]);

  const config = useMemo(
    () => (chart ? parseChartConfig(chart.chartConfigJson) : null),
    [chart],
  );
  const legacyMeasureOptions = useMemo(
    () =>
      chart
        ? extractLegacyMeasureOptionsFromMetricCards([chart], {
            [chart.id]: rows,
          })
        : [],
    [chart, rows],
  );
  const measureOptions = useMemo(
    () =>
      buildMeasureOptions({
        savedMeasures: measures,
        savedValuesByMeasureId: measureValuesById,
        savedRawValuesByMeasureId: measureRawValuesById,
        legacyMeasureOptions,
      }),
    [legacyMeasureOptions, measureRawValuesById, measureValuesById, measures],
  );
  const measuresByName = useMemo(
    () => buildMeasureRenderContextByName(measureOptions),
    [measureOptions],
  );

  if (loading) {
    return <div className="h-full w-full" aria-busy="true" />;
  }

  if (!chart) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-sm text-muted-foreground">
        Visual not found
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {errorMessage ? (
        <div className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {errorMessage}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 p-4 md:p-6">
        <DashboardChartCard
          chart={chart}
          config={config}
          rows={rows}
          measures={measuresByName}
          measureOptions={measureOptions}
          onConfigChange={async () => undefined}
          onDelete={async () => undefined}
          expandedSqlChartId={null}
          onToggleSql={() => undefined}
          onSqlUpdate={async () => undefined}
          onRefresh={async () => {
            await handleRefresh();
          }}
          isRefreshing={refreshing}
          readOnly
        />
      </div>
      {refreshing ? (
        <div className="pointer-events-none absolute right-6 top-6 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
        </div>
      ) : null}
    </div>
  );
}
