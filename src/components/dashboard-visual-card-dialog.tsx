import { useEffect, useMemo, useState } from "react";
import { DynamicChart } from "@/components/dynamic-chart";
import { InlineChartConfig } from "@/components/inline-chart-config";
import {
  SqlPreviewPanel,
  type SqlPreviewRunResult,
} from "@/components/sql-preview-panel";
import { SqlResultsTable } from "@/components/sql-results-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DEFAULT_WASM_DB_IDENTIFIER,
  isWasmLocalIdentifier,
  resolveSqlBackend,
  type SqlBackend,
} from "@/lib/sql/sql-runtime";
import { useSqlBackendPreference } from "@/lib/sql/use-sql-backend";
import type { Config, Result, TableConfig } from "@/lib/types";
import { addChartToDashboard } from "@/lib/workspace/dashboard-repo";

type DashboardVisualCardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardId: string;
  onSaved?: () => Promise<void> | void;
};

type VisualMeta = {
  title: string;
  description: string;
};

function resolveStoredDbIdentifier(
  sqlBackend: SqlBackend | null,
): string | null {
  if (sqlBackend === "duckdb-wasm") {
    return DEFAULT_WASM_DB_IDENTIFIER;
  }

  if (sqlBackend === "bridge" || sqlBackend === "duckdb-http") {
    return null;
  }

  return DEFAULT_WASM_DB_IDENTIFIER;
}

