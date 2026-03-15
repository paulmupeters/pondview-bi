import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Funnel, GripVertical, Settings, Trash2 } from "lucide-react";
import type { CSSProperties } from "react";
import { MetricCard } from "@/components/metric-card";
import { MetricCardSettingsDialog } from "@/components/metric-card-settings-dialog";
import type { CardConfig, Config, TableConfig, TextConfig } from "@/lib/types";
import type { MetricCardInGroupProps } from "../types";
import { isCardConfig } from "../utils";
import { MetricCardSqlEditor } from "./MetricCardSqlEditor";

export function MetricCardInGroup({
  chart,
  chartData,
  measure,
  measureValue,
  onConfigChange,
  onMeasureChange,
  onDelete,
  expandedSqlChartId,
  onToggleSql,
  onSqlUpdate,
  isFirst,
  isLast: _isLast,
  isSelected,
  onSelect,
}: MetricCardInGroupProps) {
  const appliedFilterCount = chart.appliedFiltersCount ?? 0;
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

  let config: Config | CardConfig | TableConfig | TextConfig | null = null;
  try {
    const parsed = JSON.parse(chart.chartConfigJson);
    config = parsed as Config | CardConfig | TableConfig | TextConfig;
  } catch {
    config = null;
  }
  const rows = chartData[chart.id] || [];
  const isExpanded = expandedSqlChartId === chart.id;
  const emptyStateMessage = chart.errorMessage?.trim() || "No data";
  const emptyStateClassName = chart.errorMessage
    ? "text-xs text-destructive"
    : "text-xs text-muted-foreground";

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-chart-group-card-id={chart.id}
      className={`flex-1 flex flex-col p-4 md:p-2 relative group/item transition-colors ring-1 ring-inset ${
        isSelected
          ? "bg-primary/5 ring-primary/40"
          : "bg-transparent ring-transparent"
      }`}
    >
      <div className="absolute left-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover/item:opacity-100 z-30">
        <button
          type="button"
          aria-label="Reorder card"
          title="Drag to reorder"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-input bg-background text-muted-foreground hover:bg-muted"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Filter this visual"
          title="Filter this visual"
          onClick={() => onSelect(chart.id)}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background transition-colors hover:bg-muted ${
            isSelected
              ? "text-primary border-primary/50"
              : "text-muted-foreground"
          }`}
        >
          <Funnel className="h-4 w-4" />
        </button>
      </div>
      {chart.filtersApplied && appliedFilterCount > 0 && isFirst && (
        <div className="absolute left-1/2 top-2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            {appliedFilterCount} filter{appliedFilterCount !== 1 ? "s" : ""}{" "}
            applied
          </span>
        </div>
      )}
      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover/item:opacity-100 z-20">
        <MetricCardSettingsDialog
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
          measure={measure}
          currentMeasureValue={measureValue}
          onConfigChange={async (newConfig) => {
            const newJson = JSON.stringify(newConfig);
            await onConfigChange(chart.id, newJson);
          }}
          onMeasureChange={
            measure
              ? async (updates) => {
                  await onMeasureChange(measure.id, updates);
                }
              : undefined
          }
        />
        <button
          type="button"
          onClick={() => onDelete(chart.id)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label="Delete card"
          title="Delete card"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {config && rows.length > 0 && isCardConfig(config) ? (
        <MetricCard
          value={rows[0]?.[Object.keys(rows[0] || {})[0]]}
          title={config.title}
          description={config.description}
          takeaway={config.takeaway}
          className="w-full h-full flex flex-col border-0 shadow-none"
        />
      ) : (
        <div className={emptyStateClassName}>{emptyStateMessage}</div>
      )}
      {isExpanded && (
        <div className="mt-4 border-t pt-4 transition-all duration-200">
          <MetricCardSqlEditor
            chart={chart}
            expandedSqlChartId={expandedSqlChartId}
            onToggleSql={onToggleSql}
            onSqlUpdate={onSqlUpdate}
          />
        </div>
      )}
    </div>
  );
}
