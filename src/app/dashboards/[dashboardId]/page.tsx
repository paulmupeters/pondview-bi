"use client";

import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { GripVertical, Pencil, Settings, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { CardConfigDialog } from "@/components/card-config-dialog";
import { ChartConfigDialog } from "@/components/chart-config-dialog";
import { DashboardFilterPane } from "@/components/dashboard-filter-pane";
import { DashboardSlicersBar } from "@/components/dashboard-slicers-bar";
import { DynamicChart } from "@/components/dynamic-chart";
import { MetricCard } from "@/components/metric-card";
import { SqlResultsTable } from "@/components/sql-results-table";
import { TableConfigDialog } from "@/components/table-config-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CardConfig, Config, Result, TableConfig } from "@/lib/types";
import { FilterProvider, useFilters } from "./filter-context";

type Dashboard = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};
type DashboardChart = {
  id: string;
  title: string | null;
  description: string | null;
  sql: string;
  dbIdentifier: string | null;
  chartConfigJson: string;
  position: number;
  createdAt: number;
  updatedAt: number;
  filtersApplied?: boolean;
};

type SortableChartCardProps = {
  chart: DashboardChart & { filtersApplied?: boolean };
  config: Config | CardConfig | TableConfig | null;
  rows: Result[];
  onConfigChange: (newChartJson: string) => Promise<void>;
  onDelete: () => Promise<void>;
  expandedSqlChartId: string | null;
  onToggleSql: (chartId: string) => void;
  onSqlUpdate: (chartId: string, newSql: string) => Promise<void>;
};

// Helper function to check if config is a card config
function isCardConfig(
  config: Config | CardConfig | TableConfig | null,
): config is CardConfig {
  if (!config) return false;
  // Check if it has the configType discriminator
  if ("configType" in config) {
    return config.configType === "card";
  }
  // Backwards compatibility: check if it looks like a card config
  // Cards have title and description but no chart-specific fields
  return (
    !("yKeys" in config) &&
    !("type" in config) &&
    !("xKey" in config) &&
    "title" in config &&
    "description" in config
  );
}

// Helper function to check if config is a table config
function isTableConfig(
  config: Config | CardConfig | TableConfig | null,
): config is TableConfig {
  if (!config) return false;
  // Check if it has the configType discriminator
  if ("configType" in config) {
    return config.configType === "table";
  }
  // New table configs will always have configType, so if it doesn't have it,
  // it's not a table (it's either a card or chart)
  return false;
}