function buildDefaultChartConfig(
  columns: { name: string; type?: string }[],
): Config {
  const xKey = columns[0]?.name ?? "";
  const fallbackYKey = columns[1]?.name;

  return {
    visualType: "chart",
    description: "",
    title: "",
    type: "line",
    xKey,
    yKeys: fallbackYKey ? [fallbackYKey] : [],
    legend: false,
    multipleLines: false,
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

function buildDefaultVisualMeta(
  sql: string,
  type: "chart" | "table",
): VisualMeta {
  const trimmed = sql.trim();
  const snippet = trimmed.length > 40 ? `${trimmed.slice(0, 40)}...` : trimmed;

  if (type === "chart") {
    return {
      title: snippet ? `Chart: ${snippet}` : "Chart",
      description: "",
    };
  }

  return {
    title: snippet ? `Table: ${snippet}` : "Table",
    description: "",
  };
}

export function DashboardVisualCardDialog({
  open,
  onOpenChange,
  dashboardId,
  onSaved,
}: DashboardVisualCardDialogProps) {
  const sqlBackendPreference = useSqlBackendPreference();
  const [sql, setSql] = useState("");
  const [runResult, setRunResult] = useState<SqlPreviewRunResult | null>(null);
  const [selectedType, setSelectedType] = useState<"chart" | "table">("chart");
  const [chartConfig, setChartConfig] = useState<Config | null>(null);
  const [chartMeta, setChartMeta] = useState<VisualMeta>({
    title: "",
    description: "",
  });
  const [tableMeta, setTableMeta] = useState<VisualMeta>({
    title: "",
    description: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSql("");
    setRunResult(null);
    setSelectedType("chart");
    setChartConfig(null);
    setChartMeta({ title: "", description: "" });
    setTableMeta({ title: "", description: "" });
    setIsSaving(false);
    setError(null);
  }, [open]);

  const columns = runResult?.columns ?? [];
  const rows = (runResult?.rows ?? []) as Result[];
  const chartAllowed = columns.length >= 2;
  const defaultChartConfig = useMemo(
    () => buildDefaultChartConfig(columns),
    [columns],
  );

  useEffect(() => {
    if (!runResult) {
      return;
    }

    setSelectedType(chartAllowed ? "chart" : "table");
    setChartConfig((current) => current ?? defaultChartConfig);
    setChartMeta((current) =>
      current.title || current.description
        ? current
        : buildDefaultVisualMeta(sql, "chart"),
    );
    setTableMeta((current) =>
      current.title || current.description
        ? current
        : buildDefaultVisualMeta(sql, "table"),
    );
  }, [chartAllowed, defaultChartConfig, runResult, sql]);

  const currentMeta = selectedType === "chart" ? chartMeta : tableMeta;
  const canSave =
    !isSaving &&
    runResult !== null &&
    rows.length > 0 &&
    currentMeta.title.trim().length > 0 &&
    currentMeta.description.trim().length >= 0 &&
    (selectedType === "table" || chartAllowed);

  const resolvedSqlBackend = resolveSqlBackend({
    backendPreference: sqlBackendPreference,
    dbIdentifier: undefined,
  });
  const resolvedDbIdentifier = resolveStoredDbIdentifier(resolvedSqlBackend);

  const handleSave = async () => {
    if (!canSave || !runResult) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (selectedType === "chart") {
        const nextConfig: Config = {
          ...(chartConfig ?? defaultChartConfig),
          title: chartMeta.title.trim(),
          description: chartMeta.description.trim(),
        };

        await addChartToDashboard({
          dashboardId,
          title: nextConfig.title,
          description: nextConfig.description,
          sql: sql.trim(),
          dbIdentifier: resolvedDbIdentifier,
          sqlBackend: resolvedSqlBackend,
          chartConfigJson: JSON.stringify(nextConfig),
        });
      } else {
        const tableConfig: TableConfig = {
          configType: "table",
          title: tableMeta.title.trim(),
          description: tableMeta.description.trim(),
        };

        await addChartToDashboard({
          dashboardId,
          title: tableConfig.title,
          description: tableConfig.description,
          sql: sql.trim(),
          dbIdentifier: resolvedDbIdentifier,
          sqlBackend: resolvedSqlBackend,
          chartConfigJson: JSON.stringify(tableConfig),
        });
      }

      await onSaved?.();
      onOpenChange(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to add visual card.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-hidden bg-card">
        <DialogHeader>
          <DialogTitle>Add Visual Card</DialogTitle>
        </DialogHeader>

        <div className="flex max-h-[80vh] flex-col gap-4 overflow-hidden">
          <SqlPreviewPanel
            query={sql}
            dbIdentifier={
              resolvedDbIdentifier &&
              !isWasmLocalIdentifier(resolvedDbIdentifier)
                ? resolvedDbIdentifier
                : undefined
            }
            backendPreference={resolvedSqlBackend}
            onQueryChange={setSql}
            onSave={async (newSql) => {
              setSql(newSql);
            }}
            onRunStart={() => setRunResult(null)}
            onRun={(result) => {
              setRunResult(result);
            }}
            onCancel={() => {
              setRunResult(null);
            }}
          />

          <Tabs
            value={selectedType}
            onValueChange={(nextValue) => {
              if (nextValue === "chart" || nextValue === "table") {
                setSelectedType(nextValue);
              }
            }}
            className="min-h-0 flex-1"
          >
            <TabsList>
              <TabsTrigger value="chart" disabled={!chartAllowed}>
                Chart
              </TabsTrigger>
              <TabsTrigger value="table" disabled={!runResult}>
                Table
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chart" className="min-h-0 flex-1">
              <div className="grid min-h-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                <div className="space-y-4 rounded-xl border border-border bg-muted/15 p-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="visual-chart-title"
                      className="text-sm font-medium"
                    >
                      Title
                    </label>
                    <Input
                      id="visual-chart-title"
                      value={chartMeta.title}
                      onChange={(event) =>
                        setChartMeta((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      placeholder="Chart title"
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="visual-chart-description"
                      className="text-sm font-medium"
                    >
                      Description
                    </label>
                    <Input
                      id="visual-chart-description"
                      value={chartMeta.description}
                      onChange={(event) =>
                        setChartMeta((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      placeholder="What this chart shows"
                    />
                  </div>
                  {runResult && chartAllowed ? (
                    <InlineChartConfig
                      chartConfig={chartConfig}
                      defaultChartConfig={defaultChartConfig}
                      onChartConfigChange={setChartConfig}
                      columns={columns}
                      rows={rows}
                      showAdvancedConfig={true}
                      hideNarrativeFields={true}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Run a query with at least two columns to configure a
                      chart.
                    </p>
                  )}
                </div>

                <div className="min-h-[320px] rounded-xl border border-border bg-background p-4">
                  {runResult && chartAllowed ? (
                    <DynamicChart
                      chartData={rows}
                      chartConfig={{
                        ...(chartConfig ?? defaultChartConfig),
                        title: chartMeta.title,
                        description: chartMeta.description,
                      }}
                      className="w-full"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      Chart preview will appear after a successful query run.
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="table" className="min-h-0 flex-1">
              <div className="grid min-h-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                <div className="space-y-4 rounded-xl border border-border bg-muted/15 p-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="visual-table-title"
                      className="text-sm font-medium"
                    >
                      Title
                    </label>
                    <Input
                      id="visual-table-title"
                      value={tableMeta.title}
                      onChange={(event) =>
                        setTableMeta((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      placeholder="Table title"
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="visual-table-description"
                      className="text-sm font-medium"
                    >
                      Description
                    </label>
                    <Input
                      id="visual-table-description"
                      value={tableMeta.description}
                      onChange={(event) =>
                        setTableMeta((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      placeholder="What this table shows"
                    />
                  </div>
                </div>

                <div className="min-h-[320px] overflow-auto rounded-xl border border-border bg-background p-4">
                  {runResult ? (
                    <SqlResultsTable
                      dataOverride={{
                        stage: "complete",
                        columns,
                        rows: runResult.rows as Record<string, unknown>[],
                      }}
                      dbIdentifier={resolvedDbIdentifier ?? undefined}
                      backendPreference={resolvedSqlBackend}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      Table preview will appear after a successful query run.
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={!canSave}
            >
              {isSaving
                ? "Saving..."
                : `Add ${selectedType === "chart" ? "chart" : "table"} card`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
