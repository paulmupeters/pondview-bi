"use client";

import { MinusCircleIcon, PlusCircleIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import { SqlChart } from "@/components/sql-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ArtifactData } from "@/hooks/types";
import { type UseArtifactsOptions, useArtifacts } from "@/hooks/use-artifacts";
import type { CardConfig, Config, Result, TableConfig } from "@/lib/types";
import type { ChartConfig } from "./ui/chart";

type DashboardBuilderPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
};

type VisualSnapshot = {
  id: string;
  createdAt: number;
  artifact: ArtifactData<SqlAnalysisData>;
  payload: SqlAnalysisData;
  rows: Result[];
  type: "chart" | "card" | "table";
};

function normalizeVisualArtifact(
  artifact: ArtifactData<SqlAnalysisData>,
): VisualSnapshot | null {
  const payload = artifact.payload;

  if (!payload) return null;
  if ((payload.stage ?? "") !== "complete") return null;

  const visualType = payload.visualType;

  // Handle chart artifacts
  if (visualType === "chart") {
    if (!payload.chartConfig) return null;

    const rows = Array.isArray(payload.rows)
      ? (payload.rows as Result[]).map((row) => ({ ...row }))
      : [];

    return {
      id: artifact.id,
      createdAt: artifact.createdAt,
      artifact,
      payload: {
        ...payload,
        columns: (payload.columns ?? []).map(
          (column: { name: string; type?: string }) => ({ ...column }),
        ),
        rows,
      },
      rows,
      type: "chart",
    };
  }

  // Handle card artifacts
  if (visualType === "card") {
    if (!payload.cardConfig) return null;

    const rows = Array.isArray(payload.rows)
      ? (payload.rows as Result[]).map((row) => ({ ...row }))
      : [];

    return {
      id: artifact.id,
      createdAt: artifact.createdAt,
      artifact,
      payload: {
        ...payload,
        columns: (payload.columns ?? []).map(
          (column: { name: string; type?: string }) => ({ ...column }),
        ),
        rows,
      },
      rows,
      type: "card",
    };
  }

  // Handle table artifacts - generate default tableConfig if missing
  if (visualType === "table") {
    const rows = Array.isArray(payload.rows)
      ? (payload.rows as Result[]).map((row) => ({ ...row }))
      : [];

    // Generate a minimal default tableConfig for tables
    const defaultTableConfig = payload.tableConfig ?? {
      configType: "table" as const,
      title: payload.query
        ? `Table: ${payload.query.substring(0, 50)}${payload.query.length > 50 ? "..." : ""}`
        : "Data Table",
      description: payload.summary?.insights?.[0] ?? "",
    };

    return {
      id: artifact.id,
      createdAt: artifact.createdAt,
      artifact,
      payload: {
        ...payload,
        columns: (payload.columns ?? []).map(
          (column: { name: string; type?: string }) => ({ ...column }),
        ),
        rows,
        tableConfig: defaultTableConfig,
      },
      rows,
      type: "table",
    };
  }

  return null;
}

