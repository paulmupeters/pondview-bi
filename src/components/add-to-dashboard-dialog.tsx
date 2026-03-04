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
import type { CardConfig, Config, TableConfig, VisualType } from "@/lib/types";
import { addChartToDashboard, createDashboard, listDashboards } from "@/lib/workspace/dashboard-repo";

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
  };

type DashboardLite = { id: string; title: string | null; updatedAt: number };

export function AddToDashboardDialog({
  trigger,
  sql,
  dbIdentifier,
  defaultTitle,
  tooltip,
  visualOptions,
  defaultVisualType,
}: {
  trigger: React.ReactNode;
  sql: string;
    dbIdentifier?: string | null;
  defaultTitle?: string;
  tooltip?: string;
    visualOptions: AddToDashboardVisualOption[];
    defaultVisualType?: VisualType;
}) {
  const [open, setOpen] = useState(false);
  const [dashboards, setDashboards] = useState<DashboardLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDashboardId, setSelectedDashboardId] = useState<
    string | "new"
  >("new");
  const [newDashboardTitle, setNewDashboardTitle] = useState("My Dashboard");
  const newDashboardTitleId = useId();
  const resolvedDefaultType = useMemo<VisualType | null>(() => {
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
    useState<VisualType | null>(resolvedDefaultType);

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
    Partial<Record<VisualType, VisualFormValue>>
  >(() => {
    const state: Partial<Record<VisualType, VisualFormValue>> = {};
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
    useState<Partial<Record<VisualType, VisualFormValue>>>(initialVisualState);

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
      } catch { }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const canSubmit = useMemo(() => {
    if (!visualOptions.length || !currentFormState.title.trim().length) {
      return false;
    }
    if (selectedDashboardId === "new")
      return newDashboardTitle.trim().length > 0;
    return (selectedDashboardId ?? "").length > 0;
  }, [
    currentFormState.title,
    newDashboardTitle,
    selectedDashboardId,
    visualOptions.length,
  ]);

  const handleSave = async () => {
    if (!canSubmit || !currentVisualOption || !selectedVisualType) return;
    setLoading(true);
    try {
      let dashboardId = selectedDashboardId as string;
      if (selectedDashboardId === "new") {
        const data = await createDashboard(newDashboardTitle.trim());
        dashboardId = data.id;
      }

      let configJson: Config | CardConfig | TableConfig;
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
        title: currentFormState.title,
        description: currentFormState.description,
        sql,
        dbIdentifier: dbIdentifier ?? "md:my_db",
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
            <label htmlFor={useId()} className="text-sm font-medium">
              Select dashboard
            </label>
            <select
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
            <label htmlFor="visual-title" className="text-sm font-medium">
              {selectedVisualType
                ? selectedVisualType.charAt(0).toUpperCase() +
                selectedVisualType.slice(1)
                : "Visual"}{" "}
              title
            </label>
            <Input
              id={useId()}
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

          <div className="space-y-2">
            <label htmlFor="visual-description" className="text-sm font-medium">
              {selectedVisualType
                ? selectedVisualType.charAt(0).toUpperCase() +
                selectedVisualType.slice(1)
                : "Visual"}{" "}
              description (optional)
            </label>
            <Input
              id={useId()}
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
