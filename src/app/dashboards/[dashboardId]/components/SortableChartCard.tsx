import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import {
  Funnel,
  GripVertical,
  MoreHorizontal,
  Settings,
  Trash2,
} from "lucide-react";
import {
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ChartConfigDialog } from "@/components/chart-config-dialog";
import { DynamicChart } from "@/components/dynamic-chart";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { MetricCard } from "@/components/metric-card";
import { MetricCardSettingsDialog } from "@/components/metric-card-settings-dialog";
import { SqlResultsTable } from "@/components/sql-results-table";
import { TableConfigDialog } from "@/components/table-config-dialog";
import { TextConfigDialog } from "@/components/text-config-dialog";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { renderTextTemplate } from "@/lib/dashboard/measures";
import type { CardConfig, Config, TableConfig, TextConfig } from "@/lib/types";
import type { DashboardChartCardProps } from "../types";
import { isCardConfig, isTableConfig, isTextConfig } from "../utils";

export function DashboardChartCard({
  chart,
  config,
  rows,
  measures,
  measureOptions,
  measure,
  measureValue,
  onConfigChange,
  onMeasureChange,
  onDelete,
  expandedSqlChartId,
  onToggleSql,
  onSqlUpdate,
  isInGroup: _isInGroup = false,
  isSelected = false,
  onSelect,
  onPreviewChart,
  readOnly = false,
}: DashboardChartCardProps) {
  const appliedFilterCount = chart.appliedFiltersCount ?? 0;
  const [editedSql, setEditedSql] = useState(chart.sql);
  const [isSaving, setIsSaving] = useState(false);
  const isExpanded = expandedSqlChartId === chart.id;

  const isTable = Boolean(config && isTableConfig(config));
  const canPreview = Boolean(config && !isTextConfig(config));

  useEffect(() => {
    if (isExpanded) {
      setEditedSql(chart.sql);
    }
  }, [isExpanded, chart.sql]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSqlUpdate(chart.id, editedSql);
      onToggleSql(chart.id);
    } catch (error) {
      console.error("Failed to save SQL:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedSql(chart.sql);
    onToggleSql(chart.id);
  };

  const renderedTextContent = useMemo(() => {
    if (!config || !isTextConfig(config)) {
      return "";
    }
    return renderTextTemplate(config.content, measures);
  }, [config, measures]);

  const handleCardClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (isSelected && e.target === e.currentTarget) {
      onSelect?.("");
    }
  };

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isSelected || event.target !== event.currentTarget) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect?.("");
    }
  };

  const emptyStateMessage = chart.errorMessage?.trim() || "No data";
  const emptyStateClassName = chart.errorMessage
    ? "text-xs text-destructive"
    : "text-xs text-muted-foreground";

  const cardTitle =
    (config && "title" in config ? config.title : null) ||
    chart.title ||
    "Untitled card";

  const settingsButtonClassName =
    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground";
  const settingsIconClassName = "h-4 w-4 text-muted-foreground";

  const settingsDialog = (() => {
    if (readOnly || !config) {
      return null;
    }

    if (
      rows.length > 0 &&
      !isCardConfig(config) &&
      !isTableConfig(config) &&
      !isTextConfig(config)
    ) {
      return (
        <ChartConfigDialog
          trigger={
            <button type="button" className={settingsButtonClassName}>
              <Settings className={settingsIconClassName} />
              Settings
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
          sql={chart.sql}
          dbIdentifier={chart.dbIdentifier ?? undefined}
          backendPreference={chart.sqlBackend ?? undefined}
          onSqlSave={(newSql) => onSqlUpdate(chart.id, newSql)}
        />
      );
    }

    if (rows.length > 0 && isTableConfig(config)) {
      return (
        <TableConfigDialog
          trigger={
            <button type="button" className={settingsButtonClassName}>
              <Settings className={settingsIconClassName} />
              Settings
            </button>
          }
          config={config as TableConfig}
          columns={Object.keys(rows[0] || {}).map((name) => ({
            name,
          }))}
          onConfigChange={async (newConfig) => {
            const newJson = JSON.stringify(newConfig);
            await onConfigChange(newJson);
          }}
        />
      );
    }

    if (rows.length > 0 && isCardConfig(config)) {
      return (
        <MetricCardSettingsDialog
          trigger={
            <button type="button" className={settingsButtonClassName}>
              <Settings className={settingsIconClassName} />
              Settings
            </button>
          }
          config={config as CardConfig}
          measure={measure}
          currentMeasureValue={measureValue}
          onConfigChange={async (newConfig) => {
            const newJson = JSON.stringify(newConfig);
            await onConfigChange(newJson);
          }}
          onMeasureChange={
            measure && onMeasureChange
              ? async (updates) => {
                  await onMeasureChange(measure.id, updates);
                }
              : undefined
          }
        />
      );
    }

    if (isTextConfig(config)) {
      return (
        <TextConfigDialog
          trigger={
            <button type="button" className={settingsButtonClassName}>
              <Settings className={settingsIconClassName} />
              Settings
            </button>
          }
          config={config as TextConfig}
          measures={measures}
          measureOptions={measureOptions}
          onConfigChange={async (newConfig) => {
            const newJson = JSON.stringify(newConfig);
            await onConfigChange(newJson);
          }}
        />
      );
    }

    return null;
  })();

  return (
    /* biome-ignore lint/a11y/useSemanticElements: This selectable card container also contains nested interactive controls, so it cannot be converted to a native button element. */
    <div
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      data-chart-card-id={chart.id}
      role="button"
      tabIndex={0}
      className={`group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-md p-4 pt-12 md:p-2 md:pt-12 ring-1 ring-inset ${isSelected ? "ring-primary bg-primary/5" : "ring-transparent"}`}
    >
      {!readOnly ? (
        <div className="absolute left-2 top-2 z-30">
          <button
            type="button"
            aria-label="Reorder chart"
            title="Drag to reorder"
            className="dashboard-tile-drag-handle inline-flex h-8 w-8 cursor-grab items-center justify-center rounded-md border border-dashed border-input bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      <div className="pointer-events-none absolute left-12 right-12 top-2 z-20 flex h-8 items-center justify-center">
        <h3 className="truncate text-center text-sm font-semibold leading-none text-foreground">
          {cardTitle}
        </h3>
      </div>
      <div className="absolute right-2 top-2 z-30">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Card options"
              title="Card options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48 p-1">
            <div className="flex flex-col gap-0.5">
              {canPreview ? (
                <button
                  type="button"
                  onClick={() => onPreviewChart?.(chart.id)}
                  className={settingsButtonClassName}
                >
                  <ArrowTopRightOnSquareIcon
                    className={settingsIconClassName}
                  />
                  Expand
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onSelect?.(chart.id)}
                className={`${settingsButtonClassName} ${isSelected ? "text-primary" : ""}`}
              >
                <Funnel className={settingsIconClassName} />
                Filter this visual
              </button>
              {settingsDialog}
              {!readOnly ? (
                <button
                  type="button"
                  onClick={() => void onDelete()}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive outline-none transition-colors hover:bg-destructive/10 focus:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {chart.filtersApplied && appliedFilterCount > 0 && (
        <div className="absolute left-1/2 top-10 z-20 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            {appliedFilterCount} filter{appliedFilterCount !== 1 ? "s" : ""}{" "}
            applied
          </span>
        </div>
      )}
      {config ? (
        isCardConfig(config) && rows.length > 0 ? (
          <MetricCard
            value={rows[0]?.[Object.keys(rows[0] || {})[0]]}
            title={config.title}
            description={config.description}
            takeaway={config.takeaway}
            className="w-full h-full flex flex-col border-0 shadow-none"
            showTitle={false}
          />
        ) : isTable && rows.length > 0 ? (
          <div className="w-full">
            <SqlResultsTable
              dataOverride={{
                stage: "complete",
                columns: Object.keys(rows[0] || {}).map((name) => ({ name })),
                rows: rows as Record<string, unknown>[],
              }}
              enableColumnFilters={false}
            />
          </div>
        ) : isTextConfig(config) ? (
          <div className="flex w-full flex-col gap-2 p-2">
            <MarkdownRenderer>{renderedTextContent}</MarkdownRenderer>
          </div>
        ) : rows.length > 0 ? (
          <DynamicChart
            chartData={rows}
            chartConfig={config as Config}
            className="w-full min-h-0 flex-1"
            showMetadata={false}
            fillAvailableHeight
          />
        ) : (
          <div className={emptyStateClassName}>{emptyStateMessage}</div>
        )
      ) : (
        <div className={emptyStateClassName}>{emptyStateMessage}</div>
      )}
      {isExpanded && !readOnly && (
        <div className="mt-4 border-t pt-4 transition-all duration-200">
          <div className="flex flex-col gap-3">
            <label
              htmlFor={`sql-editor-${chart.id}`}
              className="text-sm font-medium"
            >
              SQL Query
            </label>
            <textarea
              id={`sql-editor-${chart.id}`}
              value={editedSql}
              onChange={(e) => setEditedSql(e.target.value)}
              className="min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="SELECT * FROM ..."
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={isSaving || editedSql === chart.sql}
              >
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
