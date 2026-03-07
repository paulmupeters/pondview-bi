import {
  ChatBubbleBottomCenterTextIcon,
  PlusCircleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  ChartBar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Table,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useArtifactMutation } from "@/components/artifact-mutation-context";
import { SqlResultsTable } from "@/components/sql-results-table";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { runQuery } from "@/lib/sql/run-query";
import type { CardConfig, Config, Result } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChartView } from "./sql-analysis-display/chart-view";
import { SqlControls } from "./sql-analysis-display/sql-controls";
import { StageIndicator } from "./sql-analysis-display/stage-indicator";
import type {
  ActiveView,
  SelectedForCard,
  SelectedForChart,
  SelectedForTable,
  SqlAnalysisDisplayProps,
  SqlAnalysisStage,
} from "./sql-analysis-display.types";

function normalizeChartConfigForRows(
  config: Config | null | undefined,
  rows: Result[],
): Config | null {
  if (!config || rows.length === 0) {
    return null;
  }

  const availableColumns = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      availableColumns.add(key);
    });
  });

  if (!config.xKey || !availableColumns.has(config.xKey)) {
    return null;
  }

  if (config.countMode) {
    return config;
  }

  const validYKeys = (config.yKeys ?? []).filter((key) =>
    availableColumns.has(key),
  );

  if (validYKeys.length === 0) {
    return null;
  }

  if (validYKeys.length === config.yKeys.length) {
    return config;
  }

  return {
    ...config,
    yKeys: validYKeys,
  };
}

