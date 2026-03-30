import { useCallback, useMemo, useRef, useState } from "react";
import type { VisualizationEntry } from "@/components/chat/hooks/use-visualization-selection";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import { buildDashboardSourceDescriptor } from "@/lib/dashboard/source-descriptor";
import type { CardConfig, Config, Result } from "@/lib/types";
import type { SqlReplResult } from "./use-sql-repl";

export const MANUAL_REPL_VISUALIZATION_ID = "manual-repl";

export function getDefaultManualVisualType(params: {
  result: SqlReplResult | null;
  manualVisualType: "table" | "chart" | "card" | null;
  manualChartConfig: Config | null;
}): "table" | "chart" | "card" | null {
  const { result, manualVisualType, manualChartConfig } = params;

  if (!result) {
    return null;
  }

  const isCardMode = result.rows.length === 1 && result.columns.length === 1;

  return (
    manualVisualType ??
    (isCardMode ? "card" : manualChartConfig ? "chart" : "table")
  );
}

export function normalizeManualVisualizationPayload(params: {
  result: SqlReplResult;
  visualType: "table" | "chart" | "card";
  selectedCatalogContext?: string | null;
  chartConfig?: Config | null;
  cardConfig?: CardConfig | null;
}): SqlAnalysisData {
  const {
    result,
    visualType,
    selectedCatalogContext,
    chartConfig,
    cardConfig,
  } = params;

  return {
    stage: "complete",
    progress: 1,
    query: result.sql,
    dbIdentifier: result.dbIdentifier,
    catalogContext: result.catalogContext ?? selectedCatalogContext,
    sqlBackend: result.backend,
    sourceDescriptor:
      result.sourceDescriptor ??
      (result.backend
        ? buildDashboardSourceDescriptor({
            runtimeBackend: result.backend,
            dbIdentifier: result.dbIdentifier,
            catalogContext:
              result.catalogContext ?? selectedCatalogContext ?? null,
          })
        : null),
    executionTime: result.durationMs,
    rowCount: result.rows.length,
    columns: result.columns,
    rows: result.rows as Result[],
    visualType,
    chartConfig:
      visualType === "chart" ? (chartConfig ?? undefined) : undefined,
    cardConfig: visualType === "card" ? (cardConfig ?? undefined) : undefined,
    summary: {
      totalRows: result.rows.length,
      executionTimeMs: result.durationMs,
      insights: [],
    },
  };
}

export function getManualVisualizationResetState(
  result: SqlReplResult | null,
): {
  chartConfig: null;
  cardConfig: null;
  visualType: "table" | "chart" | "card" | null;
} {
  return {
    chartConfig: null,
    cardConfig: null,
    visualType:
      result && result.rows.length === 1 && result.columns.length === 1
        ? "card"
        : result
          ? "table"
          : null,
  };
}

export type ManualVisualizationController = {
  chartConfig: Config | null;
  cardConfig: CardConfig | null;
  visualType: "table" | "chart" | "card" | null;
  handleConfigChange: (config: {
    chartConfig?: Config;
    cardConfig?: CardConfig;
  }) => void;
  handleVisualTypeChange: (visualType: "table" | "chart" | "card") => void;
  handleReplResultChange: (result: SqlReplResult | null) => void;
  focusManualVisualization: () => void;
  createPayload: (params: {
    result: SqlReplResult | null;
    selectedCatalogContext?: string | null;
  }) => SqlAnalysisData | null;
};

export function useManualVisualization({
  sqlResult,
  setSqlResult,
  selectedCatalogContext,
}: {
  sqlResult: SqlReplResult | null;
  setSqlResult: (result: SqlReplResult | null) => void;
  selectedCatalogContext?: string | null;
}): {
  manualVisualization: ManualVisualizationController;
  supplementalVisualizations: VisualizationEntry[];
} {
  const [manualChartConfig, setManualChartConfig] = useState<Config | null>(
    null,
  );
  const [manualCardConfig, setManualCardConfig] = useState<CardConfig | null>(
    null,
  );
  const [manualVisualType, setManualVisualType] = useState<
    "table" | "chart" | "card" | null
  >(null);
  const prevSqlRef = useRef<string | null>(null);

  const handleConfigChange = useCallback(
    (config: { chartConfig?: Config; cardConfig?: CardConfig }) => {
      if ("chartConfig" in config) {
        setManualChartConfig(config.chartConfig ?? null);
      }
      if ("cardConfig" in config) {
        setManualCardConfig(config.cardConfig ?? null);
      }
    },
    [],
  );

  const handleVisualTypeChange = useCallback(
    (visualType: "table" | "chart" | "card") => {
      setManualVisualType(visualType);
    },
    [],
  );

  const handleReplResultChange = useCallback(
    (result: SqlReplResult | null) => {
      setSqlResult(result);
      const newSql = result?.sql ?? null;
      if (newSql !== prevSqlRef.current) {
        const resetState = getManualVisualizationResetState(result);
        setManualChartConfig(resetState.chartConfig);
        setManualCardConfig(resetState.cardConfig);
        setManualVisualType(resetState.visualType);
        prevSqlRef.current = newSql;
      }
    },
    [setSqlResult],
  );

  const createPayload = useCallback(
    ({
      result,
      selectedCatalogContext: overrideSelectedCatalogContext,
    }: {
      result: SqlReplResult | null;
      selectedCatalogContext?: string | null;
    }) => {
      if (!result) {
        return null;
      }

      const visualType =
        getDefaultManualVisualType({
          result,
          manualVisualType,
          manualChartConfig,
        }) ?? "table";

      return normalizeManualVisualizationPayload({
        result,
        visualType,
        selectedCatalogContext:
          overrideSelectedCatalogContext ?? selectedCatalogContext,
        chartConfig: manualChartConfig,
        cardConfig: manualCardConfig,
      });
    },
    [
      manualCardConfig,
      manualChartConfig,
      manualVisualType,
      selectedCatalogContext,
    ],
  );

  const supplementalVisualizations = useMemo<VisualizationEntry[]>(() => {
    const payload = createPayload({
      result: sqlResult,
    });

    if (!payload) {
      return [];
    }

    return [
      {
        id: MANUAL_REPL_VISUALIZATION_ID,
        data: payload,
        stage: "complete",
        progress: 1,
        canAddToChat: false,
        onConfigChange: handleConfigChange,
        onVisualTypeChange: handleVisualTypeChange,
        source: "manual-repl",
      },
    ];
  }, [createPayload, handleConfigChange, handleVisualTypeChange, sqlResult]);

  return {
    manualVisualization: {
      chartConfig: manualChartConfig,
      cardConfig: manualCardConfig,
      visualType: manualVisualType,
      handleConfigChange,
      handleVisualTypeChange,
      handleReplResultChange,
      focusManualVisualization: () => {},
      createPayload,
    },
    supplementalVisualizations,
  };
}
