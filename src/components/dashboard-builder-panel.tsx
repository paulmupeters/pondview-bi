import type { UIMessage } from "@ai-sdk/react";
import { MinusCircleIcon, PlusCircleIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import { SqlChart } from "@/components/sql-chart";
import { SqlResultsTable } from "@/components/sql-results-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ArtifactData } from "@/hooks/types";
import { useArtifacts } from "@/hooks/use-artifacts";
import {
  DEFAULT_WASM_DB_IDENTIFIER,
  isWasmLocalIdentifier,
  type SqlBackend,
} from "@/lib/sql/sql-runtime";
import type { CardConfig, Config, Result, TableConfig } from "@/lib/types";
import {
  addChartToDashboard,
  createDashboard,
} from "@/lib/workspace/dashboard-repo";
import { useRouter } from "@/vite/next-navigation";

type DashboardBuilderPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: UIMessage[];
  selectedDbIdentifier?: string;
  selectedSqlBackend?: SqlBackend;
};

type VisualSnapshot = {
  id: string;
  createdAt: number;
  artifact: ArtifactData<SqlAnalysisData>;
  payload: SqlAnalysisData;
  rows: Result[];
  type: "chart" | "card" | "table";
};

function resolveStoredChartDbIdentifier(options: {
  sqlBackend: SqlBackend | null;
  payloadDbIdentifier?: string;
  selectedDbIdentifier?: string;
}): string | null {
  const candidates = [options.payloadDbIdentifier, options.selectedDbIdentifier]
    .map((value) => value?.trim() ?? "")
    .filter((value): value is string => value.length > 0);

  if (options.sqlBackend === "duckdb-wasm") {
    return candidates[0] ?? DEFAULT_WASM_DB_IDENTIFIER;
  }

  if (options.sqlBackend === "bridge" || options.sqlBackend === "duckdb-http") {
    return candidates.find((value) => !isWasmLocalIdentifier(value)) ?? null;
  }

  return candidates[0] ?? DEFAULT_WASM_DB_IDENTIFIER;
}

function buildFallbackChartConfig(payload: SqlAnalysisData): Config | null {
  const columns = payload.columns ?? [];
  const xKey = columns[0]?.name ?? "";
  const yKey = columns[1]?.name;

  if (!xKey) {
    return null;
  }

  const querySnippet = payload.query ?? "";
  const truncatedQuery =
    querySnippet.length > 50 ? `${querySnippet.slice(0, 50)}...` : querySnippet;

  return {
    visualType: "chart",
    title: truncatedQuery ? `Chart: ${truncatedQuery}` : "Generated chart",
    description: payload.summary?.insights?.[0] ?? "",
    type: "line",
    xKey,
    yKeys: yKey ? [yKey] : [],
    multipleLines: false,
    legend: false,
    countMode: false,
    showGrid: true,
    showXAxis: true,
    showYAxis: true,
    showDots: true,
    showTooltip: true,
    lineSize: 2,
    labelYAngle: -90,
  };
}

function normalizeVisualArtifact(
  artifact: ArtifactData<SqlAnalysisData>,
): VisualSnapshot | null {
  const payload = artifact.payload;

  if (!payload) return null;
  if ((payload.stage ?? "") !== "complete") return null;

  const visualType = payload.visualType;

  // Handle chart artifacts
  if (visualType === "chart") {
    const resolvedChartConfig =
      payload.chartConfig ?? buildFallbackChartConfig(payload);
    if (!resolvedChartConfig) return null;

    const rows = Array.isArray(payload.rows)
      ? (payload.rows as Result[]).map((row) => ({ ...row }))
      : [];

    return {
      id: artifact.id,
      createdAt: artifact.createdAt,
      artifact,
      payload: {
        ...payload,
        chartConfig: resolvedChartConfig,
        columns: (payload.columns ?? []).map(
          (column: { name: string; type?: string }) => ({ ...column }),
        ),
        rows,
      },
      rows,
      type: "chart",
    };
  }

  // Handle card artifacts
  if (visualType === "card") {
    const rows = Array.isArray(payload.rows)
      ? (payload.rows as Result[]).map((row) => ({ ...row }))
      : [];

    const defaultCardConfig = payload.cardConfig ?? {
      title: payload.columns?.[0]?.name ?? "Untitled Card",
      description: "",
      takeaway: "",
    };

    return {
      id: artifact.id,
      createdAt: artifact.createdAt,
      artifact,
      payload: {
        ...payload,
        columns: (payload.columns ?? []).map(
          (column: { name: string; type?: string }) => ({ ...column }),
        ),
        rows,
        cardConfig: { configType: "card", ...defaultCardConfig },
      },
      rows,
      type: "card",
    };
  }

  // Handle table artifacts - generate default tableConfig if missing
  if (visualType === "table") {
    const rows = Array.isArray(payload.rows)
      ? (payload.rows as Result[]).map((row) => ({ ...row }))
      : [];

    // Generate a minimal default tableConfig for tables
    const defaultTableConfig = payload.tableConfig ?? {
      configType: "table" as const,
      title: payload.query
        ? `Table: ${payload.query.substring(0, 50)}${payload.query.length > 50 ? "..." : ""}`
        : "Data Table",
      description: payload.summary?.insights?.[0] ?? "",
    };

    return {
      id: artifact.id,
      createdAt: artifact.createdAt,
      artifact,
      payload: {
        ...payload,
        columns: (payload.columns ?? []).map(
          (column: { name: string; type?: string }) => ({ ...column }),
        ),
        rows,
        tableConfig: defaultTableConfig,
      },
      rows,
      type: "table",
    };
  }

  return null;
}