export function SqlAnalysisDisplay({
  data,
  stage,
  progress,
  showStageIndicator = true,
  history,
  className,
  selectedDbLabel: _selectedDbLabel,
  onAddToChat,
  canAddToChat,
  artifactId,
  onConfigChange,
}: SqlAnalysisDisplayProps) {
  const { updateArtifactConfig } = useArtifactMutation();
  const [activeView, setActiveView] = useState<ActiveView>(() =>
    data?.visualType === "chart" || data?.visualType === "card"
      ? "chart"
      : "table",
  );

  const [chartConfig, setChartConfig] = useState<Config | null>(
    () => data?.chartConfig ?? null,
  );
  const [cardConfig, setCardConfig] = useState<CardConfig | null>(
    () => data?.cardConfig ?? null,
  );
  const [executedRows, setExecutedRows] = useState<Result[] | null>(null);
  const [executedColumns, setExecutedColumns] = useState<
    { name: string; type?: string }[] | null
  >(null);
  const lastQueryRef = useRef<string | null>(data?.query ?? null);
  const lastAutoSwitchQueryRef = useRef<string | null>(data?.query ?? null);
  const lastVisualTypeRef = useRef<string | undefined>(data?.visualType);
  const [query, setQuery] = useState<string | null>(null);
  const [isSqlExpanded, setIsSqlExpanded] = useState(
    data?.isSqlExpandedInitial ?? false,
  );
  const [showVisualOptions, setShowVisualOptions] = useState(false);

  const toggleSqlExpanded = () => {
    setIsSqlExpanded((prev) => !prev);
  };

  const handleExecute = async () => {
    const queryToExecute = query || data?.query || "";

    try {
      const result = await runQuery({
        sql: queryToExecute,
        dbIdentifier: data?.dbIdentifier,
      });

      setExecutedColumns(result.columns);
      // Cast to Result[] since the API returns compatible data
      setExecutedRows(result.rows as Result[]);
    } catch (error) {
      console.error("Query execution failed:", error);
      // Reset to empty state on error
      setExecutedColumns([]);
      setExecutedRows([]);
    }
  };

  const handleClear = () => {
    setQuery(null);
    setExecutedRows(null);
    setExecutedColumns(null);
    setChartConfig(null);
    setCardConfig(null);
    setShowVisualOptions(false);
    lastAutoSwitchQueryRef.current = null;
  };

  const { renderControls, renderEditor } = SqlControls({
    query: query ?? data?.query ?? "",
    onQueryChange: (newQuery) => setQuery(newQuery),
    onExecute: handleExecute,
    isExpanded: isSqlExpanded,
    onToggleExpanded: toggleSqlExpanded,
  });

  // Wrapper functions to notify parent of config changes
  const handleChartConfigChange = useCallback(
    (newConfig: Config | null) => {
      setChartConfig(newConfig);
      if (artifactId) {
        updateArtifactConfig(artifactId, {
          chartConfig: newConfig ?? undefined,
        });
      } else if (onConfigChange) {
        onConfigChange({ chartConfig: newConfig ?? undefined });
      }
    },
    [artifactId, onConfigChange, updateArtifactConfig],
  );

  const handleCardConfigChange = useCallback(
    (newConfig: CardConfig | null) => {
      setCardConfig(newConfig);
      if (artifactId) {
        updateArtifactConfig(artifactId, {
          cardConfig: newConfig ?? undefined,
        });
      } else if (onConfigChange) {
        onConfigChange({ cardConfig: newConfig ?? undefined });
      }
    },
    [artifactId, onConfigChange, updateArtifactConfig],
  );

  // Reset state when query changes (different artifact) or visualType changes during streaming
  useEffect(() => {
    const currentQuery = data?.query ?? null;
    const currentVisualType = data?.visualType;

    if (currentQuery !== lastQueryRef.current) {
      // Query changed - full reset to data's config
      setChartConfig(data?.chartConfig ?? null);
      setCardConfig(data?.cardConfig ?? null);
      setShowVisualOptions(false);
      setExecutedRows(null);
      setExecutedColumns(null);
      setQuery(null);
      setActiveView(
        currentVisualType === "chart" || currentVisualType === "card"
          ? "chart"
          : "table",
      );
      lastAutoSwitchQueryRef.current = currentQuery;
      lastQueryRef.current = currentQuery;
      lastVisualTypeRef.current = currentVisualType;
    } else if (currentVisualType !== lastVisualTypeRef.current) {
      // Same query but visualType changed (data streaming completed)
      // Update activeView to match the new visualType
      setActiveView(
        currentVisualType === "chart" || currentVisualType === "card"
          ? "chart"
          : "table",
      );
      // Also sync chartConfig/cardConfig if they weren't set yet
      if (data?.chartConfig && !chartConfig) {
        setChartConfig(data.chartConfig);
      }
      if (data?.cardConfig && !cardConfig) {
        setCardConfig(data.cardConfig);
      }
      lastVisualTypeRef.current = currentVisualType;
    }
  }, [
    data?.query,
    data?.visualType,
    data?.chartConfig,
    data?.cardConfig,
    chartConfig,
    cardConfig,
  ]);

  useEffect(() => {
    if (activeView !== "chart") {
      setShowVisualOptions(false);
    }
  }, [activeView]);

  const columnsForDialog = useMemo(
    () =>
      (executedColumns ?? data?.columns ?? []).map((c) => ({ name: c.name })),
    [executedColumns, data?.columns],
  );

  const selectedForChart = useMemo((): SelectedForChart | undefined => {
    if (executedRows !== null) {
      const resolvedConfig = normalizeChartConfigForRows(
        chartConfig ?? data?.chartConfig,
        executedRows,
      );
      return {
        stage: "complete",
        rows: executedRows,
        chartConfig: resolvedConfig ?? undefined,
        summary: data?.summary,
      };
    }

    if (data?.stage !== "complete") {
      return undefined;
    }

    const completedRows = (data.rows as Result[] | undefined) ?? [];
    const resolvedConfig = normalizeChartConfigForRows(
      data.chartConfig,
      completedRows,
    );
    return {
      stage: data.stage,
      rows: completedRows,
      chartConfig: resolvedConfig ?? undefined,
      summary: data.summary,
    };
  }, [
    executedRows,
    chartConfig,
    data?.stage,
    data?.rows,
    data?.chartConfig,
    data?.summary,
  ]);

  const selectedForTable = useMemo((): SelectedForTable | undefined => {
    if (executedRows !== null && executedColumns !== null) {
      return {
        stage: "complete",
        columns: executedColumns,
        rows: executedRows as Record<string, unknown>[],
        summary: data?.summary,
      };
    }

    return data?.stage === "complete"
      ? {
          stage: data.stage,
          columns: (data.columns ?? []) as { name: string; type?: string }[],
          rows: (data.rows as Record<string, unknown>[] | undefined) ?? [],
          summary: data.summary,
        }
      : undefined;
  }, [
    executedRows,
    executedColumns,
    data?.stage,
    data?.columns,
    data?.rows,
    data?.summary,
  ]);

  const cardSourceRows =
    executedRows ?? (data?.stage === "complete" ? (data.rows ?? null) : null);
  const cardSourceColumns =
    executedColumns ??
    (data?.stage === "complete" ? (data.columns ?? null) : null);

  const selectedForCard: SelectedForCard | undefined =
    cardSourceRows &&
    cardSourceRows.length === 1 &&
    cardSourceColumns &&
    cardSourceColumns.length === 1
      ? {
          stage: "complete",
          columnName: cardSourceColumns[0].name,
          value: cardSourceRows[0][cardSourceColumns[0].name],
        }
      : undefined;

  const effectiveStage = (stage ??
    data?.stage ??
    "loading") as SqlAnalysisStage;
  const effectiveProgress = progress ?? data?.progress ?? 0;
  const shouldShowStageIndicator =
    showStageIndicator && effectiveStage !== "complete";

  const canShowTable = Boolean(selectedForTable);
  const canShowVisualOptionsToggle =
    activeView === "chart" && columnsForDialog.length > 0 && !selectedForCard;

  useEffect(() => {
    if (activeView !== "chart" || selectedForCard || !canShowTable) {
      return;
    }

    if (!selectedForChart?.chartConfig) {
      setActiveView("table");
    }
  }, [
    activeView,
    canShowTable,
    selectedForCard,
    selectedForChart?.chartConfig,
  ]);

  const payloadForAddToChat = useMemo(() => {
    if (!data && executedRows === null && executedColumns === null) {
      return null;
    }

    const finalRows =
      (executedRows as Result[] | null) ??
      (data?.rows as Result[] | undefined) ??
      null;
    const finalColumns =
      executedColumns ??
      (data?.columns as { name: string; type?: string }[] | undefined) ??
      null;

    if (!data && !finalRows && !finalColumns) {
      return null;
    }

    const resolvedRows = finalRows ?? [];
    const resolvedColumns = finalColumns ?? [];
    const resolvedChartConfig = normalizeChartConfigForRows(
      chartConfig ?? data?.chartConfig,
      resolvedRows,
    );
    const totalRows =
      resolvedRows.length > 0
        ? resolvedRows.length
        : (data?.rowCount ?? resolvedRows.length);

    // Determine visual type based on active view and configuration/data shape
    let visualType: "table" | "chart" | "card" = "table";
    if (activeView === "chart") {
      if (cardConfig || data?.cardConfig) {
        visualType = "card";
      } else if (resolvedChartConfig) {
        visualType = "chart";
      } else if (resolvedRows.length === 1 && resolvedColumns.length === 1) {
        visualType = "card";
      } else {
        visualType = "table";
      }
    }

    return {
      stage: "complete" as const,
      progress: 1,
      query: query ?? data?.query ?? "",
      dbIdentifier: data?.dbIdentifier,
      executionTime: data?.executionTime,
      rowCount: totalRows,
      columns: resolvedColumns,
      rows: resolvedRows,
      visualType,
      chartConfig: resolvedChartConfig ?? undefined,
      cardConfig: cardConfig ?? data?.cardConfig,
      summary:
        data?.summary ??
        (typeof totalRows === "number"
          ? {
              totalRows,
              executionTimeMs:
                data?.summary?.executionTimeMs ?? data?.executionTime,
              insights: data?.summary?.insights ?? [],
              queryType: data?.summary?.queryType,
            }
          : undefined),
    };
  }, [
    data,
    executedRows,
    executedColumns,
    chartConfig,
    cardConfig,
    query,
    activeView,
  ]);

  const showAddToChatButton =
    Boolean(onAddToChat) &&
    Boolean(payloadForAddToChat) &&
    (canAddToChat ?? true);

  const handleAddToChatClick = () => {
    if (!onAddToChat || !payloadForAddToChat) {
      return;
    }
    onAddToChat(payloadForAddToChat);
  };

  if (!data && !shouldShowStageIndicator) {
    return null;
  }

  // Logic to determine if we should show the clear button.
  // We generally want to show it if we are in "interactive" mode (e.g. in the prompt input area),
  // but NOT if we are just displaying a static result (e.g. in the chat history).
  //
  // - If `data` comes from props and has stage="complete", it's likely a static chat artifact -> NO Clear button.
  // - If `data` is initial (e.g. from prompt input wrapper), we are interactive -> YES Clear button (once we have results).
  //
  // The `executedRows` state being non-null implies the user has run a query interactively in this session.
  const isInteractive = executedRows !== null || data?.stage === "initial";

  const showClearButton =
    isInteractive &&
    (executedRows !== null || (data && data.stage !== "complete"));

  return (
    <div className={cn("space-y-6 w-full", className)}>
      {shouldShowStageIndicator && (
        <div className="p-4">
          <StageIndicator
            currentStage={effectiveStage}
            progress={effectiveProgress}
          />
        </div>
      )}

      {data && (
        <div className="flex items-center justify-between gap-2 px-4 pt-4 lg:w-[300px] xl:w-[500px] w-full overflow-y-auto">
          <div className="flex gap-2">
            <Button
              variant={activeView === "table" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveView("table")}
              className="flex items-center gap-2"
              disabled={!canShowTable}
            >
              <Table className="w-4 h-4" />
              Data
            </Button>
            <Button
              variant={activeView === "chart" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveView("chart")}
              className="flex items-center gap-2"
            >
              <ChartBar className="w-4 h-4" />
              Visual
            </Button>
            {canShowVisualOptionsToggle && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex items-center gap-2 text-xs font-mono"
                onClick={() => setShowVisualOptions((prev) => !prev)}
                aria-expanded={showVisualOptions}
                aria-controls="chart-visual-options"
              >
                Visual options
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    showVisualOptions && "rotate-180",
                  )}
                />
              </Button>
            )}
            {showAddToChatButton && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                    onClick={handleAddToChatClick}
                  >
                    <PlusCircleIcon className="w-4 h-4" />
                    Add to chat
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Share this result</p>
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <ChatBubbleBottomCenterTextIcon className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Edit with AI</p>
              </TooltipContent>
            </Tooltip>
            {showClearButton && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                    onClick={handleClear}
                  >
                    <TrashIcon className="w-4 h-4" />
                    Clear
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Clear analysis</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {history && history.total > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={history.onPrev}
                disabled={history.currentIndex <= 0}
                className="flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground min-w-[60px] text-center">
                {history.currentIndex + 1} / {history.total}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={history.onNext}
                disabled={history.currentIndex >= history.total - 1}
                className="flex items-center gap-2"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {(data || (effectiveStage === "initial" && activeView === "chart")) &&
        activeView === "chart" &&
        (() => {
          const dbIdentifier = data?.dbIdentifier;
          const isSqlExpandedInitial = data?.isSqlExpandedInitial;
          return (
            <ChartView
              data={
                data ?? {
                  stage: "initial",
                  progress: 0,
                  executionTime: 0,
                  rowCount: 0,
                  columns: [],
                  rows: [],
                  dbIdentifier,
                  visualType: "chart",
                  isSqlExpandedInitial: isSqlExpandedInitial ?? false,
                }
              }
              selectedForChart={selectedForChart}
              selectedForCard={selectedForCard}
              selectedForTable={selectedForTable}
              chartConfig={chartConfig}
              cardConfig={cardConfig}
              columnsForDialog={columnsForDialog}
              onChartConfigChange={handleChartConfigChange}
              onCardConfigChange={handleCardConfigChange}
              renderSqlControls={renderControls}
              renderSqlEditor={renderEditor}
              showVisualOptions={showVisualOptions}
              onShowVisualOptionsChange={setShowVisualOptions}
            />
          );
        })()}

      {data && activeView === "table" && (
        <div className="group relative">
          {renderControls(undefined, "sql-editor-analysis-table")}
          <SqlResultsTable dataOverride={selectedForTable} />
          {renderEditor("sql-editor-analysis-table")}
        </div>
      )}

      {!data && shouldShowStageIndicator && (
        <div className="p-4 text-sm text-muted-foreground">
          Analysis in progress...
        </div>
      )}
    </div>
  );
}
