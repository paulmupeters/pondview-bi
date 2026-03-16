import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DynamicChart } from "@/components/dynamic-chart";
import { InlineChartConfig } from "@/components/inline-chart-config";
import { MetricCard } from "@/components/metric-card";
import {
  SqlPreviewPanel,
  type SqlPreviewRunResult,
} from "@/components/sql-preview-panel";
import { SqlResultsTable } from "@/components/sql-results-table";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatFirstRowMeasureValue,
  type MeasureOption,
  normalizeMeasureName,
} from "@/lib/dashboard/measures";
import {
  DEFAULT_WASM_DB_IDENTIFIER,
  isWasmLocalIdentifier,
  resolveSqlBackend,
  type SqlBackend,
} from "@/lib/sql/sql-runtime";
import { useSqlBackendPreference } from "@/lib/sql/use-sql-backend";
import type { CardConfig, Config, Result, TableConfig } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  addChartToDashboard,
  createDashboardMeasure,
} from "@/lib/workspace/dashboard-repo";

type DashboardDataCardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardId: string;
  existingMeasures: MeasureOption[];
  onSaved?: () => Promise<void> | void;
};

type SourceMode = "measure" | "sql";
type MeasureMode = "existing" | "new";
type SqlVisualType = "card" | "chart" | "table";

type VisualMeta = {
  title: string;
  description: string;
  takeaway?: string;
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

function getExistingMeasureId(measure: MeasureOption): string {
  if (measure.measureId) {
    return measure.measureId;
  }

  if (measure.sourceChartId) {
    return `legacy:${measure.sourceChartId}`;
  }

  return `legacy:${measure.key}`;
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

  return {
    title: snippet
      ? `${type === "chart" ? "Chart" : "Table"}: ${snippet}`
      : type === "chart"
        ? "Chart"
        : "Table",
    description: "",
  };
}

function buildDefaultCardMeta(
  columns: { name: string; type?: string }[],
  sql: string,
): VisualMeta {
  const firstColumnName = columns[0]?.name?.trim();
  if (firstColumnName) {
    return {
      title: firstColumnName,
      description: "",
    };
  }

  const trimmed = sql.trim();
  const snippet = trimmed.length > 32 ? `${trimmed.slice(0, 32)}...` : trimmed;
  return {
    title: snippet ? `Metric: ${snippet}` : "Metric",
    description: "",
  };
}

function isSingleValueResult(runResult: SqlPreviewRunResult | null): boolean {
  return Boolean(
    runResult &&
      runResult.rows.length === 1 &&
      runResult.columns.length === 1 &&
      runResult.columns[0],
  );
}

function getDefaultSourceMode(): SourceMode {
  return "sql";
}

function getSqlVisualOptions(
  runResult: SqlPreviewRunResult | null,
): SqlVisualType[] {
  if (!runResult) {
    return [];
  }

  if (isSingleValueResult(runResult)) {
    return ["card", "table"];
  }

  if (runResult.columns.length >= 2) {
    return ["chart", "table"];
  }

  return ["table"];
}

function getDefaultSqlVisualType(
  runResult: SqlPreviewRunResult | null,
): SqlVisualType {
  if (isSingleValueResult(runResult)) {
    return "card";
  }

  if (runResult && runResult.columns.length >= 2) {
    return "chart";
  }

  return "table";
}

function MetaFields({
  titleId,
  descriptionId,
  takeawayId,
  meta,
  onChange,
  showTakeaway = false,
  titlePlaceholder,
  descriptionPlaceholder,
  takeawayPlaceholder = "Optional summary insight",
}: {
  titleId: string;
  descriptionId: string;
  takeawayId?: string;
  meta: VisualMeta;
  onChange: (nextMeta: VisualMeta) => void;
  showTakeaway?: boolean;
  titlePlaceholder: string;
  descriptionPlaceholder: string;
  takeawayPlaceholder?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-3",
        showTakeaway ? "lg:grid-cols-3" : "md:grid-cols-2",
      )}
    >
      <div className="space-y-2">
        <label htmlFor={titleId} className="text-sm font-medium">
          Title
        </label>
        <Input
          id={titleId}
          value={meta.title}
          onChange={(event) =>
            onChange({
              ...meta,
              title: event.target.value,
            })
          }
          placeholder={titlePlaceholder}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor={descriptionId} className="text-sm font-medium">
          Description
        </label>
        <Input
          id={descriptionId}
          value={meta.description}
          onChange={(event) =>
            onChange({
              ...meta,
              description: event.target.value,
            })
          }
          placeholder={descriptionPlaceholder}
        />
      </div>
      {showTakeaway && takeawayId ? (
        <div className="space-y-2">
          <label htmlFor={takeawayId} className="text-sm font-medium">
            Takeaway
          </label>
          <Input
            id={takeawayId}
            value={meta.takeaway ?? ""}
            onChange={(event) =>
              onChange({
                ...meta,
                takeaway: event.target.value,
              })
            }
            placeholder={takeawayPlaceholder}
          />
        </div>
      ) : null}
    </div>
  );
}

