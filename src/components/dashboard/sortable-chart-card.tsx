import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { GripVertical, Settings, Trash2 } from "lucide-react";
import { type CSSProperties } from "react";
import { CardConfigDialog } from "@/components/card-config-dialog";
import { ChartConfigDialog } from "@/components/chart-config-dialog";
import { DynamicChart } from "@/components/dynamic-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CardConfig, Config, Result } from "@/lib/types";
import type { DashboardChart } from "@/hooks/use-dashboard-detail";

type SortableChartCardProps = {
  chart: DashboardChart;
  config: Config | CardConfig | null;
  rows: Result[];
  onConfigChange: (newChartJson: string) => Promise<void>;
  onDelete: () => Promise<void>;
};

function isCardConfig(
  config: Config | CardConfig | null,
): config is CardConfig {
  if (!config) return false;
  return !("yKeys" in config) && !("type" in config) && !("xKey" in config);
}

export function SortableChartCard({
  chart,
  config,
  rows,
  onConfigChange,
  onDelete,
}: SortableChartCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: chart.id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative flex flex-col rounded-xl bg-card p-4 md:p-2"
    >
      <div className="absolute left-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          aria-label="Reorder chart"
          title="Drag to reorder"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-input bg-background text-muted-foreground hover:bg-muted"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            window.open(`/charts/${chart.id}`, "_blank");
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="View chart"
          title="View chart"
        >
          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
        </button>
      </div>
      {config && rows.length > 0 && !isCardConfig(config) ? (
        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <ChartConfigDialog
            trigger={
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Configure chart"
                title="Configure chart"
              >
                <Settings className="h-4 w-4" />
              </button>
            }
            config={config as Config}
            columns={Object.keys(rows[0] || {}).map((name) => ({
              name,
            }))}
            rows={rows}
            onConfigChange={async (newConfig) => {
              const newJson = JSON.stringify(newConfig);
              await onConfigChange(newJson);
            }}
          />
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Delete chart"
            title="Delete chart"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : config && rows.length > 0 && isCardConfig(config) ? (
        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <CardConfigDialog
            trigger={
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Configure card"
                title="Configure card"
              >
                <Settings className="h-4 w-4" />
              </button>
            }
            config={config as CardConfig}
            onConfigChange={async (newConfig) => {
              const newJson = JSON.stringify(newConfig);
              await onConfigChange(newJson);
            }}
          />
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Delete card"
            title="Delete card"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {config && rows.length > 0 ? (
        isCardConfig(config) ? (
          <Card className="w-full h-full flex flex-col">
            <CardHeader>
              <CardTitle className="text-base font-medium text-muted-foreground">
                {config.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center">
              <div className="text-4xl font-bold text-foreground">
                {(() => {
                  const value = rows[0]?.[Object.keys(rows[0] || {})[0]];
                  if (typeof value === "number") {
                    return value.toLocaleString();
                  }
                  if (typeof value === "boolean") {
                    return value.toString();
                  }
                  if (value instanceof Date) {
                    return value.toLocaleString();
                  }
                  return String(value ?? "");
                })()}
              </div>
              {config.description && (
                <div className="text-sm text-muted-foreground mt-2">
                  {config.description}
                </div>
              )}
              {config.takeaway && (
                <div className="text-xs text-muted-foreground mt-2 italic">
                  {config.takeaway}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <DynamicChart
            chartData={rows}
            chartConfig={config as Config}
            className="w-full"
          />
        )
      ) : (
        <div className="text-xs text-muted-foreground">No data</div>
      )}
    </div>
  );
}