function SortableChartCard({
  chart,
  config,
  rows,
  onConfigChange,
  onDelete,
  expandedSqlChartId,
  onToggleSql,
  onSqlUpdate,
}: SortableChartCardProps) {
  const { filters } = useFilters();
  const [editedSql, setEditedSql] = useState(chart.sql);
  const [isSaving, setIsSaving] = useState(false);
  const isExpanded = expandedSqlChartId === chart.id;
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative flex flex-col rounded-xl bg-card p-4 md:p-2"
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
        !isTableConfig(config) ? (
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
      ) : null}
      {config && rows.length > 0 ? (
        isCardConfig(config) ? (
          <MetricCard
            value={rows[0]?.[Object.keys(rows[0] || {})[0]]}
            title={config.title}
            description={config.description}
            takeaway={config.takeaway}
            className="w-full h-full flex flex-col border-0 shadow-none"
          />
        ) : isTableConfig(config) ? (
          <div className="w-full">
            <SqlResultsTable
              dataOverride={{
                stage: "complete",
                columns: Object.keys(rows[0] || {}).map((name) => ({ name })),
                rows: rows as Record<string, unknown>[],
              }}
            />
          </div>
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

export default function DashboardDetailPage() {
  const params = useParams<{ dashboardId: string }>();
  const dashboardId = params.dashboardId;
  return (
    <FilterProvider dashboardId={dashboardId}>
      <DashboardDetailPageContent dashboardId={dashboardId} />
    </FilterProvider>
  );
}

function DashboardDetailPageContent({ dashboardId }: { dashboardId: string }) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [charts, setCharts] = useState<DashboardChart[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<Record<string, Result[]>>({});
  const [columns, setColumns] = useState<number>(3);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [expandedSqlChartId, setExpandedSqlChartId] = useState<string | null>(
    null,
  );
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const { filters } = useFilters();

  useEffect(() => {
    if (!isEditingTitle && dashboard?.title) {
      setEditedTitle(dashboard.title);
    }
  }, [dashboard?.title, isEditingTitle]);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    const savedColumns = localStorage.getItem(
      `dashboard_${dashboardId}_columns`,
    );
    if (savedColumns) {
      const parsed = parseInt(savedColumns, 10);
      if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 6) {
        setColumns(parsed);
      }
    }
  }, [dashboardId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/dashboards`);
        if (res.ok) {
          const list = (await res.json()) as { dashboards: Dashboard[] };
          const d = list.dashboards.find((x) => x.id === dashboardId) || null;
          if (!cancelled) setDashboard(d);
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dashboardId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const filtersParam =
        filters.length > 0
          ? `?filters=${encodeURIComponent(JSON.stringify(filters))}`
          : "";
      const res = await fetch(
        `/api/dashboard/${dashboardId}/data${filtersParam}`,
        {
          cache: "no-store",
        },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        charts: (DashboardChart & {
          rows: Result[];
          filtersApplied?: boolean;
        })[];
      };
      if (cancelled) return;
      const sortedCharts = [...data.charts].sort(
        (a, b) => a.position - b.position,
      );
      setCharts(sortedCharts);
      const map: Record<string, Result[]> = {};
      for (const c of data.charts) map[c.id] = c.rows;
      setChartData(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [dashboardId, filters]);

  const startEditingTitle = useCallback(() => {
    if (!dashboard) return;
    setEditedTitle(dashboard.title);
    setTitleError(null);
    setIsEditingTitle(true);
  }, [dashboard]);

  const cancelTitleEdit = useCallback(() => {
    setEditedTitle(dashboard?.title ?? "");
    setTitleError(null);
    setIsEditingTitle(false);
  }, [dashboard]);

  const saveTitle = useCallback(async () => {
    if (!dashboard) return;
    const trimmedTitle = editedTitle.trim();
    if (!trimmedTitle) {
      setTitleError("Title cannot be empty");
      return;
    }
    try {
      setIsSavingTitle(true);
      const res = await fetch(`/api/dashboards/${dashboardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedTitle }),
      });
      if (!res.ok) {
        throw new Error("Failed to update dashboard title");
      }
      setDashboard((prev) =>
        prev ? { ...prev, title: trimmedTitle, updatedAt: Date.now() } : prev,
      );
      setTitleError(null);
      setIsEditingTitle(false);
    } catch (error) {
      console.error("Failed to update dashboard title:", error);
    } finally {
      setIsSavingTitle(false);
    }
  }, [dashboard, dashboardId, editedTitle]);

  const handleTitleFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void saveTitle();
    },
    [saveTitle],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const persistOrder = useCallback(
    async (previousOrder: DashboardChart[], nextOrder: DashboardChart[]) => {
      try {
        const res = await fetch(`/api/dashboard/${dashboardId}/charts`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chartIds: nextOrder.map((chart) => chart.id),
          }),
        });
        if (!res.ok) throw new Error("Failed to save order");
      } catch (error) {
        console.error(error);
        setCharts(previousOrder);
      }
    },
    [dashboardId],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setCharts((prev) => {
        const oldIndex = prev.findIndex((item) => item.id === active.id);
        const newIndex = prev.findIndex((item) => item.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return prev;
        const previousOrder = prev.map((chart, index) => ({
          ...chart,
          position: index,
        }));
        const moved = arrayMove(prev, oldIndex, newIndex);
        const nextOrder = moved.map((chart, index) => ({
          ...chart,
          position: index,
        }));
        void persistOrder(previousOrder, nextOrder);
        return nextOrder;
      });
    },
    [persistOrder],
  );

  const handleChartConfigChange = useCallback(
    async (chartId: string, newJson: string) => {
      setCharts((prev) =>
        prev.map((chart) =>
          chart.id === chartId ? { ...chart, chartConfigJson: newJson } : chart,
        ),
      );
      await fetch(`/api/charts/${chartId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chartConfigJson: newJson }),
      });
    },
    [],
  );

  const handleChartDelete = useCallback(
    async (chartId: string) => {
      try {
        const res = await fetch(
          `/api/dashboard/${dashboardId}/charts?chartId=${chartId}`,
          {
            method: "DELETE",
          },
        );
        if (!res.ok) throw new Error("Failed to delete chart");
        setCharts((prev) => prev.filter((chart) => chart.id !== chartId));
        setChartData((prev) => {
          const next = { ...prev };
          delete next[chartId];
          return next;
        });
      } catch (error) {
        console.error(error);
      }
    },
    [dashboardId],
  );

  const handleColumnsChange = useCallback(
    (value: string) => {
      const newColumns = parseInt(value, 10);
      setColumns(newColumns);
      localStorage.setItem(`dashboard_${dashboardId}_columns`, value);
      setIsSettingsOpen(false);
    },
    [dashboardId],
  );

  const handleToggleSql = useCallback((chartId: string) => {
    setExpandedSqlChartId((prev) => (prev === chartId ? null : chartId));
  }, []);

  const handleSqlUpdate = useCallback(
    async (chartId: string, newSql: string) => {
      try {
        // Update the SQL via API
        const res = await fetch(`/api/charts/${chartId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql: newSql }),
        });
        if (!res.ok) throw new Error("Failed to update SQL");

        // Update local chart state
        setCharts((prev) =>
          prev.map((chart) =>
            chart.id === chartId ? { ...chart, sql: newSql } : chart,
          ),
        );

        // Re-fetch chart data to update the chart with new SQL
        const filtersParam =
          filters.length > 0
            ? `?filters=${encodeURIComponent(JSON.stringify(filters))}`
            : "";
        const dataRes = await fetch(
          `/api/dashboard/${dashboardId}/data${filtersParam}`,
          {
            cache: "no-store",
          },
        );
        if (dataRes.ok) {
          const data = (await dataRes.json()) as {
            charts: (DashboardChart & {
              rows: Result[];
              filtersApplied?: boolean;
            })[];
          };
          const updatedChart = data.charts.find((c) => c.id === chartId);
          if (updatedChart) {
            setChartData((prev) => ({
              ...prev,
              [chartId]: updatedChart.rows,
            }));
          }
        }
      } catch (error) {
        console.error("Failed to update SQL:", error);
        throw error;
      }
    },
    [dashboardId, filters],
  );

  const getGridColsClass = (cols: number) => {
    const colMap: Record<number, string> = {
      1: "grid-cols-1",
      2: "md:grid-cols-2",
      3: "md:grid-cols-2 lg:grid-cols-3",
      4: "md:grid-cols-2 lg:grid-cols-4",
      5: "md:grid-cols-2 lg:grid-cols-5",
      6: "md:grid-cols-2 lg:grid-cols-6",
    };
    return colMap[cols] || colMap[3];
  };

  if (loading)
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!dashboard)
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Dashboard not found
      </div>
    );

  const trimmedEditedTitle = editedTitle.trim();
  const trimmedCurrentTitle = dashboard.title.trim();
  const isTitleSaveDisabled =
    isSavingTitle ||
    trimmedEditedTitle.length === 0 ||
    trimmedEditedTitle === trimmedCurrentTitle;

  return (
    <div className="mx-auto flex h-full w-full flex-col gap-1 overflow-y-auto px-6 md:px-12 lg:px-18 pt-2 pb-6 md:pb-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {isEditingTitle ? (
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
              onSubmit={handleTitleFormSubmit}
            >
              <div className="flex flex-col gap-1">
                <Input
                  ref={titleInputRef}
                  value={editedTitle}
                  onChange={(event) => {
                    setEditedTitle(event.target.value);
                    if (titleError) setTitleError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelTitleEdit();
                    }
                  }}
                  disabled={isSavingTitle}
                  placeholder="Dashboard title"
                  className="h-10 min-w-[200px] sm:min-w-[260px]"
                />
                {titleError ? (
                  <span className="text-xs text-destructive">{titleError}</span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" disabled={isTitleSaveDisabled}>
                  {isSavingTitle ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cancelTitleEdit}
                  disabled={isSavingTitle}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="group flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{dashboard.title}</h1>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={startEditingTitle}
                aria-label="Edit dashboard title"
                title="Edit title"
                className="opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="default">
                <Settings className="h-4 w-4" />
                Settings
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Dashboard Settings</DialogTitle>
                <DialogDescription>
                  Configure your dashboard layout preferences and filters.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-6 py-4">
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="columns-select"
                    className="text-sm font-medium"
                  >
                    Number of Columns
                  </label>
                  <Select
                    value={columns.toString()}
                    onValueChange={handleColumnsChange}
                  >
                    <SelectTrigger id="columns-select" className="w-full">
                      <SelectValue placeholder="Select columns" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Column</SelectItem>
                      <SelectItem value="2">2 Columns</SelectItem>
                      <SelectItem value="3">3 Columns</SelectItem>
                      <SelectItem value="4">4 Columns</SelectItem>
                      <SelectItem value="5">5 Columns</SelectItem>
                      <SelectItem value="6">6 Columns</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">Filters</h3>
                  <div className="rounded-md border p-4">
                    <DashboardFilterPane />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsSettingsOpen(false)}
                >
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <DashboardSlicersBar dashboardId={dashboardId} />

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext
          items={charts.map((c) => c.id)}
          strategy={rectSortingStrategy}
        >
          <div className={`grid gap-6 ${getGridColsClass(columns)}`}>
            {charts.map((c) => {
              let config: Config | CardConfig | TableConfig | null = null;
              try {
                const parsed = JSON.parse(c.chartConfigJson);
                config = parsed as Config | CardConfig | TableConfig;
              } catch {
                config = null;
              }
              const rows = chartData[c.id] || [];
              return (
                <SortableChartCard
                  key={c.id}
                  chart={c}
                  config={config}
                  rows={rows}
                  onConfigChange={(newJson) =>
                    handleChartConfigChange(c.id, newJson)
                  }
                  onDelete={() => handleChartDelete(c.id)}
                  expandedSqlChartId={expandedSqlChartId}
                  onToggleSql={handleToggleSql}
                  onSqlUpdate={handleSqlUpdate}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
