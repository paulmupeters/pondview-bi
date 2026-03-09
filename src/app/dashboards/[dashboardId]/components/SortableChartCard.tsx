import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import {
  Funnel,
  GripVertical,
  MoveDiagonal2,
  Settings,
  Trash2,
} from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { CardConfigDialog } from "@/components/card-config-dialog";
import { ChartConfigDialog } from "@/components/chart-config-dialog";
import { DynamicChart } from "@/components/dynamic-chart";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { MetricCard } from "@/components/metric-card";
import { SqlResultsTable } from "@/components/sql-results-table";
import { TableConfigDialog } from "@/components/table-config-dialog";
import { TextConfigDialog } from "@/components/text-config-dialog";
import { Button } from "@/components/ui/button";
import type { CardConfig, Config, TableConfig, TextConfig } from "@/lib/types";
import { useFilters } from "../filter-context";
import type { SortableChartCardProps } from "../types";
import {
  getColSpanClass,
  isCardConfig,
  isTableConfig,
  isTextConfig,
} from "../utils";

export function SortableChartCard({
  chart,
  config,
  rows,
  onConfigChange,
  onDelete,
  expandedSqlChartId,
  onToggleSql,
  onSqlUpdate,
  totalColumns,
  isInGroup: _isInGroup = false,
  onResizeChange,
  isSelected = false,
  onSelect,
  onPreviewChart,
}: SortableChartCardProps) {
  const { filters } = useFilters();
  const [editedSql, setEditedSql] = useState(chart.sql);
  const [isSaving, setIsSaving] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [tempColSpan, setTempColSpan] = useState<number | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const [pointerId, setPointerId] = useState<number | null>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const isExpanded = expandedSqlChartId === chart.id;

  // Get colSpan from config, default to 1
  const currentColSpan =
    config &&
    !isCardConfig(config) &&
    !isTableConfig(config) &&
    !isTextConfig(config) &&
    "colSpan" in config
      ? ((config as Config).colSpan ?? 1)
      : 1;

  const pendingColSpan = Math.min(
    totalColumns,
    Math.max(1, tempColSpan ?? currentColSpan),
  );
  const displayColSpan = pendingColSpan;

  const isChart =
    config &&
    !isCardConfig(config) &&
    !isTableConfig(config) &&
    !isTextConfig(config);
  const canPreview = Boolean(config && (isChart || isTableConfig(config)));
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

  useEffect(() => {
    if (isExpanded) {
      setEditedSql(chart.sql);
    }
  }, [isExpanded, chart.sql]);

  // Resize handlers
  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      setResizeStartX(e.clientX);
      setPointerId(e.pointerId);
      if (cardRef.current) {
        setResizeStartWidth(cardRef.current.getBoundingClientRect().width);
      }
      setTempColSpan(currentColSpan);
      onResizeChange?.(currentColSpan);
      if (resizeRef.current) {
        resizeRef.current.setPointerCapture(e.pointerId);
      }
    },
    [currentColSpan, onResizeChange],
  );

  const handleResizeMove = useCallback(
    (e: PointerEvent) => {
      if (!isResizing || !cardRef.current) return;

      const cardElement = cardRef.current;
      const gridContainer = cardElement.closest(".grid") as HTMLElement;
      if (!gridContainer) return;

      const gridRect = gridContainer.getBoundingClientRect();
      const gridGap = 16; // gap-4 = 16px (md:gap-4)
      const gridColumnWidth =
        (gridRect.width - gridGap * (totalColumns - 1)) / totalColumns;

      // Calculate new width based on mouse movement
      const deltaX = e.clientX - resizeStartX;
      const newWidth = Math.max(gridColumnWidth, resizeStartWidth + deltaX);

      // Convert width to column span
      // For S columns: width = S * columnWidth + (S-1) * gap
      // Solving for S: S = (width + gap) / (columnWidth + gap)
      const newColSpan = Math.max(
        1,
        Math.min(
          totalColumns,
          Math.round((newWidth + gridGap) / (gridColumnWidth + gridGap)),
        ),
      );

      setTempColSpan(newColSpan);
      onResizeChange?.(newColSpan);
    },
    [isResizing, resizeStartX, resizeStartWidth, totalColumns, onResizeChange],
  );

  const handleResizeEnd = useCallback(async () => {
    if (
      tempColSpan !== null &&
      tempColSpan !== currentColSpan &&
      isChart &&
      config
    ) {
      const updatedConfig = { ...(config as Config), colSpan: tempColSpan };
      await onConfigChange(JSON.stringify(updatedConfig));
    }
    setIsResizing(false);
    setTempColSpan(null);
    onResizeChange?.(null);
    if (resizeRef.current && pointerId !== null) {
      resizeRef.current.releasePointerCapture(pointerId);
    }
    setPointerId(null);
  }, [
    tempColSpan,
    currentColSpan,
    isChart,
    config,
    onConfigChange,
    pointerId,
    onResizeChange,
  ]);

  useEffect(() => {
    if (isResizing) {
      const handleMove = (e: PointerEvent) => handleResizeMove(e);
      const handleEnd = () => void handleResizeEnd();

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleEnd);

      return () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

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

  const colSpanClass = isChart
    ? getColSpanClass(displayColSpan, totalColumns)
    : "";

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        if (node) {
          cardRef.current = node;
        }
      }}
      style={style}
      className={`group relative flex flex-col rounded-xl bg-card border border-border shadow-md p-4 md:p-2 ${colSpanClass} ${isResizing ? "ring-2 ring-primary/50" : ""} ${isSelected ? "ring-1 ring-primary/50 bg-primary/5" : ""}`}
    >
      <div className="absolute left-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 z-30">
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
        {canPreview ? (
          <button
            type="button"
            onClick={() => onPreviewChart?.(chart.id)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="View chart"
            title="View chart"
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onSelect?.(chart.id)}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background transition-colors hover:bg-muted hover:text-foreground ${
            isSelected
              ? "text-primary border-primary/50"
              : "text-muted-foreground"
          }`}
          aria-label="Filter this visual"
          title="Filter this visual"
        >
          <Funnel className="h-4 w-4" />
        </button>
      </div>
      {chart.filtersApplied && filters.length > 0 && (
        <div className="absolute left-1/2 top-2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            {filters.length} filter{filters.length !== 1 ? "s" : ""} applied
          </span>
        </div>
      )}
      {config &&
      rows.length > 0 &&
      !isCardConfig(config) &&
      !isTableConfig(config) &&
      !isTextConfig(config) ? (
        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 z-20">
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
      ) : config && rows.length > 0 && isTableConfig(config) ? (
        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 z-30">
          <TableConfigDialog
            trigger={
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Configure table"
                title="Configure table"
              >
                <Settings className="h-4 w-4" />
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
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Delete table"
            title="Delete table"
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
      ) : config && isTextConfig(config) ? (
        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 z-30">
          <TextConfigDialog
            trigger={
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Configure text card"
                title="Configure text card"
              >
                <Settings className="h-4 w-4" />
              </button>
            }
            config={config as TextConfig}
            onConfigChange={async (newConfig) => {
              const newJson = JSON.stringify(newConfig);
              await onConfigChange(newJson);
            }}
          />
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Delete text card"
            title="Delete text card"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {config ? (
        isCardConfig(config) && rows.length > 0 ? (
          <MetricCard
            value={rows[0]?.[Object.keys(rows[0] || {})[0]]}
            title={config.title}
            description={config.description}
            takeaway={config.takeaway}
            className="w-full h-full flex flex-col border-0 shadow-none"
          />
        ) : isTableConfig(config) && rows.length > 0 ? (
          <div className="w-full">
            <SqlResultsTable
              dataOverride={{
                stage: "complete",
                columns: Object.keys(rows[0] || {}).map((name) => ({ name })),
                rows: rows as Record<string, unknown>[],
              }}
            />
          </div>
        ) : isTextConfig(config) ? (
          <div className="flex w-full flex-col gap-2 p-2">
            {config.title ? (
              <h3 className="text-base font-semibold leading-tight">
                {config.title}
              </h3>
            ) : null}
            <MarkdownRenderer>{config.content}</MarkdownRenderer>
          </div>
        ) : rows.length > 0 ? (
          <DynamicChart
            chartData={rows}
            chartConfig={config as Config}
            className="w-full"
          />
        ) : (
          <div className="text-xs text-muted-foreground">No data</div>
        )
      ) : (
        <div className="text-xs text-muted-foreground">No data</div>
      )}
      {isChart && (
        <div
          ref={resizeRef}
          onPointerDown={(e) => {
            e.stopPropagation();
            handleResizeStart(e);
          }}
          className="absolute bottom-0 right-0 cursor-nwse-resize opacity-0 transition-opacity group-hover:opacity-100 z-40 p-2 bg-background/80 rounded-tl-md"
          style={{ cursor: isResizing ? "nwse-resize" : "nwse-resize" }}
          title="Drag to resize chart width"
        >
          <MoveDiagonal2 className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      {isExpanded && (
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
