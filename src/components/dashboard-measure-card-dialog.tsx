import { useEffect, useMemo, useState } from "react";
import { MetricCard } from "@/components/metric-card";
import {
  SqlPreviewPanel,
  type SqlPreviewRunResult,
} from "@/components/sql-preview-panel";
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
  formatFirstRowMeasureValue,
  type MeasureOption,
  normalizeMeasureName,
} from "@/lib/dashboard/measures";
import {
  DEFAULT_WASM_DB_IDENTIFIER,
  resolveSqlBackend,
  type SqlBackend,
} from "@/lib/sql/sql-runtime";
import { useSqlBackendPreference } from "@/lib/sql/use-sql-backend";
import type { CardConfig, Result } from "@/lib/types";
import {
  addChartToDashboard,
  createDashboardMeasure,
} from "@/lib/workspace/dashboard-repo";

type DashboardMeasureCardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardId: string;
  existingMeasures: MeasureOption[];
  onSaved?: () => Promise<void> | void;
};

function getExistingMeasureId(measure: MeasureOption): string {
  if (measure.measureId) {
    return measure.measureId;
  }

  if (measure.sourceChartId) {
    return `legacy:${measure.sourceChartId}`;
  }

  return `legacy:${measure.key}`;
}

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

export function DashboardMeasureCardDialog({
  open,
  onOpenChange,
  dashboardId,
  existingMeasures,
  onSaved,
}: DashboardMeasureCardDialogProps) {
  const sqlBackendPreference = useSqlBackendPreference();
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selectedMeasureId, setSelectedMeasureId] = useState<string | null>(
    null,
  );
  const [measureLabel, setMeasureLabel] = useState("");
  const [measureSql, setMeasureSql] = useState("");
  const [previewRows, setPreviewRows] = useState<Result[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [takeaway, setTakeaway] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const defaultMeasure = existingMeasures[0] ?? null;
    setMode(defaultMeasure ? "existing" : "new");
    setSelectedMeasureId(
      defaultMeasure ? getExistingMeasureId(defaultMeasure) : null,
    );
    setMeasureLabel("");
    setMeasureSql("");
    setPreviewRows([]);
    setTitle(defaultMeasure?.label ?? "");
    setDescription("");
    setTakeaway("");
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
    if (mode !== "existing") {
      return;
    }

    setTitle(selectedMeasure?.label ?? "");
    setDescription("");
    setTakeaway("");
  }, [mode, selectedMeasure]);

  const newMeasureKey = useMemo(
    () => normalizeMeasureName(measureLabel),
    [measureLabel],
  );
  const newMeasureValue = useMemo(
    () => formatFirstRowMeasureValue(previewRows),
    [previewRows],
  );
  const previewValue =
    mode === "existing" ? (selectedMeasure?.value ?? "") : newMeasureValue;
  const resolvedSqlBackend = resolveSqlBackend({
    backendPreference: sqlBackendPreference,
    dbIdentifier: undefined,
  });
  const resolvedDbIdentifier = resolveStoredDbIdentifier(resolvedSqlBackend);

  const canSave =
    !isSaving &&
    title.trim().length > 0 &&
    (mode === "existing"
      ? Boolean(selectedMeasure?.sql?.trim().length)
      : measureLabel.trim().length > 0 &&
        newMeasureKey.length > 0 &&
        measureSql.trim().length > 0 &&
        previewRows.length > 0);

  const handleSave = async () => {
    if (!canSave) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      let measure = selectedMeasure;

      if (mode === "new") {
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
        title: title.trim(),
        description: description.trim(),
        takeaway: takeaway.trim() ? takeaway.trim() : undefined,
      };
      if (measure.source === "saved" && measure.measureId) {
        cardConfig.measureId = measure.measureId;
      }

      if (!measure.sql?.trim()) {
        throw new Error("The selected measure is missing its SQL query.");
      }

      await addChartToDashboard({
        dashboardId,
        title: cardConfig.title,
        description: cardConfig.description,
        sql: measure.sql,
        dbIdentifier: measure.dbIdentifier ?? null,
        sqlBackend: measure.sqlBackend ?? null,
        chartConfigJson: JSON.stringify(cardConfig),
      });

      await onSaved?.();
      onOpenChange(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to add measure card.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-hidden bg-card">
        <DialogHeader>
          <DialogTitle>Add Measure Card</DialogTitle>
        </DialogHeader>

        <div className="flex max-h-[80vh] flex-col gap-4 overflow-hidden">
          <Tabs
            value={mode}
            onValueChange={(nextValue) => {
              if (nextValue === "existing" || nextValue === "new") {
                setMode(nextValue);
              }
            }}
            className="min-h-0 flex-1"
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

            <TabsContent value="existing" className="min-h-0 flex-1">
              <div className="grid min-h-0 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
                <div className="space-y-2 overflow-auto rounded-xl border border-border bg-muted/15 p-3">
                  {existingMeasures.length > 0 ? (
                    existingMeasures.map((measure) => {
                      const measureId = getExistingMeasureId(measure);
                      const isSelected = measureId === selectedMeasureId;
                      return (
                        <button
                          key={measureId}
                          type="button"
                          onClick={() => setSelectedMeasureId(measureId)}
                          className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border bg-background hover:bg-muted/40"
                          }`}
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
                      No measures available yet. Create your first one in the
                      New measure tab.
                    </div>
                  )}
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-4 rounded-xl border border-border bg-background p-4">
                    <div className="space-y-2">
                      <label
                        htmlFor="existing-card-title"
                        className="text-sm font-medium"
                      >
                        Card title
                      </label>
                      <Input
                        id="existing-card-title"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Metric title"
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor="existing-card-description"
                        className="text-sm font-medium"
                      >
                        Description
                      </label>
                      <Input
                        id="existing-card-description"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="What this metric represents"
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor="existing-card-takeaway"
                        className="text-sm font-medium"
                      >
                        Takeaway
                      </label>
                      <Input
                        id="existing-card-takeaway"
                        value={takeaway}
                        onChange={(event) => setTakeaway(event.target.value)}
                        placeholder="Optional summary insight"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-muted/20 p-3">
                    <MetricCard
                      value={previewValue}
                      title={title.trim() || selectedMeasure?.label || "Metric"}
                      description={description.trim() || "Measure preview"}
                      takeaway={takeaway.trim() ? takeaway.trim() : undefined}
                      className="h-full border-0 bg-transparent shadow-none"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="new" className="min-h-0 flex-1">
              <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4 overflow-auto rounded-xl border border-border bg-background p-4">
                  <SqlPreviewPanel
                    query={measureSql}
                    dbIdentifier={resolvedDbIdentifier ?? undefined}
                    backendPreference={resolvedSqlBackend}
                    onQueryChange={setMeasureSql}
                    onSave={async (newSql) => {
                      setMeasureSql(newSql);
                    }}
                    onRunStart={() => setPreviewRows([])}
                    onRun={(result: SqlPreviewRunResult) => {
                      setPreviewRows(result.rows as Result[]);
                    }}
                    onCancel={() => {
                      setPreviewRows([]);
                    }}
                  />
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

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label
                        htmlFor="new-card-title"
                        className="text-sm font-medium"
                      >
                        Card title
                      </label>
                      <Input
                        id="new-card-title"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Metric title"
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor="new-card-description"
                        className="text-sm font-medium"
                      >
                        Description
                      </label>
                      <Input
                        id="new-card-description"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="What this metric represents"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="new-card-takeaway"
                      className="text-sm font-medium"
                    >
                      Takeaway
                    </label>
                    <Input
                      id="new-card-takeaway"
                      value={takeaway}
                      onChange={(event) => setTakeaway(event.target.value)}
                      placeholder="Optional summary insight"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <MetricCard
                    value={previewValue}
                    title={title.trim() || measureLabel.trim() || "Metric"}
                    description={description.trim() || "Measure preview"}
                    takeaway={takeaway.trim() ? takeaway.trim() : undefined}
                    className="h-full border-0 bg-transparent shadow-none"
                  />
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
              {isSaving ? "Saving..." : "Add metric card"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
