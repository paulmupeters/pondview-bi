import { MinusCircleIcon, PlusCircleIcon } from "lucide-react";
import type { VisualSnapshot } from "@/components/dashboard-builder-panel.shared";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { SqlChart } from "@/components/sql-chart";
import { SqlResultsTable } from "@/components/sql-results-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { CardConfig, Config, TableConfig, TextConfig } from "@/lib/types";
import { cn } from "@/lib/utils";

function getSnapshotTitle(snapshot: VisualSnapshot): string {
  if (snapshot.type === "text") {
    return snapshot.payload.textConfig?.title || "Text card";
  }

  if (snapshot.type === "card") {
    return snapshot.payload.cardConfig?.title || "Untitled card";
  }

  if (snapshot.type === "table") {
    return snapshot.payload.tableConfig?.title || "Untitled table";
  }

  return snapshot.payload.chartConfig?.title || "Untitled visual";
}

function formatCardValue(value: unknown): string {
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
}

function DashboardVisualPreview({
  snapshot,
  onRemove,
  onVisualTypeChange,
}: {
  snapshot: VisualSnapshot;
  onRemove: (id: string) => void;
  onVisualTypeChange: (id: string, type: VisualSnapshot["type"]) => void;
}) {
  const canToggleTableChart = Boolean(
    snapshot.payload.chartConfig &&
      snapshot.payload.tableConfig &&
      snapshot.payload.columns?.length &&
      snapshot.rows.length,
  );

  return (
    <div className="min-w-0 overflow-hidden rounded-md bg-card shadow-sm">
      <div className="flex min-w-0 items-center justify-between gap-3 px-3 py-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium">
            {getSnapshotTitle(snapshot)}
          </span>
          {snapshot.payload.query && (
            <span className="text-xs text-muted-foreground truncate max-w-70">
              {snapshot.payload.query}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canToggleTableChart && (
            <ToggleGroup
              type="single"
              size="sm"
              value={snapshot.type === "chart" ? "chart" : "table"}
              onValueChange={(value) => {
                if (value === "table" || value === "chart") {
                  onVisualTypeChange(snapshot.id, value);
                }
              }}
              className="gap-1"
            >
              <ToggleGroupItem
                value="table"
                size="sm"
                className={cn(
                  "h-7 rounded-sm px-2 text-xs",
                  snapshot.type === "table" && "bg-background shadow-sm",
                )}
              >
                Table
              </ToggleGroupItem>
              <ToggleGroupItem
                value="chart"
                size="sm"
                className={cn(
                  "h-7 rounded-sm px-2 text-xs",
                  snapshot.type === "chart" && "bg-background shadow-sm",
                )}
              >
                Chart
              </ToggleGroupItem>
            </ToggleGroup>
          )}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="text-destructive-foreground hover:text-destructive"
            onClick={() => onRemove(snapshot.id)}
          >
            <MinusCircleIcon className="h-4 w-4" />
            <span className="sr-only">Remove {snapshot.type}</span>
          </Button>
        </div>
      </div>

      {snapshot.type === "text" ? (
        <div className="min-w-0 p-4">
          <div className="rounded-md border bg-background p-3 text-sm">
            <MarkdownRenderer>
              {snapshot.payload.textConfig?.content ?? ""}
            </MarkdownRenderer>
          </div>
        </div>
      ) : snapshot.type === "card" ? (
        <div className="flex min-w-0 justify-center p-4">
          <Card className="w-full max-w-sm border-0 shadow-none">
            <CardHeader>
              <CardTitle className="text-base font-medium text-muted-foreground">
                {snapshot.payload.cardConfig?.title ||
                  (snapshot.payload.columns?.[0]?.name ?? "Value")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-foreground">
                {formatCardValue(
                  snapshot.rows[0]?.[snapshot.payload.columns?.[0]?.name ?? ""],
                )}
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
        <div className="min-w-0 p-4">
          <div className="rounded-md border bg-background">
            <SqlResultsTable
              dataOverride={{
                stage: "complete",
                columns: snapshot.payload.columns || [],
                rows: snapshot.rows,
                summary: snapshot.payload.summary,
              }}
            />
          </div>
        </div>
      ) : (
        <div className="min-w-0 p-4">
          <div className="rounded-md border bg-background p-3">
            <SqlChart
              customChartConfig={snapshot.payload.chartConfig}
              dataOverride={{
                ...snapshot.payload,
                rows: snapshot.rows,
                stage: "complete",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function RemovedVisualsList({
  snapshots,
  onRestore,
}: {
  snapshots: VisualSnapshot[];
  onRestore: (id: string) => void;
}) {
  if (snapshots.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Removed visuals</p>
      <div className="flex flex-wrap gap-2">
        {snapshots.map((snapshot) => (
          <Button
            key={snapshot.id}
            type="button"
            variant="outline"
            size="sm"
            className="flex items-center gap-1"
            onClick={() => onRestore(snapshot.id)}
          >
            <PlusCircleIcon className="h-4 w-4" />
            {getSnapshotTitle(snapshot)}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function SelectedVisualsSection({
  selectedCharts,
  removedCharts,
  visualSnapshots,
  onRemoveChart,
  onRestoreChart,
  onVisualTypeChange,
}: {
  selectedCharts: VisualSnapshot[];
  removedCharts: VisualSnapshot[];
  visualSnapshots: VisualSnapshot[];
  onRemoveChart: (id: string) => void;
  onRestoreChart: (id: string) => void;
  onVisualTypeChange: (id: string, type: VisualSnapshot["type"]) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div>
        <p className="text-sm font-medium">Selected visuals</p>
        <p className="text-xs text-muted-foreground">
          {selectedCharts.length} of {visualSnapshots.length} available visuals
        </p>
      </div>

      <div className="min-w-0 rounded-md border">
        <div className="min-w-0 space-y-4 p-3">
          {selectedCharts.length === 0 ? (
            <div className="text-sm text-muted-foreground py-12 text-center">
              {visualSnapshots.length === 0
                ? "No visuals available yet. Generate a chart or card in the conversation to get started."
                : "No visuals selected. Restore a visual below to add it."}
            </div>
          ) : (
            selectedCharts.map((snapshot) => (
              <DashboardVisualPreview
                key={snapshot.id}
                snapshot={snapshot}
                onRemove={onRemoveChart}
                onVisualTypeChange={onVisualTypeChange}
              />
            ))
          )}
        </div>
      </div>

      <RemovedVisualsList
        snapshots={removedCharts}
        onRestore={onRestoreChart}
      />
    </div>
  );
}

export function getDashboardItemConfig(snapshot: VisualSnapshot): {
  config: CardConfig | TableConfig | Config | TextConfig | undefined;
  title: string;
  description: string | null;
} {
  let config: CardConfig | TableConfig | Config | TextConfig | undefined;
  let title = "Untitled visual";

  if (snapshot.type === "text") {
    config = snapshot.payload.textConfig;
    title = snapshot.payload.textConfig?.title ?? "Text card";
  } else if (snapshot.type === "card") {
    config = snapshot.payload.cardConfig;
    title = config?.title ?? "Untitled card";
  } else if (snapshot.type === "table") {
    config = snapshot.payload.tableConfig;
    title = config?.title ?? "Untitled table";
  } else {
    config = snapshot.payload.chartConfig;
    title = config?.title ?? "Untitled chart";
  }

  const description =
    config && "description" in config ? (config.description ?? null) : null;

  return { config, title, description };
}
