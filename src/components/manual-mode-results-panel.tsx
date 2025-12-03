"use client";

import {
  ChatBubbleLeftRightIcon,
  PlusCircleIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import { SqlChart } from "@/components/sql-chart";
import { SqlResultsTable } from "@/components/sql-results-table";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Config, Result } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Separator } from "./ui/separator";

interface ManualModeResultsPanelProps {
  sqlResult: {
    sql: string;
    rows: Record<string, unknown>[];
    columns: { name: string; type?: string }[];
    durationMs: number;
  } | null;
  onSwitchToAiMode?: () => void;
  chartConfig?: Config | null;
  onChartConfigChange?: (config: Config | null) => void;
  onAddToChatAction?: (payload: SqlAnalysisData) => void;
  selectedDbIdentifier?: string;
}

export function ManualModeResultsPanel({
  sqlResult,
  onSwitchToAiMode,
  chartConfig: externalChartConfig,
  onChartConfigChange,
  onAddToChatAction,
  selectedDbIdentifier,
}: ManualModeResultsPanelProps) {
  const [manualViewMode, setManualViewMode] = useState<"chart" | "table">(
    "table",
  );
  const [localChartConfig, setLocalChartConfig] = useState<Config | null>(null);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  const [hasShared, setHasShared] = useState(false);
  const lastSqlQueryRef = useRef<string | null>(null);

  // Use external chart config if provided, otherwise use local state
  const chartConfig = externalChartConfig ?? localChartConfig;

  // Create a setter that supports both direct values and updater functions
  const setChartConfig = useCallback(
    (
      configOrUpdater: Config | null | ((prev: Config | null) => Config | null),
    ) => {
      if (typeof configOrUpdater === "function") {
        // Handle updater function pattern
        const currentConfig = externalChartConfig ?? localChartConfig;
        const newConfig = configOrUpdater(currentConfig);
        if (onChartConfigChange) {
          onChartConfigChange(newConfig);
        } else {
          setLocalChartConfig(newConfig);
        }
      } else {
        // Handle direct value pattern
        if (onChartConfigChange) {
          onChartConfigChange(configOrUpdater);
        } else {
          setLocalChartConfig(configOrUpdater);
        }
      }
    },
    [externalChartConfig, localChartConfig, onChartConfigChange],
  );

  // Reset view mode when SQL query changes (chart config reset is handled by parent)
  useEffect(() => {
    const currentSql = sqlResult?.sql ?? null;
    const sqlChanged = currentSql !== lastSqlQueryRef.current;
    if (sqlChanged) {
      setManualViewMode(sqlResult ? "table" : "chart");
      setHasShared(false);
      lastSqlQueryRef.current = currentSql;
    }
  }, [sqlResult]);

  const handleShareResult = () => {
    if (!onAddToChatAction || !sqlResult) {
      return;
    }
    const payload: SqlAnalysisData = {
      stage: "complete",
      progress: 1,
      query: sqlResult.sql,
      dbIdentifier: selectedDbIdentifier,
      executionTime: sqlResult.durationMs,
      rowCount: sqlResult.rows.length,
      columns: sqlResult.columns,
      rows: sqlResult.rows as Result[],
      visualType: chartConfig ? "chart" : "table",
      chartConfig: chartConfig ?? undefined,
      summary: {
        totalRows: sqlResult.rows.length,
        executionTimeMs: sqlResult.durationMs,
        insights: [],
      },
    };

    onAddToChatAction(payload);
    setHasShared(true);
  };

  const canShare = Boolean(onAddToChatAction && sqlResult && !hasShared);

  const defaultChartConfig = useMemo<Config>(() => {
    const xKey = sqlResult?.columns[0]?.name ?? "";
    const fallbackYKey = sqlResult?.columns[1]?.name;
    return {
      visualType: "chart",
      description: "",
      title: "Manual chart",
      type: "line",
      xKey,
      yKeys: fallbackYKey ? [fallbackYKey] : [],
      legend: false,
      multipleLines: false,
      countMode: false,
      showGrid: true,
      showXAxis: true,
      showYAxis: true,
      showDots: true,
      showTooltip: true,
      lineSize: 2,
      labelYAngle: -90,
    };
  }, [sqlResult?.columns]);

  const updateChartConfig = (updater: (config: Config) => Config) => {
    setChartConfig((prev) => {
      const base = prev ?? defaultChartConfig;
      return updater({ ...base });
    });
  };

  const effectiveChartConfig = chartConfig ?? defaultChartConfig;

  const handleColorChange = (color?: string) => {
    updateChartConfig((config) => {
      if (!config.yKeys.length) {
        return { ...config };
      }
      if (!color) {
        return { ...config, colors: undefined };
      }
      return {
        ...config,
        colors: {
          ...(config.colors ?? {}),
          [config.yKeys[0]]: color,
        },
      };
    });
  };

  const chartColumns = sqlResult?.columns ?? [];
  const chartRows = (sqlResult?.rows as Result[]) ?? [];
  const primaryYKey = effectiveChartConfig.yKeys[0];
  const selectedColor =
    primaryYKey && effectiveChartConfig.colors
      ? effectiveChartConfig.colors[primaryYKey]
      : undefined;

  const chartColorOptions = useMemo(
    () => Array.from({ length: 5 }, (_, idx) => `var(--chart-${idx + 1})`),
    [],
  );

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto max-h-screen">
      <div className="flex items-center justify-between px-4 py-4 pt-8 border-b border-border flex-shrink-0">
        <ToggleGroup
          type="single"
          value={manualViewMode}
          onValueChange={(value) => {
            if (value) {
              setManualViewMode(value as "chart" | "table");
            }
          }}
          className="gap-2"
        >
          <ToggleGroupItem
            value="chart"
            disabled={false}
            className={cn(
              "rounded-none border-b-2 border-transparent px-3 py-2 text-sm font-mono bg-transparent data-[state=on]:bg-transparent data-[state=on]:hover:bg-transparent",
              manualViewMode === "chart"
                ? "border-primary text-foreground font-bold"
                : "text-muted-foreground hover:text-foreground font-medium ",
            )}
          >
            Chart
          </ToggleGroupItem>
          <ToggleGroupItem
            value="table"
            disabled={false}
            className={cn(
              "rounded-none border-b-2 border-transparent px-3 py-2 text-sm font-medium bg-transparent data-[state=on]:bg-transparent data-[state=on]:hover:bg-transparent",
              manualViewMode === "table"
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Table
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="flex items-center gap-2">
          {canShare && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs font-mono"
                  onClick={handleShareResult}
                >
                  <PlusCircleIcon className="h-4 w-4 mr-2" />
                  Add to chat
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Share this result</p>
              </TooltipContent>
            </Tooltip>
          )}
          {onSwitchToAiMode && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs font-mono"
              onClick={onSwitchToAiMode}
            >
              <ChatBubbleLeftRightIcon className="h-4 w-4 mr-2" />
              Chat
            </Button>
          )}
          {sqlResult && sqlResult.columns.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs font-mono"
              onClick={() => setShowAdvancedConfig(!showAdvancedConfig)}
            >
              Advanced config
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {manualViewMode === "chart" &&
          sqlResult &&
          sqlResult.columns.length > 0 && (
          <div className="border-b border-border bg-popover">
            <div className="p-4 py-8 grid grid-cols-2 xxl:grid-cols-4 gap-4">
              <div>
                <label
                  htmlFor="visualization"
                  className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                >
                  Visualization
                </label>
                <select
                  id="visualization"
                  className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                  value={effectiveChartConfig.type}
                  onChange={(e) =>
                    updateChartConfig((config) => ({
                      ...config,
                      type: e.target.value as Config["type"],
                    }))
                  }
                >
                  <option value="line">Line Chart</option>
                  <option value="bar">Bar Chart</option>
                  <option value="area">Area Chart</option>
                  <option value="pie">Pie Chart</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="color"
                  className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                >
                  Color
                </label>
                <div className="flex gap-2 items-center h-[26px]">
                  <button
                    type="button"
                    aria-label="Use default color"
                    className={cn(
                      "w-4 h-4 rounded-full bg-background border border-input cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      !selectedColor && "ring-2 ring-ring ring-offset-2",
                    )}
                    onClick={() => handleColorChange(undefined)}
                  />
                  {chartColorOptions.map((color, index) => {
                    const isSelected = selectedColor === color;
                    return (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Use chart color ${index + 1}`}
                        title={`Chart color ${index + 1}`}
                        className="w-4 h-4 rounded-full border border-border cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring"
                        style={{
                          backgroundColor: color,
                          boxShadow: isSelected
                            ? `0 0 0 2px var(--background), 0 0 0 4px ${color}`
                            : undefined,
                        }}
                        onClick={() => handleColorChange(color)}
                      />
                    );
                  })}
                </div>
              </div>
              <div>
                <label
                  htmlFor="x-axis"
                  className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                >
                  X-Axis
                </label>
                <select
                  className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                  value={effectiveChartConfig.xKey}
                  disabled={!chartColumns.length}
                  onChange={(e) =>
                    updateChartConfig((config) => ({
                      ...config,
                      xKey: e.target.value,
                    }))
                  }
                >
                  {chartColumns.map((col) => (
                    <option key={col.name} value={col.name}>
                      {col.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="y-axis"
                  className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                >
                  Y-Axis
                </label>
                <select
                  className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                  value={effectiveChartConfig.yKeys[0] ?? ""}
                  disabled={!chartColumns.length}
                  onChange={(e) =>
                    updateChartConfig((config) => ({
                      ...config,
                      yKeys: e.target.value ? [e.target.value] : [],
                    }))
                  }
                >
                  <option value="">Select column</option>
                  {chartColumns.map((col) => (
                    <option key={col.name} value={col.name}>
                      {col.name}
                    </option>
                  ))}
                </select>
              </div>
              <Separator className="col-span-2 xxl:col-span-4" />
              <div className="col-span-2 xxl:col-span-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <div className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase">
                    Legend
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateChartConfig((config) => ({
                          ...config,
                          legend: true,
                        }))
                      }
                      className={cn(
                        "px-2 py-1 text-xs border rounded",
                        effectiveChartConfig.legend
                          ? "bg-card-foreground/10 border-card-foreground/20"
                          : "bg-transparent border-input hover:bg-card-foreground/5",
                      )}
                    >
                      Show
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateChartConfig((config) => ({
                          ...config,
                          legend: false,
                        }))
                      }
                      className={cn(
                        "px-2 py-1 text-xs border rounded",
                        !effectiveChartConfig.legend
                          ? "bg-card-foreground/10 border-card-foreground/20"
                          : "bg-transparent border-input hover:bg-card-foreground/5",
                      )}
                    >
                      Hide
                    </button>
                  </div>
                </div>
                <div>
                  <div className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase">
                    Grid
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateChartConfig((config) => ({
                          ...config,
                          showGrid: true,
                        }))
                      }
                      className={cn(
                        "px-2 py-1 text-xs border rounded",
                        effectiveChartConfig.showGrid !== false
                          ? "bg-card-foreground/10 border-card-foreground/20"
                          : "bg-transparent border-input hover:bg-card-foreground/5",
                      )}
                    >
                      Show
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateChartConfig((config) => ({
                          ...config,
                          showGrid: false,
                        }))
                      }
                      className={cn(
                        "px-2 py-1 text-xs border rounded",
                        effectiveChartConfig.showGrid === false
                          ? "bg-card-foreground/10 border-card-foreground/20"
                          : "bg-transparent border-input hover:bg-card-foreground/5",
                      )}
                    >
                      Hide
                    </button>
                  </div>
                </div>
                <div>
                  <div className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase">
                    Dots
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateChartConfig((config) => ({
                          ...config,
                          showDots: true,
                        }))
                      }
                      className={cn(
                        "px-2 py-1 text-xs border rounded",
                        effectiveChartConfig.showDots !== false
                          ? "bg-card-foreground/10 border-card-foreground/20"
                          : "bg-transparent border-input hover:bg-card-foreground/5",
                      )}
                    >
                      Show
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateChartConfig((config) => ({
                          ...config,
                          showDots: false,
                        }))
                      }
                      className={cn(
                        "px-2 py-1 text-xs border rounded",
                        effectiveChartConfig.showDots === false
                          ? "bg-card-foreground/10 border-card-foreground/20"
                          : "bg-transparent border-input hover:bg-card-foreground/5",
                      )}
                    >
                      Hide
                    </button>
                  </div>
                </div>
                <div>
                  <div className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase">
                    Tooltip
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateChartConfig((config) => ({
                          ...config,
                          showTooltip: true,
                        }))
                      }
                      className={cn(
                        "px-2 py-1 text-xs border rounded",
                        effectiveChartConfig.showTooltip !== false
                          ? "bg-card-foreground/10 border-card-foreground/20"
                          : "bg-transparent border-input hover:bg-card-foreground/5",
                      )}
                    >
                      Show
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateChartConfig((config) => ({
                          ...config,
                          showTooltip: false,
                        }))
                      }
                      className={cn(
                        "px-2 py-1 text-xs border rounded",
                        effectiveChartConfig.showTooltip === false
                          ? "bg-card-foreground/10 border-card-foreground/20"
                          : "bg-transparent border-input hover:bg-card-foreground/5",
                      )}
                    >
                      Hide
                    </button>
                  </div>
                </div>
              </div>
              {showAdvancedConfig && (
                <>
                  <Separator className="col-span-2 xxl:col-span-4" />
                  <div className="col-span-2 xxl:col-span-4 grid grid-cols-2 xxl:grid-cols-4 gap-4">
                    <div>
                      <label
                        htmlFor="title"
                        className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                      >
                        Title
                      </label>
                      <input
                        type="text"
                        id="title"
                        className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                        value={effectiveChartConfig.title}
                        onChange={(e) =>
                          updateChartConfig((config) => ({
                            ...config,
                            title: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="description"
                        className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                      >
                        Description
                      </label>
                      <input
                        type="text"
                        id="description"
                        className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                        value={effectiveChartConfig.description || ""}
                        onChange={(e) =>
                          updateChartConfig((config) => ({
                            ...config,
                            description: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="takeaway"
                        className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                      >
                        Takeaway
                      </label>
                      <input
                        type="text"
                        id="takeaway"
                        className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                        value={effectiveChartConfig.takeaway || ""}
                        onChange={(e) =>
                          updateChartConfig((config) => ({
                            ...config,
                            takeaway: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <Separator className="col-span-2 xxl:col-span-4" />
                  <div className="col-span-2 xxl:col-span-4 grid grid-cols-2 xxl:grid-cols-4 gap-4">
                    <div>
                      <label
                        htmlFor="lineSize"
                        className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                      >
                        Line Size
                      </label>
                      <input
                        type="number"
                        id="lineSize"
                        min="1"
                        max="10"
                        className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                        value={effectiveChartConfig.lineSize ?? 2}
                        onChange={(e) =>
                          updateChartConfig((config) => ({
                            ...config,
                            lineSize: Number(e.target.value) || 2,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <div className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase">
                        X Axis
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateChartConfig((config) => ({
                              ...config,
                              showXAxis: true,
                            }))
                          }
                          className={cn(
                            "px-2 py-1 text-xs border rounded",
                            effectiveChartConfig.showXAxis !== false
                              ? "bg-card-foreground/10 border-card-foreground/20"
                              : "bg-transparent border-input hover:bg-card-foreground/5",
                          )}
                        >
                          Show
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateChartConfig((config) => ({
                              ...config,
                              showXAxis: false,
                            }))
                          }
                          className={cn(
                            "px-2 py-1 text-xs border rounded",
                            effectiveChartConfig.showXAxis === false
                              ? "bg-card-foreground/10 border-card-foreground/20"
                              : "bg-transparent border-input hover:bg-card-foreground/5",
                          )}
                        >
                          Hide
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase">
                        Y Axis
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateChartConfig((config) => ({
                              ...config,
                              showYAxis: true,
                            }))
                          }
                          className={cn(
                            "px-2 py-1 text-xs border rounded",
                            effectiveChartConfig.showYAxis !== false
                              ? "bg-card-foreground/10 border-card-foreground/20"
                              : "bg-transparent border-input hover:bg-card-foreground/5",
                          )}
                        >
                          Show
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateChartConfig((config) => ({
                              ...config,
                              showYAxis: false,
                            }))
                          }
                          className={cn(
                            "px-2 py-1 text-xs border rounded",
                            effectiveChartConfig.showYAxis === false
                              ? "bg-card-foreground/10 border-card-foreground/20"
                              : "bg-transparent border-input hover:bg-card-foreground/5",
                          )}
                          >
                            Hide
                          </button>
                        </div>
                      </div>
                      <div>
                        <label
                          htmlFor="labelYAngle"
                          className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                        >
                          Y Label Angle
                        </label>
                        <input
                          type="number"
                          id="labelYAngle"
                          min="-90"
                          max="90"
                          className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                          value={effectiveChartConfig.labelYAngle ?? -90}
                          onChange={(e) =>
                            updateChartConfig((config) => ({
                              ...config,
                              labelYAngle: Number(e.target.value) || -90,
                            }))
                          }
                        />
                      </div>
                    </div>
                    <Separator className="col-span-2 xxl:col-span-4" />
                    <div className="col-span-2 xxl:col-span-4 grid grid-cols-2 xxl:grid-cols-4 gap-4">
                      <div>
                        <label
                          htmlFor="suffixLabelY"
                          className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                        >
                          Y Suffix
                        </label>
                        <input
                          type="text"
                          id="suffixLabelY"
                          className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                          value={effectiveChartConfig.suffixLabelY || ""}
                          onChange={(e) =>
                            updateChartConfig((config) => ({
                              ...config,
                              suffixLabelY: e.target.value.trim() || undefined,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="referenceLineLabel"
                          className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                        >
                          Reference Line
                        </label>
                        <input
                          type="text"
                          id="referenceLineLabel"
                          className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                          value={effectiveChartConfig.referenceLineLabel || ""}
                          onChange={(e) =>
                            updateChartConfig((config) => ({
                              ...config,
                              referenceLineLabel:
                                e.target.value.trim() || undefined,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        <div className="p-4">
          {sqlResult ? (
            manualViewMode === "chart" ? (
              <SqlChart
                customChartConfig={chartConfig ?? defaultChartConfig}
                dataOverride={{
                  stage: "complete",
                  rows: chartRows,
                  summary: {
                    totalRows: sqlResult.rows.length,
                    executionTimeMs: sqlResult.durationMs,
                    insights: [],
                  },
                }}
              />
            ) : (
              <SqlResultsTable
                className="w-full h-full"
                dataOverride={{
                  stage: "complete",
                  columns: sqlResult.columns,
                  rows: sqlResult.rows,
                  summary: {
                    totalRows: sqlResult.rows.length,
                    executionTimeMs: sqlResult.durationMs,
                    insights: [],
                  },
                }}
              />
            )
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Run a SQL query to see results here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
