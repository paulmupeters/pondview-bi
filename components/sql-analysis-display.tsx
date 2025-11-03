"use client";

import {
  ChatBubbleBottomCenterTextIcon,
  Cog6ToothIcon,
  PlayCircleIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import {
  ChartBar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  Loader2,
  Search,
  Table,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { runSqlAndGetRowObjectsJson } from "@/actions/queries";
import { AddToDashboardDialog } from "@/components/add-to-dashboard-dialog";
import { CardConfigDialog } from "@/components/card-config-dialog";
import { ChartConfigDialog } from "@/components/chart-config-dialog";
import { SqlChart } from "@/components/sql-chart";
import { SqlResultsTable } from "@/components/sql-results-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CardConfig, Config, Result } from "@/lib/types";
import { cn } from "@/lib/utils";

export type SqlAnalysisStage =
  | "loading"
  | "processing"
  | "analyzing"
  | "visualizing"
  | "complete";

export type SqlAnalysisData = {
  stage?: SqlAnalysisStage;
  progress?: number;
  query?: string;
  dbIdentifier?: string;
  executionTime?: number;
  rowCount?: number;
  columns?: { name: string; type?: string }[];
  rows?: Result[];
  visualType?: "table" | "chart" | "card";
  chartConfig?: Config;
  cardConfig?: CardConfig;
  summary?: {
    totalRows: number;
    executionTimeMs?: number;
    insights: string[];
    queryType?: string;
  };
};

interface SqlAnalysisDisplayProps {
  data: SqlAnalysisData | null;
  stage?: SqlAnalysisStage;
  progress?: number;
  showStageIndicator?: boolean;
  history?: {
    currentIndex: number;
    total: number;
    onPrev: () => void;
    onNext: () => void;
  };
  className?: string;
}

function StageIndicator({
  currentStage,
  progress = 0,
}: {
  currentStage: SqlAnalysisStage;
  progress?: number;
}) {
  const stages = [
    {
      id: "loading" as const,
      label: "Preparing",
      icon: Loader2,
      description: "Initializing query execution",
    },
    {
      id: "processing" as const,
      label: "Processing",
      icon: Database,
      description: "Executing SQL query",
    },
    {
      id: "analyzing" as const,
      label: "Analyzing",
      icon: Search,
      description: "Processing results and generating insights",
    },
    {
      id: "visualizing" as const,
      label: "Visualizing",
      icon: ChartBar,
      description: "Generating chart visualization",
    },
    {
      id: "complete" as const,
      label: "Complete",
      icon: CheckCircle2,
      description: "Ready to view",
    },
  ];

  const currentStageIndex = stages.findIndex((s) => s.id === currentStage);

  return (
    <div className="bg-muted/30 border rounded-lg p-4 space-y-3">
      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
        <div
          className="bg-primary h-full transition-all duration-500 ease-out"
          style={{ width: `${Math.min(1, Math.max(0, progress)) * 100}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        {stages.map((stage, index) => {
          const Icon = stage.icon;
          const isActive = stage.id === currentStage;
          const isCompleted = index < currentStageIndex;
          const isPending = index > currentStageIndex;

          return (
            <div
              key={stage.id}
              className={cn(
                "flex flex-col items-center gap-2 flex-1",
                "transition-opacity duration-300",
                isPending && "opacity-40",
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300",
                  isActive && "border-primary bg-primary/10 scale-110",
                  isCompleted && "border-green-500 bg-green-500/10",
                  isPending && "border-muted-foreground/30 bg-muted",
                )}
              >
                <Icon
                  className={cn(
                    "w-5 h-5 transition-all duration-300",
                    isActive && "text-primary animate-pulse",
                    isCompleted && "text-green-500",
                    isPending && "text-muted-foreground",
                  )}
                />
              </div>
              <div className="text-center">
                <div
                  className={cn(
                    "text-xs font-medium transition-colors duration-300",
                    isActive && "text-primary",
                    isCompleted && "text-green-500",
                    isPending && "text-muted-foreground",
                  )}
                >
                  {stage.label}
                </div>
                {isActive && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {stage.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SqlAnalysisDisplay({
  data,
  stage,
  progress,
  showStageIndicator = true,
  history,
  className,
}: SqlAnalysisDisplayProps) {
  const [activeView, setActiveView] = useState<"table" | "chart">(() =>
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
  useEffect(() => {
    const currentQuery = data?.query ?? null;
    if (currentQuery !== lastQueryRef.current) {
      setChartConfig(null);
      setCardConfig(null);
      setExecutedRows(null);
      setExecutedColumns(null);
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

  // useEffect(() => {
  //   if (
  //     data?.visualType === "table" &&
  //     !chartConfig &&
  //     !cardConfig &&
  //     activeView !== "table"
  //   ) {
  //     setActiveView("table");
  //   }
  // }, [data?.visualType, chartConfig, cardConfig, activeView]);

  const columnsForDialog = useMemo(
    () => (executedColumns ?? data?.columns ?? []).map((c) => ({ name: c.name })),
    [executedColumns, data?.columns],
  );

  const selectedForChart = useMemo(() => {
    // Use executed data if available, otherwise fall back to data prop
    if (executedRows !== null) {
      return {
        stage: "complete" as const,
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

  const selectedForTable = useMemo(() => {
    // Use executed data if available, otherwise fall back to data prop
    if (executedRows !== null && executedColumns !== null) {
      return {
        stage: "complete" as const,
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

  const selectedForCard =
    data?.stage === "complete" &&
    data.rows &&
    data.rows.length === 1 &&
    data.columns &&
    data.columns.length === 1
      ? {
          stage: data.stage,
          columnName: data.columns[0].name,
          value: data.rows[0][data.columns[0].name],
        }
      : undefined;

  const effectiveStage = (stage ??
    data?.stage ??
    "loading") as SqlAnalysisStage;
  const effectiveProgress = progress ?? data?.progress ?? 0;
  const shouldShowStageIndicator =
    showStageIndicator && effectiveStage !== "complete";

  const canShowTable = Boolean(selectedForTable);

  if (!data && !shouldShowStageIndicator) {
    return null;
  }

  const handleExecute = () => {
    const queryToExecute = query || data?.query || "";
    runSqlAndGetRowObjectsJson(
      data?.dbIdentifier ?? "md:my_db",
      queryToExecute,
    ).then((rows) => {
      console.log("Rows:", rows);
      
      // Extract columns from the first row
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

      {data && (
        <Collapsible className="w-full mt-2">
          <CollapsibleTrigger className="flex items-center justify-between w-full p-4 border hover:bg-muted/50 cursor-pointer mx-auto">
            <span className="text-sm font-medium">SQL Query</span>
            <ChevronDown className="w-4 h-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="p-4 border-t flex items-center justify-between gap-2">
            <Textarea
              value={query || data.query || "No query available"}
              className="text-xs bg-muted p-2 rounded overflow-x-auto"
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
              onClick={handleExecute}
            >
              <PlayCircleIcon className="w-4 h-4" />
              Execute
            </Button>
          </CollapsibleContent>
        </Collapsible>
      )}

      {data && activeView === "chart" && (
        <div className="relative">
          {selectedForCard ? (
            <>
              <div className="absolute top-0 right-0 z-10 flex gap-2">
                <CardConfigDialog
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <Cog6ToothIcon className="w-4 h-4" />
                    </Button>
                  }
                  config={cardConfig}
                  onConfigChange={setCardConfig}
                  tooltip="Configure card"
                />
                <AddToDashboardDialog
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <PlusIcon className="w-4 h-4" />
                    </Button>
                  }
                  sql={data.query ?? ""}
                  cardConfig={cardConfig ?? data.cardConfig ?? undefined}
                  defaultTitle={cardConfig?.title ?? data.cardConfig?.title}
                  tooltip="Add to dashboard"
                />
              </div>
              <Card className="mx-auto w-fit">
                <CardHeader>
                  <CardTitle className="text-base font-medium text-muted-foreground">
                    {cardConfig?.title ??
                      data.cardConfig?.title ??
                      selectedForCard.columnName}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-foreground">
                    {typeof selectedForCard.value === "number"
                      ? selectedForCard.value.toLocaleString()
                      : typeof selectedForCard.value === "boolean"
                        ? selectedForCard.value.toString()
                        : selectedForCard.value instanceof Date
                          ? selectedForCard.value.toLocaleString()
                          : String(selectedForCard.value)}
                  </div>
                  {(cardConfig?.description ??
                    data.cardConfig?.description) && (
                    <div className="text-sm text-muted-foreground mt-2">
                      {cardConfig?.description ?? data.cardConfig?.description}
                    </div>
                  )}
                  {(cardConfig?.takeaway ?? data.cardConfig?.takeaway) && (
                    <div className="text-xs text-muted-foreground mt-2 italic">
                      {cardConfig?.takeaway ?? data.cardConfig?.takeaway}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <div className="absolute top-0 right-0 z-10 flex gap-2">
                <ChartConfigDialog
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <Cog6ToothIcon className="w-4 h-4" />
                    </Button>
                  }
                  config={chartConfig}
                  columns={columnsForDialog}
                  rows={selectedForChart?.rows ?? []}
                  onConfigChange={setChartConfig}
                  tooltip="Configure chart"
                />
                <AddToDashboardDialog
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <PlusIcon className="w-4 h-4" />
                    </Button>
                  }
                  sql={data.query ?? ""}
                  chartConfig={
                    chartConfig ??
                    data.chartConfig ?? {
                      description: "",
                      type: "bar",
                      title: "",
                      xKey: "",
                      yKeys: [],
                      multipleLines: false,
                      legend: false,
                      countMode: false,
                    }
                  }
                  defaultTitle={chartConfig?.title ?? data.chartConfig?.title}
                  tooltip="Add to dashboard"
                />
              </div>

              {selectedForChart && (
                <SqlChart
                  customChartConfig={chartConfig ?? undefined}
                  dataOverride={selectedForChart}
                />
              )}
            </>
          )}
        </div>
      )}

      {data && activeView === "table" && (
        <SqlResultsTable dataOverride={selectedForTable} />
      )}

      {!data && shouldShowStageIndicator && (
        <div className="p-4 text-sm text-muted-foreground">
          Analysis in progress...
        </div>
      )}
    </div>
  );
}
