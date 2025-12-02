"use client";

import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChartConfigDialog } from "@/components/chart-config-dialog";
import { SqlChart } from "@/components/sql-chart";
import { SqlResultsTable } from "@/components/sql-results-table";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Config, Result } from "@/lib/types";
import { cn } from "@/lib/utils";

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
}

export function ManualModeResultsPanel({
  sqlResult,
  onSwitchToAiMode,
  chartConfig: externalChartConfig,
  onChartConfigChange,
}: ManualModeResultsPanelProps) {
  const [manualViewMode, setManualViewMode] = useState<"chart" | "table">(
    "table",
  );
  const [localChartConfig, setLocalChartConfig] = useState<Config | null>(null);
  const lastSqlQueryRef = useRef<string | null>(null);

  // Use external chart config if provided, otherwise use local state
  const chartConfig = externalChartConfig ?? localChartConfig;

  // Create a setter that supports both direct values and updater functions
  const setChartConfig = useCallback(
    (
      configOrUpdater:
        | Config
        | null
        | ((prev: Config | null) => Config | null),
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
      lastSqlQueryRef.current = currentSql;
    }
  }, [sqlResult]);

  const defaultChartConfig = useMemo<Config>(() => {
    const xKey = sqlResult?.columns[0]?.name ?? "";
    const fallbackYKey = sqlResult?.columns[1]?.name;
    return {
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
    <div className="flex-1 flex flex-col min-w-0 bg-card">
      <div className="flex items-center justify-between px-4 py-4 pt-8 border-b border-border">
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
            <ChartConfigDialog
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs font-mono"
                >
                  Advanced config
                </Button>
              }
              config={chartConfig ?? defaultChartConfig}
              columns={chartColumns.map((column) => ({
                name: column.name,
              }))}
              rows={chartRows}
              onConfigChange={(config) => {
                setChartConfig({ ...config });
                setManualViewMode("chart");
              }}
              tooltip="Open advanced chart settings"
            />
          )}
        </div>
      </div>
      {manualViewMode === "chart" &&
        sqlResult &&
        sqlResult.columns.length > 0 && (
          <div className="p-4 py-8 border-b border-border bg-popover grid grid-cols-2 xxl:grid-cols-4 gap-4">
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
          </div>
        )}
      <div className="flex-1 p-4 overflow-auto">
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
  );
}

