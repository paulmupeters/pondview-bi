import { useEffect, useId, useMemo, useState } from "react";
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
import {
  buildDashboardSourceDescriptor,
  type DashboardSourceDescriptor,
} from "@/lib/dashboard/source-descriptor";
import {
  DEFAULT_WASM_DB_IDENTIFIER,
  isWasmLocalIdentifier,
  type SqlBackend,
} from "@/lib/sql/sql-runtime";
import type {
  CardConfig,
  Config,
  TableConfig,
  TextConfig,
  VisualType,
} from "@/lib/types";
import {
  addChartToDashboard,
  createDashboard,
  listDashboards,
} from "@/lib/workspace/dashboard-repo";

export type AddToDashboardVisualOption =
  | {
      type: "chart";
      config: Config;
      columns?: { name: string; type?: string }[];
      rows?: Record<string, unknown>[];
    }
  | {
      type: "table";
      config: TableConfig;
      columns: { name: string; type?: string }[];
      rows: Record<string, unknown>[];
    }
  | {
      type: "card";
      config: CardConfig;
      columns: { name: string; type?: string }[];
      rows: Record<string, unknown>[];
    }
  | {
      type: "text";
      config: TextConfig;
    };

type AddToDashboardVisualType = VisualType | "text";

type DashboardLite = { id: string; title: string | null; updatedAt: number };

function resolveStoredChartDbIdentifier(
  dbIdentifier: string | null | undefined,
  sqlBackend: SqlBackend | null,
): string | null {
  const normalized = dbIdentifier?.trim() ?? "";
  if (sqlBackend === "duckdb-wasm") {
    return normalized || DEFAULT_WASM_DB_IDENTIFIER;
  }

  if (sqlBackend === "bridge") {
    return normalized && !isWasmLocalIdentifier(normalized) ? normalized : null;
  }

  return normalized || DEFAULT_WASM_DB_IDENTIFIER;
}

