import { Squares2X2Icon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddToDashboardDialog } from "@/components/add-to-dashboard-dialog";
import { useArtifactMutation } from "@/components/artifact-mutation-context";
import { SqlResultsTable } from "@/components/sql-results-table";
import { Button } from "@/components/ui/button";
import type { CardConfig, Config, Result } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChartView } from "./sql-analysis-display/chart-view";
import { SqlAnalysisHeader } from "./sql-analysis-display/header";
import {
  buildSqlAnalysisVisualState,
  resolveDefaultDashboardVisualType,
} from "./sql-analysis-display/shared-visual-options";
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
  onVisualTypeChange,
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
  const lastQueryRef = useRef<string | null>(data?.query ?? null);
  const lastVisualTypeRef = useRef<string | undefined>(data?.visualType);
  const [showVisualOptions, setShowVisualOptions] = useState(false);

  const handleClear = () => {
    setChartConfig(null);
    setCardConfig(null);
    setShowVisualOptions(false);
  };

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
      setActiveView(
        currentVisualType === "chart" || currentVisualType === "card"
          ? "chart"
          : "table",
      );
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
      if (data?.chartConfig) {
        const nextChartConfig = data.chartConfig;
        setChartConfig((previous) => previous ?? nextChartConfig);
      }
      if (data?.cardConfig) {
        const nextCardConfig = data.cardConfig;
        setCardConfig((previous) => previous ?? nextCardConfig);
      }
      lastVisualTypeRef.current = currentVisualType;
    }
  }, [data?.query, data?.visualType, data?.chartConfig, data?.cardConfig]);

  useEffect(() => {
    if (activeView !== "chart") {
      setShowVisualOptions(false);
    }
  }, [activeView]);

  const columnsForDialog = useMemo(
    () => (data?.columns ?? []).map((c) => ({ name: c.name })),
    [data?.columns],
  );

  const selectedForChart = useMemo((): SelectedForChart | undefined => {
    if (data?.stage !== "complete") {
      return undefined;
    }

    const completedRows = (data.rows as Result[] | undefined) ?? [];
    const resolvedConfig = normalizeChartConfigForRows(
      chartConfig ?? data.chartConfig,
      completedRows,
    );
    return {
      stage: data.stage,
      rows: completedRows,
      chartConfig: resolvedConfig ?? undefined,
      summary: data.summary,
    };
  }, [chartConfig, data?.stage, data?.rows, data?.chartConfig, data?.summary]);

  const selectedForTable = useMemo((): SelectedForTable | undefined => {
    return data?.stage === "complete"
      ? {
          stage: data.stage,
          columns: (data.columns ?? []) as { name: string; type?: string }[],
          rows: (data.rows as Record<string, unknown>[] | undefined) ?? [],
          summary: data.summary,
        }
      : undefined;
  }, [data?.stage, data?.columns, data?.rows, data?.summary]);

  const cardSourceRows =
    data?.stage === "complete" ? (data.rows ?? null) : null;
  const cardSourceColumns =
    data?.stage === "complete" ? (data.columns ?? null) : null;

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
  const { effectiveChartConfig, visualOptions } = useMemo(
    () =>
      data
        ? buildSqlAnalysisVisualState({
            data,
            chartConfig,
            cardConfig,
            columnsForDialog,
            selectedForChart,
            selectedForTable,
          })
        : null,
    [
      cardConfig,
      chartConfig,
      columnsForDialog,
      data,
      selectedForChart,
      selectedForTable,
    ],
  ) ?? { effectiveChartConfig: null, visualOptions: [] };
  const defaultDashboardVisualType = resolveDefaultDashboardVisualType({
    activeView,
    selectedForCard,
  });

  const payloadForAddToChat = useMemo(() => {
    if (!data) {
      return null;
    }

    const finalRows = (data.rows as Result[] | undefined) ?? null;
    const finalColumns =
      (data.columns as { name: string; type?: string }[] | undefined) ?? null;

    if (!finalRows && !finalColumns) {
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
      query: data?.query ?? "",
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
  }, [data, chartConfig, cardConfig, activeView]);

  const currentVisualType: "table" | "chart" | "card" | undefined =
    activeView === "table" ? "table" : selectedForCard ? "card" : "chart";
  const lastEmittedVisualTypeRef = useRef<"table" | "chart" | "card" | null>(
    null,
  );

  useEffect(() => {
    if (!onVisualTypeChange || !currentVisualType) {
      return;
    }

    if (lastEmittedVisualTypeRef.current === currentVisualType) {
      return;
    }

    lastEmittedVisualTypeRef.current = currentVisualType;
    onVisualTypeChange(currentVisualType);
  }, [currentVisualType, onVisualTypeChange]);

  const showAddToChatButton =
    Boolean(onAddToChat) &&
    Boolean(payloadForAddToChat) &&
    (canAddToChat ?? true);
  const showAddToDashboardButton = visualOptions.length > 0;

  const handleAddToChatClick = () => {
    if (!onAddToChat || !payloadForAddToChat) {
      return;
    }
    onAddToChat(payloadForAddToChat);
  };

  if (!data && !shouldShowStageIndicator) {
    return null;
  }

  // Keep clear controls limited to interactive/initial states.
  const isInteractive = data?.stage === "initial";

  const showClearButton =
    isInteractive && Boolean(data && data.stage !== "complete");

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
        <div className="flex flex-col gap-4 w-full">
          <SqlAnalysisHeader
            activeView={activeView}
            canShowTable={canShowTable}
            onActiveViewChange={setActiveView}
            canShowVisualOptionsToggle={canShowVisualOptionsToggle}
            showVisualOptions={showVisualOptions}
            onVisualOptionsToggle={() => setShowVisualOptions((prev) => !prev)}
            addToDashboardTrigger={
              showAddToDashboardButton ? (
                <AddToDashboardDialog
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <Squares2X2Icon className="h-4 w-4" />
                      Add to dashboard
                    </Button>
                  }
                  sql={data.query ?? ""}
                  sourceDescriptor={data.sourceDescriptor ?? null}
                  dbIdentifier={data.dbIdentifier}
                  catalogContext={data.catalogContext ?? null}
                  sqlBackend={data.sqlBackend}
                  defaultTitle={
                    defaultDashboardVisualType === "card"
                      ? (cardConfig?.title ?? data.cardConfig?.title)
                      : effectiveChartConfig?.title
                  }
                  visualOptions={visualOptions}
                  defaultVisualType={defaultDashboardVisualType}
                />
              ) : undefined
            }
            showAddToChatButton={showAddToChatButton}
            onAddToChatClick={handleAddToChatClick}
            showClearButton={showClearButton}
            onClear={handleClear}
            history={history}
          />

          <div className="w-full px-4">
            {(data ||
              (effectiveStage === "initial" && activeView === "chart")) &&
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
                    chartConfig={chartConfig}
                    cardConfig={cardConfig}
                    columnsForDialog={columnsForDialog}
                    onChartConfigChange={handleChartConfigChange}
                    onCardConfigChange={handleCardConfigChange}
                    showVisualOptions={showVisualOptions}
                    onShowVisualOptionsChange={setShowVisualOptions}
                  />
                );
              })()}

            {data && activeView === "table" && (
              <div className="group relative">
                <SqlResultsTable
                  dataOverride={selectedForTable}
                  expandable
                  query={data.query}
                  dbIdentifier={data.dbIdentifier}
                  backendPreference={data.sqlBackend ?? undefined}
                />
              </div>
            )}
          </div>
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