export function DashboardBuilderPanel({
  open,
  onOpenChange,
  messages,
  selectedDbIdentifier,
  selectedSqlBackend,
}: DashboardBuilderPanelProps) {
  const router = useRouter();
  const [dashboardTitle, setDashboardTitle] = useState("New dashboard");
  const [selectedChartIds, setSelectedChartIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasInitializedSelectionRef = useRef(false);

  const includeExecuteSql = useMemo(() => ["execute-sql"], []);

  const { artifacts } = useArtifacts(messages, {
    include: includeExecuteSql,
  });

  const visualSnapshots = useMemo<VisualSnapshot[]>(() => {
    return artifacts
      .map((artifact) => {
        const typedArtifact = artifact as ArtifactData<SqlAnalysisData>;
        return normalizeVisualArtifact(typedArtifact);
      })
      .filter((snapshot): snapshot is VisualSnapshot => snapshot !== null)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [artifacts]);

  useEffect(() => {
    if (!open) return;

    const availableIds = visualSnapshots.map((snapshot) => snapshot.id);

    setSelectedChartIds((prev) => {
      if (!hasInitializedSelectionRef.current) {
        hasInitializedSelectionRef.current = true;

        const isAlreadyAligned =
          prev.length === availableIds.length &&
          availableIds.every((id, index) => id === prev[index]);

        if (isAlreadyAligned) {
          return prev;
        }

        return availableIds;
      }

      const filtered = prev.filter((id) => availableIds.includes(id));

      if (filtered.length !== prev.length) {
        return filtered;
      }

      return prev;
    });
  }, [visualSnapshots, open]);

  useEffect(() => {
    if (!open) {
      setDashboardTitle("New dashboard");
      setIsSaving(false);
      setError(null);
      setSelectedChartIds([]);
      hasInitializedSelectionRef.current = false;
    }
  }, [open]);

  const selectedCharts = useMemo(
    () =>
      visualSnapshots.filter((snapshot) =>
        selectedChartIds.includes(snapshot.id),
      ),
    [visualSnapshots, selectedChartIds],
  );

  const removedCharts = useMemo(
    () =>
      visualSnapshots.filter(
        (snapshot) => !selectedChartIds.includes(snapshot.id),
      ),
    [visualSnapshots, selectedChartIds],
  );

  const handleRemoveChart = (id: string) => {
    setSelectedChartIds((prev) => prev.filter((chartId) => chartId !== id));
  };

  const handleRestoreChart = (id: string) => {
    setSelectedChartIds((prev) => {
      if (prev.includes(id)) return prev;
      return [...prev, id];
    });
  };

  const handleCreateDashboard = async () => {
    if (!selectedCharts.length || isSaving) return;

    const trimmedTitle = dashboardTitle.trim() || "New dashboard";
    setIsSaving(true);
    setError(null);

    try {
      const { id: dashboardId } = await createDashboard(trimmedTitle);

      for (const snapshot of selectedCharts) {
        const { payload, type } = snapshot;

        // Determine the config based on visual type
        let config: CardConfig | TableConfig | Config | undefined;
        let title: string | undefined;

        if (type === "card") {
          config = payload.cardConfig;
          title = config?.title ?? "Untitled card";
        } else if (type === "table") {
          config = payload.tableConfig;
          title = config?.title ?? "Untitled table";
        } else {
          config = payload.chartConfig;
          title = config?.title ?? "Untitled chart";
        }

        const description = config?.description ?? null;
        const sqlBackend = payload.sqlBackend ?? selectedSqlBackend ?? null;

        await addChartToDashboard({
          dashboardId,
          title,
          description,
          sql: payload.query ?? "",
          dbIdentifier: resolveStoredChartDbIdentifier({
            sqlBackend,
            payloadDbIdentifier: payload.dbIdentifier,
            selectedDbIdentifier,
          }),
          sqlBackend,
          chartConfigJson: JSON.stringify(config ?? {}),
        });
      }

      onOpenChange(false);
      router.push(`/dashboards/view?id=${encodeURIComponent(dashboardId)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Generate dashboard</h2>
        <p className="text-sm text-muted-foreground">
          Select the visuals you'd like to include and give the dashboard a
          title.
        </p>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium" htmlFor="dashboard-title">
          Dashboard title
        </label>
        <Input
          id="dashboard-title"
          value={dashboardTitle}
          onChange={(event) => setDashboardTitle(event.target.value)}
          placeholder="e.g. Weekly revenue overview"
        />
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium">Selected visuals</p>
          <p className="text-xs text-muted-foreground">
            {selectedCharts.length} of {visualSnapshots.length} available
            visuals
          </p>
        </div>

        <ScrollArea className="max-h-[50vh] rounded-md border">
          <div className="p-3 space-y-4">
            {selectedCharts.length === 0 ? (
              <div className="text-sm text-muted-foreground py-12 text-center">
                {visualSnapshots.length === 0
                  ? "No visuals available yet. Generate a chart or card in the conversation to get started."
                  : "No visuals selected. Restore a visual below to add it."}
              </div>
            ) : (
              selectedCharts.map((snapshot) => (
                <div
                  key={snapshot.id}
                  className="rounded-md bg-card shadow-sm overflow-hidden"
                >
                  <div className="flex items-center justify-between px-3 py-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {snapshot.type === "card"
                          ? snapshot.payload.cardConfig?.title ||
                            "Untitled card"
                          : snapshot.type === "table"
                            ? snapshot.payload.tableConfig?.title ||
                              "Untitled table"
                            : snapshot.payload.chartConfig?.title ||
                              "Untitled visual"}
                      </span>
                      {snapshot.payload.query && (
                        <span className="text-xs text-muted-foreground truncate max-w-[280px]">
                          {snapshot.payload.query}
                        </span>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleRemoveChart(snapshot.id)}
                    >
                      <MinusCircleIcon className="h-4 w-4" />
                      <span className="sr-only">Remove {snapshot.type}</span>
                    </Button>
                  </div>
                  {snapshot.type === "card" ? (
                    <div className="p-4 flex justify-center">
                      <Card className="w-fit border-0 shadow-none">
                        <CardHeader>
                          <CardTitle className="text-base font-medium text-muted-foreground">
                            {snapshot.payload.cardConfig?.title ||
                              (snapshot.payload.columns?.[0]?.name ?? "Value")}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-4xl font-bold text-foreground">
                            {(() => {
                              const value =
                                snapshot.rows[0]?.[
                                  snapshot.payload.columns?.[0]?.name ?? ""
                                ];
                              if (typeof value === "number") {
                                return value.toLocaleString();
                              }
                              if (typeof value === "boolean") {
                                return value.toString();
                              }
                              if (value instanceof Date) {
                                return value.toLocaleString();
                              }
                              return String(value);
                            })()}
                          </div>
                          {snapshot.payload.cardConfig?.description && (
                            <div className="text-sm text-muted-foreground mt-2">
                              {snapshot.payload.cardConfig.description}
                            </div>
                          )}
                          {snapshot.payload.cardConfig?.takeaway && (
                            <div className="text-xs text-muted-foreground mt-2 italic">
                              {snapshot.payload.cardConfig.takeaway}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  ) : snapshot.type === "table" ? (
                    <div className="p-4 max-h-[400px] overflow-auto">
                      <SqlResultsTable
                        dataOverride={{
                          stage: "complete",
                          columns: snapshot.payload.columns || [],
                          rows: snapshot.rows,
                          summary: snapshot.payload.summary,
                        }}
                      />
                    </div>
                  ) : (
                    <SqlChart
                      customChartConfig={snapshot.payload.chartConfig}
                      dataOverride={{
                        ...snapshot.payload,
                        rows: snapshot.rows,
                        stage: "complete",
                      }}
                    />
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {removedCharts.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Removed visuals</p>
            <div className="flex flex-wrap gap-2">
              {removedCharts.map((snapshot) => (
                <Button
                  key={snapshot.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1"
                  onClick={() => handleRestoreChart(snapshot.id)}
                >
                  <PlusCircleIcon className="h-4 w-4" />
                  {snapshot.type === "card"
                    ? snapshot.payload.cardConfig?.title || "Untitled card"
                    : snapshot.type === "table"
                      ? snapshot.payload.tableConfig?.title || "Untitled table"
                      : snapshot.payload.chartConfig?.title ||
                        "Untitled visual"}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleCreateDashboard}
          disabled={isSaving || selectedCharts.length === 0}
        >
          {isSaving ? "Creating…" : "Create dashboard"}
        </Button>
      </div>
    </div>
  );
}
