import { Settings2 } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatFirstRowMeasureValue } from "@/lib/dashboard/measures";
import type { CardConfig, Result } from "@/lib/types";
import type { WorkspaceDashboardMeasure } from "@/lib/workspace/workspace-db";

type MetricCardSettingsDialogProps = {
  trigger: React.ReactNode;
  config: CardConfig | null;
  measure?: WorkspaceDashboardMeasure | null;
  currentMeasureValue?: string;
  onConfigChange: (config: CardConfig) => Promise<void> | void;
  onMeasureChange?: (
    updates: Pick<WorkspaceDashboardMeasure, "label" | "sql">,
  ) => Promise<void> | void;
  tooltip?: string;
};

export function MetricCardSettingsDialog({
  trigger,
  config,
  measure = null,
  currentMeasureValue = "",
  onConfigChange,
  onMeasureChange,
  tooltip,
}: MetricCardSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(config?.title ?? "");
  const [description, setDescription] = useState(config?.description ?? "");
  const [takeaway, setTakeaway] = useState(config?.takeaway ?? "");
  const [measureLabel, setMeasureLabel] = useState(measure?.label ?? "");
  const [measureSql, setMeasureSql] = useState(measure?.sql ?? "");
  const [previewValue, setPreviewValue] = useState(currentMeasureValue);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setTitle(config?.title ?? "");
    setDescription(config?.description ?? "");
    setTakeaway(config?.takeaway ?? "");
    setMeasureLabel(measure?.label ?? "");
    setMeasureSql(measure?.sql ?? "");
    setPreviewValue(currentMeasureValue);
    setError(null);
  }, [
    config?.description,
    config?.takeaway,
    config?.title,
    currentMeasureValue,
    measure?.label,
    measure?.sql,
    open,
  ]);

  const hasConfigChanges =
    title !== (config?.title ?? "") ||
    description !== (config?.description ?? "") ||
    takeaway !== (config?.takeaway ?? "");
  const hasMeasureChanges =
    Boolean(measure) &&
    (measureLabel !== (measure?.label ?? "") ||
      measureSql !== (measure?.sql ?? ""));
  const canSave =
    !isSaving &&
    (hasConfigChanges || hasMeasureChanges) &&
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    (!measure ||
      (measureLabel.trim().length > 0 && measureSql.trim().length > 0));

  const previewCardTitle = title.trim() || measureLabel.trim() || "Metric";
  const previewCardDescription = description.trim() || "Measure preview";
  const helperText = useMemo(() => {
    if (!measure) {
      return null;
    }
    return `Token: {{${measure.key}}}`;
  }, [measure]);

  const handleSave = async () => {
    if (!canSave) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onConfigChange({
        configType: "card",
        measureId: config?.measureId,
        title: title.trim(),
        description: description.trim(),
        takeaway: takeaway.trim() ? takeaway.trim() : undefined,
      });

      if (measure && hasMeasureChanges) {
        await onMeasureChange?.({
          label: measureLabel.trim(),
          sql: measureSql.trim(),
        });
      }

      setOpen(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to update metric card settings.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      )}
      <DialogContent className="max-w-4xl bg-card p-6">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Settings2 className="h-5 w-5 text-muted-foreground" />
            Metric Card Settings
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="space-y-2">
                <label
                  htmlFor="metric-card-title"
                  className="text-sm font-medium"
                >
                  Card title
                </label>
                <Input
                  id="metric-card-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Metric title"
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="metric-card-description"
                  className="text-sm font-medium"
                >
                  Description
                </label>
                <Input
                  id="metric-card-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What this metric represents"
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="metric-card-takeaway"
                  className="text-sm font-medium"
                >
                  Takeaway
                </label>
                <Input
                  id="metric-card-takeaway"
                  value={takeaway}
                  onChange={(event) => setTakeaway(event.target.value)}
                  placeholder="Optional summary insight"
                />
              </div>
            </div>

            {measure ? (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label
                      htmlFor="metric-measure-label"
                      className="text-sm font-medium"
                    >
                      Shared measure label
                    </label>
                    <Input
                      id="metric-measure-label"
                      value={measureLabel}
                      onChange={(event) => setMeasureLabel(event.target.value)}
                      placeholder="Revenue"
                    />
                    {helperText ? (
                      <p className="text-xs text-muted-foreground">
                        {helperText}
                      </p>
                    ) : null}
                  </div>
                  <SqlPreviewPanel
                    query={measureSql}
                    dbIdentifier={measure.dbIdentifier ?? undefined}
                    backendPreference={measure.sqlBackend ?? undefined}
                    onQueryChange={setMeasureSql}
                    onSave={async (newSql) => {
                      setMeasureSql(newSql);
                    }}
                    onRunStart={() => setPreviewValue("")}
                    onRun={(result: SqlPreviewRunResult) => {
                      setPreviewValue(
                        formatFirstRowMeasureValue(result.rows as Result[]),
                      );
                    }}
                    onCancel={() => {
                      setMeasureSql(measure.sql);
                      setPreviewValue(currentMeasureValue);
                    }}
                  />
                </div>
              </>
            ) : null}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={!canSave}
              >
                {isSaving ? "Saving..." : "Apply"}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <MetricCard
              value={previewValue}
              title={previewCardTitle}
              description={previewCardDescription}
              className="h-full border-0 bg-transparent shadow-none"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