export function DashboardBuilderPanel({
  open,
  onOpenChange,
  storeId,
}: DashboardBuilderPanelProps) {
  const router = useRouter();
  const [dashboardTitle, setDashboardTitle] = useState("New dashboard");
  const [selectedChartIds, setSelectedChartIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasInitializedSelectionRef = useRef(false);

  const includeExecuteSql = useMemo(() => ["execute-sql"], []);

  const { artifacts } = useArtifacts({
    include: includeExecuteSql,
    storeId,
  } as UseArtifactsOptions & { storeId?: string });

  const visualSnapshots = useMemo<VisualSnapshot[]>(() => {
    return artifacts
      .map((artifact) => {
        const typedArtifact = artifact as ArtifactData<SqlAnalysisData>;
        return normalizeVisualArtifact(typedArtifact);
      })
      .filter((snapshot): snapshot is VisualSnapshot => snapshot !== null)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [artifacts]);

  useEffect(() => {
    if (!open) return;

    const availableIds = visualSnapshots.map((snapshot) => snapshot.id);

    setSelectedChartIds((prev) => {
      if (!hasInitializedSelectionRef.current) {
        hasInitializedSelectionRef.current = true;

        const isAlreadyAligned =
          prev.length === availableIds.length &&
          availableIds.every((id, index) => id === prev[index]);

        if (isAlreadyAligned) {
          return prev;
        }

        return availableIds;
      }

      const filtered = prev.filter((id) => availableIds.includes(id));

      if (filtered.length !== prev.length) {
        return filtered;
      }

      return prev;
    });
  }, [visualSnapshots, open]);

  useEffect(() => {
    if (!open) {
      setDashboardTitle("New dashboard");
      setIsSaving(false);
      setError(null);
      setSelectedChartIds([]);
      hasInitializedSelectionRef.current = false;
    }
  }, [open]);

  const selectedCharts = useMemo(
    () =>
      visualSnapshots.filter((snapshot) =>
        selectedChartIds.includes(snapshot.id),
      ),
    [visualSnapshots, selectedChartIds],
  );

  const removedCharts = useMemo(
    () =>
      visualSnapshots.filter(
        (snapshot) => !selectedChartIds.includes(snapshot.id),
      ),
    [visualSnapshots, selectedChartIds],
  );

  const handleRemoveChart = (id: string) => {
    setSelectedChartIds((prev) => prev.filter((chartId) => chartId !== id));
  };

  const handleRestoreChart = (id: string) => {
    setSelectedChartIds((prev) => {
      if (prev.includes(id)) return prev;
      return [...prev, id];
    });
  };

  const handleCreateDashboard = async () => {
    if (!selectedCharts.length || isSaving) return;

    const trimmedTitle = dashboardTitle.trim() || "New dashboard";
    setIsSaving(true);
    setError(null);

    try {
      const createDashboardResponse = await fetch("/api/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedTitle }),
      });

      if (!createDashboardResponse.ok) {
        const text = await createDashboardResponse.text();
        throw new Error(text || "Failed to create dashboard");
      }

      const { id: dashboardId } = (await createDashboardResponse.json()) as {
        id: string;
      };

      for (const snapshot of selectedCharts) {
        const { payload, type } = snapshot;

        // Determine the config based on visual type
        let config: CardConfig | TableConfig | Config | undefined;
        let title: string | undefined;

        if (type === "card") {
          config = payload.cardConfig;
          title = config?.title ?? "Untitled card";
        } else if (type === "table") {
          config = payload.tableConfig;
          title = config?.title ?? "Untitled table";
        } else {
          config = payload.chartConfig;
          title = config?.title ?? "Untitled chart";
        }

        const description = config?.description ?? null;

        const response = await fetch(`/api/dashboard/${dashboardId}/charts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description,
            sql: payload.query ?? "",
            dbIdentifier: payload.dbIdentifier ?? "md:my_db",
            chartConfigJson: JSON.stringify(config ?? {}),
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Failed to add ${type} to dashboard`);
        }
      }

      onOpenChange(false);
      router.push(`/dashboards/${dashboardId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className={`fixed inset-y-0 right-0 z-50 w-1/2 bg-background border-l shadow-lg transform transition-transform duration-300 ease-in-out ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="h-full flex flex-col gap-4 p-6 bg-sidebar">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Generate dashboard</h2>
            <p className="text-sm text-muted-foreground">
              Select the visuals you'd like to include and give the dashboard a
              title.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            <XIcon className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium" htmlFor="dashboard-title">
            Dashboard title
          </label>
          <Input
            id="dashboard-title"
            value={dashboardTitle}
            onChange={(event) => setDashboardTitle(event.target.value)}
            placeholder="e.g. Weekly revenue overview"
          />
        </div>

        <div className="flex-1 flex flex-col gap-3 min-h-0">
          <div>
            <p className="text-sm font-medium">Selected visuals</p>
            <p className="text-xs text-muted-foreground">
              {selectedCharts.length} of {visualSnapshots.length} available
              visuals
            </p>
          </div>

          <ScrollArea className="flex-1 rounded-md border">
            <div className="p-3 space-y-4">
              {selectedCharts.length === 0 ? (
                <div className="text-sm text-muted-foreground py-12 text-center">
                  {visualSnapshots.length === 0
                    ? "No visuals available yet. Generate a chart or card in the conversation to get started."
                    : "No visuals selected. Restore a visual below to add it."}
                </div>
              ) : (
                selectedCharts.map((snapshot) => (
                  <div
                    key={snapshot.id}
                    className="rounded-md border bg-card shadow-sm overflow-hidden"
                  >
                    <div className="flex items-center justify-between border-b px-3 py-2">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">
                          {snapshot.type === "card"
                            ? snapshot.payload.cardConfig?.title ||
                            "Untitled card"
                            : snapshot.type === "table"
                              ? snapshot.payload.tableConfig?.title ||
                              "Untitled table"
                              : snapshot.payload.chartConfig?.title ||
                              "Untitled visual"}
                        </span>
                        {snapshot.payload.query && (
                          <span className="text-xs text-muted-foreground truncate max-w-[280px]">
                            {snapshot.payload.query}
                          </span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRemoveChart(snapshot.id)}
                      >
                        <MinusCircleIcon className="h-4 w-4" />
                        <span className="sr-only">Remove {snapshot.type}</span>
                      </Button>
                    </div>
                    {snapshot.type === "card" ? (
                      <div className="p-4 flex justify-center">
                        <Card className="w-fit border-0 shadow-none">
                          <CardHeader>
                            <CardTitle className="text-base font-medium text-muted-foreground">
                              {snapshot.payload.cardConfig?.title ||
                                (snapshot.payload.columns?.[0]?.name ??
                                  "Value")}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-4xl font-bold text-foreground">
                              {(() => {
                                const value =
                                  snapshot.rows[0]?.[
                                  snapshot.payload.columns?.[0]?.name ?? ""
                                  ];
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
                              })()}
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
                    ) : (
                      <SqlChart
                        customChartConfig={snapshot.payload.chartConfig}
                        dataOverride={{
                          ...snapshot.payload,
                          rows: snapshot.rows,
                          stage: "complete",
                        }}
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {removedCharts.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Removed visuals</p>
              <div className="flex flex-wrap gap-2">
                {removedCharts.map((snapshot) => (
                  <Button
                    key={snapshot.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1"
                    onClick={() => handleRestoreChart(snapshot.id)}
                  >
                    <PlusCircleIcon className="h-4 w-4" />
                    {snapshot.type === "card"
                      ? snapshot.payload.cardConfig?.title || "Untitled card"
                      : snapshot.type === "table"
                        ? snapshot.payload.tableConfig?.title ||
                        "Untitled table"
                        : snapshot.payload.chartConfig?.title ||
                        "Untitled visual"}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleCreateDashboard}
            disabled={isSaving || selectedCharts.length === 0}
          >
            {isSaving ? "Creating…" : "Create dashboard"}
          </Button>
        </div>
      </div>
    </div>
  );
}
