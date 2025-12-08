"use client";

import {
  ChatBubbleLeftRightIcon,
  PlusCircleIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InlineChartConfig } from "@/components/inline-chart-config";
import { MetricCard } from "@/components/metric-card";
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
import type { CardConfig, Config, Result } from "@/lib/types";
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
  cardConfig?: CardConfig | null;
  onCardConfigChange?: (config: CardConfig | null) => void;
  onAddToChatAction?: (payload: SqlAnalysisData) => void;
  selectedDbIdentifier?: string;
}

export function ManualModeResultsPanel({
  sqlResult,
  onSwitchToAiMode,
  chartConfig: externalChartConfig,
  onChartConfigChange,
  cardConfig: externalCardConfig,
  onCardConfigChange,
  onAddToChatAction,
  selectedDbIdentifier,
}: ManualModeResultsPanelProps) {
  const [manualViewMode, setManualViewMode] = useState<"chart" | "table">(
    "table",
  );
  const [localChartConfig, setLocalChartConfig] = useState<Config | null>(null);
  const [localCardConfig, setLocalCardConfig] = useState<CardConfig | null>(
    null,
  );
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  const [hasShared, setHasShared] = useState(false);
  const lastSqlQueryRef = useRef<string | null>(null);

  // Use external configs if provided, otherwise use local state
  const chartConfig = externalChartConfig ?? localChartConfig;
  const cardConfig = externalCardConfig ?? localCardConfig;

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

  const setCardConfig = useCallback(
    (config: CardConfig | null) => {
      if (onCardConfigChange) {
        onCardConfigChange(config);
      } else {
        setLocalCardConfig(config);
      }
    },
    [onCardConfigChange],
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

  // Detect card mode: single row and single column
  const isCardMode = useMemo(() => {
    return (
      sqlResult !== null &&
      sqlResult.rows.length === 1 &&
      sqlResult.columns.length === 1
    );
  }, [sqlResult]);

  const handleShareResult = () => {
    if (!onAddToChatAction || !sqlResult) {
      return;
    }

    // Determine visual type
    let visualType: "table" | "chart" | "card" = "table";
    if (manualViewMode === "chart") {
      if (isCardMode && cardConfig) {
        visualType = "card";
      } else if (chartConfig) {
        visualType = "chart";
      } else if (isCardMode) {
        visualType = "card";
      } else {
        visualType = "chart";
      }
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
      visualType,
      chartConfig: chartConfig ?? undefined,
      cardConfig: cardConfig ?? undefined,
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

  const chartColumns = sqlResult?.columns ?? [];
  const chartRows = (sqlResult?.rows as Result[]) ?? [];

  // Card value when in card mode
  const cardValue = useMemo(() => {
    if (!isCardMode || !sqlResult) return null;
    const columnName = sqlResult.columns[0]?.name;
    if (!columnName) return null;
    return sqlResult.rows[0]?.[columnName];
  }, [isCardMode, sqlResult]);

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
              "rounded-none border-b-2 border-transparent px-3 py-2 text-sm font-mono bg-transparent data-[state=on]:text-primary data-[state=on]:bg-transparent",
              manualViewMode === "chart"
                ? "border-primary font-bold"
                : "text-muted-foreground hover:text-foreground font-medium ",
            )}
          >
            Chart
          </ToggleGroupItem>
          <ToggleGroupItem
            value="table"
            disabled={false}
            className={cn(
              "rounded-none border-b-2 border-transparent px-3 py-2 text-sm font-medium bg-transparent data-[state=on]:text-primary data-[state=on]:bg-transparent",
              manualViewMode === "table"
                ? "border-primary font-bold"
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
          <InlineChartConfig
            chartConfig={chartConfig}
            defaultChartConfig={defaultChartConfig}
            onChartConfigChange={setChartConfig}
            columns={chartColumns}
            rows={chartRows}
            cardConfig={isCardMode ? cardConfig : undefined}
            onCardConfigChange={isCardMode ? setCardConfig : undefined}
            isCardMode={isCardMode}
            showAdvancedConfig={showAdvancedConfig}
            onToggleAdvancedConfig={() =>
              setShowAdvancedConfig(!showAdvancedConfig)
            }
          />
          )}
        <div className="p-4">
          {sqlResult ? (
            manualViewMode === "chart" ? (
              isCardMode && cardValue !== null ? (
                <MetricCard
                  value={cardValue as string | number | boolean | Date}
                  title={
                    cardConfig?.title ?? sqlResult.columns[0]?.name ?? "Value"
                  }
                  description={cardConfig?.description}
                  takeaway={cardConfig?.takeaway}
                  className="mx-auto w-fit border-0 shadow-none"
                />
              ) : (
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
                )
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