export function DashboardDataCardDialog({
  open,
  onOpenChange,
  dashboardId,
  existingMeasures,
  onSaved,
}: DashboardDataCardDialogProps) {
  const sqlBackendPreference = useSqlBackendPreference();
  const [sourceMode, setSourceMode] =
    useState<SourceMode>(getDefaultSourceMode);
  const [measureMode, setMeasureMode] = useState<MeasureMode>("existing");
  const [selectedMeasureId, setSelectedMeasureId] = useState<string | null>(
    null,
  );
  const [measureLabel, setMeasureLabel] = useState("");
  const [measureSql, setMeasureSql] = useState("");
  const [measurePreviewRows, setMeasurePreviewRows] = useState<Result[]>([]);
  const [measureCardMeta, setMeasureCardMeta] = useState<VisualMeta>({
    title: "",
    description: "",
    takeaway: "",
  });
  const [sql, setSql] = useState("");
  const [runResult, setRunResult] = useState<SqlPreviewRunResult | null>(null);
  const [sqlVisualType, setSqlVisualType] = useState<SqlVisualType>("table");
  const [chartConfig, setChartConfig] = useState<Config | null>(null);
  const [chartMeta, setChartMeta] = useState<VisualMeta>({
    title: "",
    description: "",
  });
  const [tableMeta, setTableMeta] = useState<VisualMeta>({
    title: "",
    description: "",
  });
  const [sqlCardMeta, setSqlCardMeta] = useState<VisualMeta>({
    title: "",
    description: "",
    takeaway: "",
  });
  const [showVisualOptions, setShowVisualOptions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const defaultMeasure = existingMeasures[0] ?? null;
    setSourceMode(getDefaultSourceMode());
    setMeasureMode(defaultMeasure ? "existing" : "new");
    setSelectedMeasureId(
      defaultMeasure ? getExistingMeasureId(defaultMeasure) : null,
    );
    setMeasureLabel("");
    setMeasureSql("");
    setMeasurePreviewRows([]);
    setMeasureCardMeta({
      title: defaultMeasure?.label ?? "",
      description: "",
      takeaway: "",
    });
    setSql("");
    setRunResult(null);
    setSqlVisualType("table");
    setChartConfig(null);
    setChartMeta({ title: "", description: "" });
    setTableMeta({ title: "", description: "" });
    setSqlCardMeta({ title: "", description: "", takeaway: "" });
    setShowVisualOptions(false);
    setError(null);
    setIsSaving(false);
  }, [existingMeasures, open]);

  const selectedMeasure = useMemo(
    () =>
      existingMeasures.find(
        (measure) => getExistingMeasureId(measure) === selectedMeasureId,
      ) ?? null,
    [existingMeasures, selectedMeasureId],
  );

  useEffect(() => {
    if (measureMode !== "existing") {
      return;
    }

    setMeasureCardMeta({
      title: selectedMeasure?.label ?? "",
      description: "",
      takeaway: "",
    });
  }, [measureMode, selectedMeasure]);

  const resolvedSqlBackend = resolveSqlBackend({
    backendPreference: sqlBackendPreference,
    dbIdentifier: undefined,
  });
  const resolvedDbIdentifier = resolveStoredDbIdentifier(resolvedSqlBackend);

  const newMeasureKey = useMemo(
    () => normalizeMeasureName(measureLabel),
    [measureLabel],
  );
  const newMeasureValue = useMemo(
    () => formatFirstRowMeasureValue(measurePreviewRows),
    [measurePreviewRows],
  );
  const selectedMeasureValue = selectedMeasure?.value ?? "";
  const measurePreviewValue =
    measureMode === "existing" ? selectedMeasureValue : newMeasureValue;

  const columns = runResult?.columns ?? [];
  const rows = (runResult?.rows ?? []) as Result[];
  const sqlVisualOptions = useMemo(
    () => getSqlVisualOptions(runResult),
    [runResult],
  );
  const chartAllowed = sqlVisualOptions.includes("chart");
  const sqlCardAllowed = sqlVisualOptions.includes("card");
  const defaultChartConfig = useMemo(
    () => buildDefaultChartConfig(columns),
    [columns],
  );
  const sqlPreviewValue = useMemo(
    () => formatFirstRowMeasureValue(rows),
    [rows],
  );

  useEffect(() => {
    if (!runResult) {
      return;
    }

    const nextVisualType = getDefaultSqlVisualType(runResult);
    setSqlVisualType(nextVisualType);
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
    setSqlCardMeta((current) =>
      current.title || current.description || current.takeaway
        ? current
        : buildDefaultCardMeta(columns, sql),
    );
    setShowVisualOptions(nextVisualType === "chart");
  }, [columns, defaultChartConfig, runResult, sql]);

  const canSaveMeasure =
    !isSaving &&
    measureCardMeta.title.trim().length > 0 &&
    (measureMode === "existing"
      ? (selectedMeasure?.sql?.trim().length ?? 0) > 0
      : measureLabel.trim().length > 0 &&
        newMeasureKey.length > 0 &&
        measureSql.trim().length > 0 &&
        measurePreviewRows.length > 0);

  const canSaveSql =
    !isSaving &&
    runResult !== null &&
    rows.length > 0 &&
    (sqlVisualType === "card"
      ? sqlCardAllowed && sqlCardMeta.title.trim().length > 0
      : sqlVisualType === "chart"
        ? chartAllowed && chartMeta.title.trim().length > 0
        : tableMeta.title.trim().length > 0);

  const canSave = sourceMode === "measure" ? canSaveMeasure : canSaveSql;

  const handleSave = async () => {
    if (!canSave) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (sourceMode === "measure") {
        let measure = selectedMeasure;

        if (measureMode === "new") {
          const created = await createDashboardMeasure({
            dashboardId,
            key: newMeasureKey,
            label: measureLabel.trim(),
            sql: measureSql.trim(),
            dbIdentifier: resolvedDbIdentifier,
            sqlBackend: resolvedSqlBackend,
          });

          measure = {
            key: newMeasureKey,
            label: measureLabel.trim(),
            value: newMeasureValue,
            source: "saved",
            measureId: created.id,
            sql: measureSql.trim(),
            dbIdentifier: resolvedDbIdentifier,
            sqlBackend: resolvedSqlBackend,
          };
        }

        if (!measure) {
          throw new Error("Select or create a measure before saving.");
        }

        const cardConfig: CardConfig = {
          configType: "card",
          title: measureCardMeta.title.trim(),
          description: measureCardMeta.description.trim(),
          takeaway: measureCardMeta.takeaway?.trim()
            ? measureCardMeta.takeaway.trim()
            : undefined,
        };
        if (measure.source === "saved" && measure.measureId) {
          cardConfig.measureId = measure.measureId;
        }

        if (!measure.sql?.trim()) {
          throw new Error("The selected measure is missing its SQL query.");
        }

        const measureSqlValue = measure.sql;

        await addChartToDashboard({
          dashboardId,
          title: cardConfig.title,
          description: cardConfig.description,
          sql: measureSqlValue,
          dbIdentifier: measure.dbIdentifier ?? null,
          sqlBackend: measure.sqlBackend ?? null,
          chartConfigJson: JSON.stringify(cardConfig),
        });
      } else {
        if (!runResult) {
          throw new Error("Run a SQL query before saving.");
        }

        if (sqlVisualType === "chart") {
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
        } else if (sqlVisualType === "table") {
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
        } else {
          const cardConfig: CardConfig = {
            configType: "card",
            title: sqlCardMeta.title.trim(),
            description: sqlCardMeta.description.trim(),
            takeaway: sqlCardMeta.takeaway?.trim()
              ? sqlCardMeta.takeaway.trim()
              : undefined,
          };

          await addChartToDashboard({
            dashboardId,
            title: cardConfig.title,
            description: cardConfig.description,
            sql: sql.trim(),
            dbIdentifier: resolvedDbIdentifier,
            sqlBackend: resolvedSqlBackend,
            chartConfigJson: JSON.stringify(cardConfig),
          });
        }
      }

      await onSaved?.();
      onOpenChange(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to add dashboard card.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const saveLabel =
    sourceMode === "measure"
      ? "Add metric card"
      : sqlVisualType === "card"
        ? "Add metric card"
        : `Add ${sqlVisualType} card`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-6xl flex-col gap-0 overflow-hidden bg-card p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle>Add Dashboard Card</DialogTitle>
          <DialogDescription>
            Reuse a saved measure or run SQL and let the dialog pick the best
            card type from the result.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <Tabs
            value={sourceMode}
            onValueChange={(nextValue) => {
              if (nextValue === "measure" || nextValue === "sql") {
                setSourceMode(nextValue);
                setError(null);
              }
            }}
            className="flex min-h-0 flex-col gap-4"
          >
            <TabsList className="w-fit">
              <TabsTrigger value="measure">Measure</TabsTrigger>
              <TabsTrigger value="sql">SQL</TabsTrigger>
            </TabsList>

            <TabsContent value="measure" className="mt-0 min-h-0 flex-1">
              <div className="space-y-4">
                <Tabs
                  value={measureMode}
                  onValueChange={(nextValue) => {
                    if (nextValue === "existing" || nextValue === "new") {
                      setMeasureMode(nextValue);
                      setError(null);
                    }
                  }}
                >
                  <TabsList>
                    <TabsTrigger
                      value="existing"
                      disabled={existingMeasures.length === 0}
                    >
                      Existing measures
                    </TabsTrigger>
                    <TabsTrigger value="new">New measure</TabsTrigger>
                  </TabsList>

                  <TabsContent value="existing" className="mt-4 space-y-4">
                    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                      <div className="max-h-[320px] space-y-2 overflow-y-auto rounded-xl border border-border bg-muted/15 p-3">
                        {existingMeasures.length > 0 ? (
                          existingMeasures.map((measure) => {
                            const measureId = getExistingMeasureId(measure);
                            const isSelected = measureId === selectedMeasureId;
                            return (
                              <button
                                key={measureId}
                                type="button"
                                onClick={() => setSelectedMeasureId(measureId)}
                                className={cn(
                                  "w-full rounded-xl border px-3 py-3 text-left transition-colors",
                                  isSelected
                                    ? "border-primary bg-primary/5"
                                    : "border-border bg-background hover:bg-muted/40",
                                )}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <div className="flex items-center gap-2 font-medium">
                                      <span>{measure.label}</span>
                                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                        {measure.source === "saved"
                                          ? "Reusable"
                                          : "From card"}
                                      </span>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {`{{${measure.key}}}`}
                                    </div>
                                  </div>
                                  <div className="text-right text-sm font-medium">
                                    {measure.value || "(empty)"}
                                  </div>
                                </div>
                                <p className="mt-2 truncate text-xs text-muted-foreground">
                                  {measure.sql || "No SQL available"}
                                </p>
                              </button>
                            );
                          })
                        ) : (
                          <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                            No measures available yet. Create your first one in
                            the New measure tab.
                          </div>
                        )}
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-xl border border-border bg-background p-4">
                          <MetaFields
                            titleId="existing-measure-card-title"
                            descriptionId="existing-measure-card-description"
                            takeawayId="existing-measure-card-takeaway"
                            meta={measureCardMeta}
                            onChange={setMeasureCardMeta}
                            showTakeaway={true}
                            titlePlaceholder="Metric title"
                            descriptionPlaceholder="What this metric represents"
                          />
                        </div>

                        <div className="rounded-2xl border border-border bg-muted/20 p-4">
                          <MetricCard
                            value={measurePreviewValue}
                            title={
                              measureCardMeta.title.trim() ||
                              selectedMeasure?.label ||
                              "Metric"
                            }
                            description={
                              measureCardMeta.description.trim() ||
                              "Measure preview"
                            }
                            takeaway={
                              measureCardMeta.takeaway?.trim()
                                ? measureCardMeta.takeaway.trim()
                                : undefined
                            }
                            className="border-0 bg-transparent shadow-none"
                          />
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="new" className="mt-4 space-y-4">
                    <div className="rounded-xl border border-border bg-background p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label
                            htmlFor="new-measure-label"
                            className="text-sm font-medium"
                          >
                            Shared measure label
                          </label>
                          <Input
                            id="new-measure-label"
                            value={measureLabel}
                            onChange={(event) =>
                              setMeasureLabel(event.target.value)
                            }
                            placeholder="Revenue"
                          />
                        </div>
                        <div className="space-y-2">
                          <label
                            htmlFor="new-measure-key"
                            className="text-sm font-medium"
                          >
                            Measure token
                          </label>
                          <Input
                            id="new-measure-key"
                            value={newMeasureKey}
                            readOnly
                            placeholder="revenue"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-background p-4">
                      <MetaFields
                        titleId="new-measure-card-title"
                        descriptionId="new-measure-card-description"
                        takeawayId="new-measure-card-takeaway"
                        meta={measureCardMeta}
                        onChange={setMeasureCardMeta}
                        showTakeaway={true}
                        titlePlaceholder="Metric title"
                        descriptionPlaceholder="What this metric represents"
                      />
                    </div>

                    <div className="rounded-xl border border-border bg-background p-4">
                      <SqlPreviewPanel
                        query={measureSql}
                        dbIdentifier={resolvedDbIdentifier ?? undefined}
                        backendPreference={resolvedSqlBackend}
                        onQueryChange={setMeasureSql}
                        onSave={async (newSql) => {
                          setMeasureSql(newSql);
                        }}
                        onRunStart={() => setMeasurePreviewRows([])}
                        onRun={(result: SqlPreviewRunResult) => {
                          setMeasurePreviewRows(result.rows as Result[]);
                        }}
                        onCancel={() => {
                          setMeasurePreviewRows([]);
                        }}
                      />
                    </div>

                    <div className="rounded-2xl border border-border bg-muted/20 p-4">
                      <MetricCard
                        value={measurePreviewValue}
                        title={
                          measureCardMeta.title.trim() ||
                          measureLabel.trim() ||
                          "Metric"
                        }
                        description={
                          measureCardMeta.description.trim() ||
                          "Measure preview"
                        }
                        takeaway={
                          measureCardMeta.takeaway?.trim()
                            ? measureCardMeta.takeaway.trim()
                            : undefined
                        }
                        className="border-0 bg-transparent shadow-none"
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </TabsContent>

            <TabsContent value="sql" className="mt-0 min-h-0 flex-1">
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-background p-4">
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
                    onRunStart={() => {
                      setRunResult(null);
                      setError(null);
                    }}
                    onRun={(result) => {
                      setRunResult(result);
                    }}
                    onCancel={() => {
                      setRunResult(null);
                    }}
                  />
                </div>

                {runResult ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <Tabs
                        value={sqlVisualType}
                        onValueChange={(nextValue) => {
                          if (
                            nextValue === "card" ||
                            nextValue === "chart" ||
                            nextValue === "table"
                          ) {
                            setSqlVisualType(nextValue);
                            setShowVisualOptions(nextValue === "chart");
                            setError(null);
                          }
                        }}
                      >
                        <TabsList>
                          {sqlVisualOptions.map((option) => (
                            <TabsTrigger key={option} value={option}>
                              {option === "card"
                                ? "Metric"
                                : option.charAt(0).toUpperCase() +
                                  option.slice(1)}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      </Tabs>
                      <p className="text-sm text-muted-foreground">
                        {sqlCardAllowed
                          ? "Single-value result detected, so metric mode is available automatically."
                          : chartAllowed
                            ? "Chart and table views are available for this result."
                            : "This result is best saved as a table."}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-background p-4">
                      {sqlVisualType === "card" ? (
                        <MetaFields
                          titleId="sql-card-title"
                          descriptionId="sql-card-description"
                          takeawayId="sql-card-takeaway"
                          meta={sqlCardMeta}
                          onChange={setSqlCardMeta}
                          showTakeaway={true}
                          titlePlaceholder="Metric title"
                          descriptionPlaceholder="What this metric represents"
                        />
                      ) : sqlVisualType === "chart" ? (
                        <MetaFields
                          titleId="sql-chart-title"
                          descriptionId="sql-chart-description"
                          meta={chartMeta}
                          onChange={setChartMeta}
                          titlePlaceholder="Chart title"
                          descriptionPlaceholder="What this chart shows"
                        />
                      ) : (
                        <MetaFields
                          titleId="sql-table-title"
                          descriptionId="sql-table-description"
                          meta={tableMeta}
                          onChange={setTableMeta}
                          titlePlaceholder="Table title"
                          descriptionPlaceholder="What this table shows"
                        />
                      )}
                    </div>

                    {sqlVisualType === "chart" && chartAllowed ? (
                      <Collapsible
                        open={showVisualOptions}
                        onOpenChange={setShowVisualOptions}
                      >
                        <div className="rounded-xl border border-border bg-muted/15">
                          <CollapsibleTrigger asChild>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                            >
                              <div>
                                <div className="text-sm font-medium">
                                  Visual options
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Tweak the chart setup without squeezing the
                                  preview.
                                </div>
                              </div>
                              <ChevronDown
                                className={cn(
                                  "h-4 w-4 transition-transform",
                                  showVisualOptions && "rotate-180",
                                )}
                              />
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="border-t border-border px-4 py-4">
                            <InlineChartConfig
                              chartConfig={chartConfig}
                              defaultChartConfig={defaultChartConfig}
                              onChartConfigChange={setChartConfig}
                              columns={columns}
                              rows={rows}
                              showAdvancedConfig={true}
                              hideNarrativeFields={true}
                            />
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    ) : null}

                    <div className="rounded-2xl border border-border bg-muted/20 p-4">
                      {sqlVisualType === "card" ? (
                        <MetricCard
                          value={sqlPreviewValue}
                          title={sqlCardMeta.title.trim() || "Metric"}
                          description={
                            sqlCardMeta.description.trim() || "Metric preview"
                          }
                          takeaway={
                            sqlCardMeta.takeaway?.trim()
                              ? sqlCardMeta.takeaway.trim()
                              : undefined
                          }
                          className="border-0 bg-transparent shadow-none"
                        />
                      ) : sqlVisualType === "chart" ? (
                        chartAllowed ? (
                          <div className="min-h-[360px] overflow-auto rounded-xl bg-background p-4">
                            <DynamicChart
                              chartData={rows}
                              chartConfig={{
                                ...(chartConfig ?? defaultChartConfig),
                                title: chartMeta.title,
                                description: chartMeta.description,
                              }}
                              className="w-full"
                            />
                          </div>
                        ) : (
                          <div className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
                            Run a query with at least two columns to preview a
                            chart.
                          </div>
                        )
                      ) : (
                        <div className="min-h-[320px] overflow-auto rounded-xl bg-background p-4">
                          <SqlResultsTable
                            dataOverride={{
                              stage: "complete",
                              columns,
                              rows: runResult.rows as Record<string, unknown>[],
                            }}
                            dbIdentifier={resolvedDbIdentifier ?? undefined}
                            backendPreference={resolvedSqlBackend}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-muted/10 px-4 py-10 text-center text-sm text-muted-foreground">
                    Run a query to preview a metric card, chart, or table.
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="border-t border-border px-6 py-4">
          {error ? (
            <p className="mb-3 text-sm text-destructive">{error}</p>
          ) : null}
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
              {isSaving ? "Saving..." : saveLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
