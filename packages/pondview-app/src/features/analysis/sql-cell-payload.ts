import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import { buildDashboardSourceDescriptor } from "@/lib/dashboard/source-descriptor";
import type { SqlBackend } from "@/lib/sql/sql-runtime";
import type { CardConfig, Config, Result } from "@/lib/types";

export type SqlCellRunResult = {
  sql: string;
  rows: Record<string, unknown>[];
  columns: { name: string; type?: string }[];
  durationMs: number;
  backend?: SqlBackend;
  dbIdentifier?: string;
  catalogContext?: string | null;
};

function getDefaultVisualType(
  result: SqlCellRunResult,
): "table" | "chart" | "card" {
  return result.rows.length === 1 && result.columns.length === 1
    ? "card"
    : "table";
}

export function createSqlCellPayload(params: {
  result: SqlCellRunResult;
  previousPayload?: SqlAnalysisData | null;
  selectedCatalogContext?: string | null;
}): SqlAnalysisData {
  const { previousPayload, result, selectedCatalogContext } = params;

  return {
    stage: "complete",
    progress: 1,
    query: result.sql,
    dbIdentifier: result.dbIdentifier,
    catalogContext: result.catalogContext ?? selectedCatalogContext,
    sqlBackend: result.backend,
    sourceDescriptor:
      result.backend || result.dbIdentifier
        ? buildDashboardSourceDescriptor({
            runtimeBackend: result.backend ?? "duckdb-wasm",
            dbIdentifier: result.dbIdentifier ?? null,
            catalogContext:
              result.catalogContext ?? selectedCatalogContext ?? null,
          })
        : null,
    executionTime: result.durationMs,
    rowCount: result.rows.length,
    columns: result.columns,
    rows: result.rows as Result[],
    visualType: previousPayload?.visualType ?? getDefaultVisualType(result),
    chartConfig: previousPayload?.chartConfig,
    cardConfig: previousPayload?.cardConfig,
    summary: {
      totalRows: result.rows.length,
      executionTimeMs: result.durationMs,
      insights: [],
    },
  };
}

export function parseSqlCellPayload(
  resultPayloadJson: string | null | undefined,
): SqlAnalysisData | null {
  if (!resultPayloadJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(resultPayloadJson);
    return parsed && typeof parsed === "object"
      ? (parsed as SqlAnalysisData)
      : null;
  } catch {
    return null;
  }
}

export function updateSqlCellPayloadConfig(
  payload: SqlAnalysisData,
  config: {
    chartConfig?: Config;
    cardConfig?: CardConfig;
  },
): SqlAnalysisData {
  return {
    ...payload,
    ...("chartConfig" in config ? { chartConfig: config.chartConfig } : null),
    ...("cardConfig" in config ? { cardConfig: config.cardConfig } : null),
  };
}

export function updateSqlCellPayloadVisualType(
  payload: SqlAnalysisData,
  visualType: "table" | "chart" | "card",
): SqlAnalysisData {
  return {
    ...payload,
    visualType,
  };
}