export function AddToDashboardDialog({
  trigger,
  sql,
  sourceDescriptor,
  dbIdentifier,
  catalogContext,
  sqlBackend,
  defaultTitle,
  tooltip,
  visualOptions,
  defaultVisualType,
}: {
  trigger: React.ReactNode;
  sql: string;
  sourceDescriptor?: DashboardSourceDescriptor | null;
  dbIdentifier?: string | null;
  catalogContext?: string | null;
  sqlBackend?: SqlBackend;
  defaultTitle?: string;
  tooltip?: string;
  visualOptions: AddToDashboardVisualOption[];
  defaultVisualType?: AddToDashboardVisualType;
}) {
  const [open, setOpen] = useState(false);
  const [dashboards, setDashboards] = useState<DashboardLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDashboardId, setSelectedDashboardId] = useState<
    string | "new"
  >("new");
  const [newDashboardTitle, setNewDashboardTitle] = useState("My Dashboard");
  const selectDashboardId = useId();
  const newDashboardTitleId = useId();
  const visualTitleId = useId();
  const visualDescriptionId = useId();
  const resolvedDefaultType = useMemo<AddToDashboardVisualType | null>(() => {
    if (!visualOptions.length) return null;
    if (
      defaultVisualType &&
      visualOptions.some((option) => option.type === defaultVisualType)
    ) {
      return defaultVisualType;
    }
    return visualOptions[0]?.type ?? null;
  }, [defaultVisualType, visualOptions]);
  const [selectedVisualType, setSelectedVisualType] =
    useState<AddToDashboardVisualType | null>(resolvedDefaultType);

  useEffect(() => {
    setSelectedVisualType((prev) => {
      if (prev && visualOptions.some((option) => option.type === prev)) {
        return prev;
      }
      return resolvedDefaultType;
    });
  }, [visualOptions, resolvedDefaultType]);

  type VisualFormValue = { title: string; description: string };

  const initialVisualState = useMemo<
    Partial<Record<AddToDashboardVisualType, VisualFormValue>>
  >(() => {
    const state: Partial<Record<AddToDashboardVisualType, VisualFormValue>> =
      {};
    for (const option of visualOptions) {
      if (option.type === "chart") {
        state.chart = {
          title: defaultTitle?.trim().length
            ? defaultTitle
            : option.config.title || "Chart",
          description: option.config.description ?? "",
        };
      } else if (option.type === "table") {
        state.table = {
          title: option.config.title || "Table",
          description: option.config.description ?? "",
        };
      } else if (option.type === "text") {
        state.text = {
          title: option.config.title || "",
          description: "",
        };
      } else {
        state.card = {
          title: option.config.title || option.columns[0]?.name || "Card",
          description: option.config.description ?? "",
        };
      }
    }
    return state;
  }, [defaultTitle, visualOptions]);

  const [visualFormState, setVisualFormState] =
    useState<Partial<Record<AddToDashboardVisualType, VisualFormValue>>>(
      initialVisualState,
    );

  useEffect(() => {
    setVisualFormState(initialVisualState);
  }, [initialVisualState]);

  const currentVisualOption = useMemo(() => {
    if (!selectedVisualType) return undefined;
    return visualOptions.find((option) => option.type === selectedVisualType);
  }, [selectedVisualType, visualOptions]);

  const currentFormState = (selectedVisualType &&
    visualFormState[selectedVisualType]) || {
    title: "",
    description: "",
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const dashboardList = await listDashboards();
        if (!cancelled) setDashboards(dashboardList);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const canSubmit = useMemo(() => {
    if (!visualOptions.length || !selectedVisualType) {
      return false;
    }
    if (
      selectedVisualType !== "text" &&
      !currentFormState.title.trim().length
    ) {
      return false;
    }
    if (selectedDashboardId === "new")
      return newDashboardTitle.trim().length > 0;
    return (selectedDashboardId ?? "").length > 0;
  }, [
    currentFormState.title,
    newDashboardTitle,
    selectedDashboardId,
    selectedVisualType,
    visualOptions.length,
  ]);

  const handleSave = async () => {
    if (!canSubmit || !currentVisualOption || !selectedVisualType) return;
    setLoading(true);
    try {
      const resolvedSourceDescriptor =
        sourceDescriptor ??
        (sqlBackend
          ? buildDashboardSourceDescriptor({
              runtimeBackend: sqlBackend,
              dbIdentifier,
              catalogContext,
            })
          : null);

      let dashboardId = selectedDashboardId as string;
      if (selectedDashboardId === "new") {
        const data = await createDashboard(newDashboardTitle.trim(), {
          sourceDescriptor: resolvedSourceDescriptor,
          dbIdentifier: resolveStoredChartDbIdentifier(
            dbIdentifier,
            sqlBackend ?? null,
          ),
          sqlBackend: sqlBackend ?? null,
        });
        dashboardId = data.id;
      }

      let configJson: Config | CardConfig | TableConfig | TextConfig;
      if (currentVisualOption.type === "chart") {
        configJson = {
          ...currentVisualOption.config,
          title: currentFormState.title,
          description: currentFormState.description,
        };
      } else if (currentVisualOption.type === "table") {
        configJson = {
          ...currentVisualOption.config,
          configType: "table",
          title: currentFormState.title,
          description: currentFormState.description,
        };
      } else if (currentVisualOption.type === "text") {
        configJson = {
          ...currentVisualOption.config,
          configType: "text",
          title: currentFormState.title.trim()
            ? currentFormState.title.trim()
            : undefined,
        };
      } else {
        configJson = {
          ...currentVisualOption.config,
          configType: "card",
          title: currentFormState.title,
          description: currentFormState.description,
        };
      }

      await addChartToDashboard({
        dashboardId,
        title:
          currentVisualOption.type === "text"
            ? currentFormState.title.trim() || "Text Card"
            : currentFormState.title,
        description:
          currentVisualOption.type === "text"
            ? null
            : currentFormState.description,
        sql: currentVisualOption.type === "text" ? "SELECT 1" : sql,
        sourceDescriptor:
          currentVisualOption.type === "text" ? null : resolvedSourceDescriptor,
        dbIdentifier:
          currentVisualOption.type === "text"
            ? null
            : resolveStoredChartDbIdentifier(dbIdentifier, sqlBackend ?? null),
        catalogContext:
          currentVisualOption.type === "text" ? null : catalogContext,
        sqlBackend:
          currentVisualOption.type === "text" ? null : (sqlBackend ?? null),
        chartConfigJson: JSON.stringify(configJson),
      });
      setOpen(false);
    } catch {
      // no-op for now; could show a toast
    } finally {
      setLoading(false);
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
      <DialogContent className="max-w-xl bg-card">
        <DialogHeader>
          <DialogTitle>Add to Dashboard</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor={selectDashboardId} className="text-sm font-medium">
              Select dashboard
            </label>
            <select
              id={selectDashboardId}
              className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
              value={selectedDashboardId}
              onChange={(event) => setSelectedDashboardId(event.target.value)}
            >
              <option value="new">Create new dashboard…</option>
              {dashboards.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title || d.id}
                </option>
              ))}
            </select>
          </div>

          {selectedDashboardId === "new" && (
            <div className="space-y-2">
              <label
                htmlFor={newDashboardTitleId}
                className="text-sm font-medium"
              >
                New dashboard title
              </label>
              <Input
                id={newDashboardTitleId}
                value={newDashboardTitle}
                onChange={(e) => setNewDashboardTitle(e.target.value)}
                placeholder="e.g. Sales KPIs"
              />
            </div>
          )}

          <Separator />

          <Separator />

          {visualOptions.length > 1 && (
            <div className="space-y-2">
              <span className="text-sm font-medium">Visualization to add</span>
              <div className="flex flex-wrap gap-2">
                {visualOptions.map((option) => {
                  const isSelected = option.type === selectedVisualType;
                  const label =
                    option.type === "chart"
                      ? "Chart"
                      : option.type === "table"
                        ? "Table"
                        : option.type === "text"
                          ? "Text"
                          : "Card";
                  return (
                    <Button
                      key={option.type}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedVisualType(option.type)}
                      disabled={selectedVisualType === option.type}
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {selectedVisualType === "card" && (
            <p className="text-xs text-muted-foreground">
              Cards use the value from the first column of the first row when
              your query returns multiple results.
            </p>
          )}

          <div className="space-y-2">
            <label htmlFor={visualTitleId} className="text-sm font-medium">
              {selectedVisualType
                ? selectedVisualType.charAt(0).toUpperCase() +
                  selectedVisualType.slice(1)
                : "Visual"}{" "}
              title{selectedVisualType === "text" ? " (optional)" : ""}
            </label>
            <Input
              id={visualTitleId}
              value={currentFormState.title}
              onChange={(e) => {
                const value = e.target.value;
                setVisualFormState((prev) => ({
                  ...prev,
                  [selectedVisualType ?? "chart"]: {
                    title: value,
                    description:
                      prev[selectedVisualType ?? "chart"]?.description ?? "",
                  },
                }));
              }}
              placeholder="e.g. Revenue by Month"
              disabled={!selectedVisualType}
            />
          </div>

          {selectedVisualType !== "text" && (
            <div className="space-y-2">
              <label
                htmlFor={visualDescriptionId}
                className="text-sm font-medium"
              >
                {selectedVisualType
                  ? selectedVisualType.charAt(0).toUpperCase() +
                    selectedVisualType.slice(1)
                  : "Visual"}{" "}
                description (optional)
              </label>
              <Input
                id={visualDescriptionId}
                value={currentFormState.description}
                onChange={(e) => {
                  const value = e.target.value;
                  setVisualFormState((prev) => ({
                    ...prev,
                    [selectedVisualType ?? "chart"]: {
                      title: prev[selectedVisualType ?? "chart"]?.title ?? "",
                      description: value,
                    },
                  }));
                }}
                placeholder="Short description"
                disabled={!selectedVisualType}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!canSubmit || loading}
            >
              {loading ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
