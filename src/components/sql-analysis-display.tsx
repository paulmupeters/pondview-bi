"use client";

import {
  ChatBubbleBottomCenterTextIcon,
  PlusCircleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { ChartBar, ChevronLeft, ChevronRight, Table } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { runSqlAndGetRowObjectsJson } from "@/actions/queries";
import { SqlResultsTable } from "@/components/sql-results-table";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CardConfig, Config, Result } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChartView } from "./sql-analysis-display/chart-view";
import { SqlControls } from "./sql-analysis-display/sql-controls";
import { SqlEditor } from "./sql-analysis-display/sql-editor";
import { StageIndicator } from "./sql-analysis-display/stage-indicator";
import type {
  ActiveView,
  SelectedForCard,
  SelectedForChart,
  SelectedForTable,
  SqlAnalysisDisplayProps,
  SqlAnalysisStage,
} from "./sql-analysis-display.types";

export function SqlAnalysisDisplay({
  data,
  stage,
  progress,
  showStageIndicator = true,
  history,
  className,
  selectedDbLabel,
  onAddToChat,
  canAddToChat,
}: SqlAnalysisDisplayProps) {
  const [activeView, setActiveView] = useState<ActiveView>(() =>
    data?.visualType === "chart" || data?.visualType === "card"
      ? "chart"
      : "table",
  );
  const [chartConfig, setChartConfig] = useState<Config | null>(null);
  const [cardConfig, setCardConfig] = useState<CardConfig | null>(null);
  const [executedRows, setExecutedRows] = useState<Result[] | null>(null);
  const [executedColumns, setExecutedColumns] = useState<
    { name: string; type?: string }[] | null
  >(null);
  const lastQueryRef = useRef<string | null>(null);
  const lastAutoSwitchQueryRef = useRef<string | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [isSqlExpanded, setIsSqlExpanded] = useState(
    data?.isSqlExpandedInitial ?? false,
  );

  const toggleSqlExpanded = () => {
    setIsSqlExpanded((prev) => !prev);
  };

  const handleExecute = () => {
    const queryToExecute = query || data?.query || "";
    const dbIdentifier = data?.dbIdentifier || "md:my_db";

    runSqlAndGetRowObjectsJson(dbIdentifier, queryToExecute).then((rows) => {
      console.log("Rows:", rows);

      if (rows.length > 0) {
        const columns = Object.keys(rows[0]).map((key) => ({
          name: key,
        }));
        setExecutedColumns(columns);
        setExecutedRows(rows);
      } else {
        setExecutedColumns([]);
        setExecutedRows([]);
      }
    });
  };

  const handleSqlEditorSuccess = (
    query: string,
    results: Result[],
    columns: { name: string; type?: string }[],
  ) => {
    setQuery(query);
    setExecutedRows(results);
    setExecutedColumns(columns);
    setActiveView("chart");
  };

  const handleClear = () => {
    setQuery(null);
    setExecutedRows(null);
    setExecutedColumns(null);
    setChartConfig(null);
    setCardConfig(null);
    lastAutoSwitchQueryRef.current = null;
  };

  const { renderControls, renderEditor } = SqlControls({
    query: query ?? data?.query ?? "",
    onQueryChange: (newQuery) => setQuery(newQuery),
    onExecute: handleExecute,
    isExpanded: isSqlExpanded,
    onToggleExpanded: toggleSqlExpanded,
  });

  useEffect(() => {
    const currentQuery = data?.query ?? null;
    if (currentQuery !== lastQueryRef.current) {
      setChartConfig(null);
      setCardConfig(null);
      setExecutedRows(null);
      setExecutedColumns(null);
      setQuery(null);
      setActiveView(
        data?.visualType === "chart" || data?.visualType === "card"
          ? "chart"
          : "table",
      );
      lastAutoSwitchQueryRef.current = null;
      lastQueryRef.current = currentQuery;
    }
  }, [data?.query, data?.visualType]);

  useEffect(() => {
    const q = data?.query ?? null;
    const vt = data?.visualType ?? "table";

    if (!q) {
      lastAutoSwitchQueryRef.current = null;
      return;
    }

    if (
      ((data?.chartConfig && !chartConfig && vt === "chart") ||
        (data?.cardConfig && !cardConfig && vt === "card")) &&
      lastAutoSwitchQueryRef.current !== q
    ) {
      if (data?.chartConfig && vt === "chart") {
        setChartConfig(data.chartConfig);
      }
      if (data?.cardConfig && vt === "card") {
        setCardConfig(data.cardConfig);
      }
      setActiveView("chart");
      lastAutoSwitchQueryRef.current = q;
    }
  }, [
    data?.chartConfig,
    data?.cardConfig,
    data?.visualType,
    data?.query,
    chartConfig,
    cardConfig,
  ]);

  const columnsForDialog = useMemo(
    () =>
      (executedColumns ?? data?.columns ?? []).map((c) => ({ name: c.name })),
    [executedColumns, data?.columns],
  );

  const selectedForChart = useMemo((): SelectedForChart | undefined => {
    if (executedRows !== null) {
      return {
        stage: "complete",
        rows: executedRows,
        chartConfig: chartConfig ?? data?.chartConfig,
        summary: data?.summary,
      };
    }

    return data?.stage === "complete"
      ? {
          stage: data.stage,
          rows: (data.rows as Result[] | undefined) ?? [],
          chartConfig: data.chartConfig,
          summary: data.summary,
        }
      : undefined;
  }, [executedRows, chartConfig, data]);

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
  }, [executedRows, executedColumns, data]);

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
    const totalRows =
      resolvedRows.length > 0
        ? resolvedRows.length
        : data?.rowCount ?? resolvedRows.length;

    // Determine visual type based on active view and configuration/data shape
    let visualType: "table" | "chart" | "card" = "table";
    if (activeView === "chart") {
      if (cardConfig || data?.cardConfig) {
        visualType = "card";
      } else if (chartConfig || data?.chartConfig) {
        visualType = "chart";
      } else if (resolvedRows.length === 1 && resolvedColumns.length === 1) {
        visualType = "card";
      } else {
        visualType = "chart";
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
      chartConfig: chartConfig ?? data?.chartConfig,
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

  // Show SQL editor in chart mode when there's no query and no dbIdentifier
  if (effectiveStage === "initial" && !data?.query && !query) {
    return (
      <div className={cn("space-y-6 w-full", className)}>
        <SqlEditor
          selectedDbLabel={selectedDbLabel}
          dbIdentifier={data?.dbIdentifier ?? ""}
          onQuerySuccess={handleSqlEditorSuccess}
        />
      </div>
    );
  }

  // Logic to determine if we should show the clear button.
  // We generally want to show it if we are in "interactive" mode (e.g. in the prompt input area),
  // but NOT if we are just displaying a static result (e.g. in the chat history).
  //
  // - If `data` comes from props and has stage="complete", it's likely a static chat artifact -> NO Clear button.
  // - If `data` is initial (e.g. from prompt input wrapper), we are interactive -> YES Clear button (once we have results).
  //
  // The `executedRows` state being non-null implies the user has run a query interactively in this session.
  const isInteractive = executedRows !== null || (data?.stage === "initial");

  const showClearButton = isInteractive && (executedRows !== null || (data && data.stage !== "complete"));

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
        <div className="flex items-center justify-between gap-2 p-2 lg:w-[300px] xl:w-[500px] w-full">
          <div className="flex gap-2">
            <Button
              variant={activeView === "table" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveView("table")}
              className="flex items-center gap-2 hover:text-gray-500"
              disabled={!canShowTable}
            >
              <Table className="w-4 h-4" />
              Data
            </Button>
            <Button
              variant={activeView === "chart" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveView("chart")}
              className="flex items-center gap-2 hover:text-gray-500"
            >
              <ChartBar className="w-4 h-4" />
              Visual
            </Button>
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

      {data && activeView === "chart" && (
        <ChartView
          data={data}
          selectedForChart={selectedForChart}
          selectedForCard={selectedForCard}
          chartConfig={chartConfig}
          cardConfig={cardConfig}
          columnsForDialog={columnsForDialog}
          onChartConfigChange={setChartConfig}
          onCardConfigChange={setCardConfig}
          renderSqlControls={renderControls}
          renderSqlEditor={renderEditor}
        />
      )}

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
