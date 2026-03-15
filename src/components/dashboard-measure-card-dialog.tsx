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
  type DbDashboardMeasure,
} from "@/lib/workspace/dashboard-repo";

type DashboardMeasureCardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardId: string;
  dashboardMeasures: DbDashboardMeasure[];
  measureValuesById: Record<string, string>;
  onSaved?: () => Promise<void> | void;
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

export function DashboardMeasureCardDialog({
  open,
  onOpenChange,
  dashboardId,
  dashboardMeasures,
  measureValuesById,
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

    const defaultMeasure = dashboardMeasures[0] ?? null;
    setMode(defaultMeasure ? "existing" : "new");
    setSelectedMeasureId(defaultMeasure?.id ?? null);
    setMeasureLabel("");
    setMeasureSql("");
    setPreviewRows([]);
    setTitle(defaultMeasure?.label ?? "");
    setDescription("");
    setTakeaway("");
    setError(null);
    setIsSaving(false);
  }, [dashboardMeasures, open]);

  const selectedMeasure = useMemo(
    () =>
      dashboardMeasures.find((measure) => measure.id === selectedMeasureId) ??
      null,
    [dashboardMeasures, selectedMeasureId],
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
  const selectedMeasureValue = selectedMeasure
    ? (measureValuesById[selectedMeasure.id] ?? "")
    : "";
  const previewValue =
    mode === "existing" ? selectedMeasureValue : newMeasureValue;
  const resolvedSqlBackend = resolveSqlBackend({
    backendPreference: sqlBackendPreference,
    dbIdentifier: undefined,
  });
  const resolvedDbIdentifier = resolveStoredDbIdentifier(resolvedSqlBackend);

  const canSave =
    !isSaving &&
    title.trim().length > 0 &&
    (mode === "existing"
      ? Boolean(selectedMeasure)
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
          id: created.id,
          dashboardId,
          key: newMeasureKey,
          label: measureLabel.trim(),
          sql: measureSql.trim(),
          dbIdentifier: resolvedDbIdentifier,
          sqlBackend: resolvedSqlBackend,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      }

      if (!measure) {
        throw new Error("Select or create a measure before saving.");
      }

      const cardConfig: CardConfig = {
        configType: "card",
        measureId: measure.id,
        title: title.trim(),
        description: description.trim(),
        takeaway: takeaway.trim() ? takeaway.trim() : undefined,
      };

      await addChartToDashboard({
        dashboardId,
        title: cardConfig.title,
        description: cardConfig.description,
        sql: measure.sql,
        dbIdentifier: measure.dbIdentifier,
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
                disabled={dashboardMeasures.length === 0}
              >
                Existing measures
              </TabsTrigger>
              <TabsTrigger value="new">New measure</TabsTrigger>
            </TabsList>

            <TabsContent value="existing" className="min-h-0 flex-1">
              <div className="grid min-h-0 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
                <div className="space-y-2 overflow-auto rounded-xl border border-border bg-muted/15 p-3">
                  {dashboardMeasures.length > 0 ? (
                    dashboardMeasures.map((measure) => {
                      const isSelected = measure.id === selectedMeasureId;
                      return (
                        <button
                          key={measure.id}
                          type="button"
                          onClick={() => setSelectedMeasureId(measure.id)}
                          className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border bg-background hover:bg-muted/40"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-medium">{measure.label}</div>
                            </div>
                          </div>
                          <p className="mt-2 truncate text-xs text-muted-foreground">
                            {measure.sql}
                          </p>
                        </button>
                      );
                    })
                  ) : (
                    <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                      No reusable measures yet. Create your first one in the New
                      measure tab.
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
