import type { ArtifactData } from "@/hooks/types";
import {
  buildDashboardSourceDescriptor,
  type DashboardSourceDescriptor,
  getDashboardSourceDescriptorCatalogContext,
  getDashboardSourceDescriptorDbIdentifier,
  getDashboardSourceDescriptorRuntimeBackend,
} from "@/lib/dashboard/source-descriptor";
import {
  DEFAULT_WASM_DB_IDENTIFIER,
  isWasmLocalIdentifier,
  type SqlBackend,
} from "@/lib/sql/sql-runtime";
import type { CardConfig, Config, Result, TableConfig } from "@/lib/types";
import type { SqlAnalysisData } from "./sql-analysis-display.types";

export type VisualSnapshot = {
  id: string;
  createdAt: number;
  artifact: ArtifactData<SqlAnalysisData>;
  payload: SqlAnalysisData;
  rows: Result[];
  type: "chart" | "card" | "table" | "text";
};

export type DashboardBuilderVisualType = VisualSnapshot["type"];

export type JoinColumnState = {
  status: "idle" | "loading" | "loaded" | "error";
  columns: string[];
  error?: string;
};

export type JoinSourceInfo = {
  sourceDescriptor: DashboardSourceDescriptor | null;
  storedDbIdentifier: string | null;
  executionDbIdentifier?: string;
  catalogContext?: string | null;
  sqlBackend: SqlBackend | null;
};

export function resolveStoredChartDbIdentifier(options: {
  sqlBackend: SqlBackend | null;
  payloadDbIdentifier?: string;
  selectedDbIdentifier?: string;
}): string | null {
  const candidates = [options.payloadDbIdentifier, options.selectedDbIdentifier]
    .map((value) => value?.trim() ?? "")
    .filter((value): value is string => value.length > 0);

  if (options.sqlBackend === "duckdb-wasm") {
    return candidates[0] ?? DEFAULT_WASM_DB_IDENTIFIER;
  }

  if (options.sqlBackend === "bridge") {
    return (
      candidates
        .filter((value) => value === options.payloadDbIdentifier?.trim())
        .find((value) => !isWasmLocalIdentifier(value)) ?? null
    );
  }

  return candidates[0] ?? DEFAULT_WASM_DB_IDENTIFIER;
}

export function buildFallbackChartConfig(
  payload: SqlAnalysisData,
): Config | null {
  const columns = payload.columns ?? [];
  const xKey = columns[0]?.name ?? "";
  const yKey = columns[1]?.name;

  if (!xKey) {
    return null;
  }

  const querySnippet = payload.query ?? "";
  const truncatedQuery =
    querySnippet.length > 50 ? `${querySnippet.slice(0, 50)}...` : querySnippet;

  return {
    visualType: "chart",
    title: truncatedQuery ? `Chart: ${truncatedQuery}` : "Generated chart",
    description: payload.summary?.insights?.[0] ?? "",
    type: "line",
    xKey,
    yKeys: yKey ? [yKey] : [],
    multipleLines: false,
    legend: false,
    countMode: false,
    showGrid: true,
    showXAxis: true,
    showYAxis: true,
    showDots: true,
    showTooltip: true,
    lineSize: 2,
    labelYAngle: -90,
  };
}

export function buildFallbackTableConfig(
  payload: SqlAnalysisData,
): TableConfig {
  return {
    configType: "table",
    title: payload.tableConfig?.title
      ? payload.tableConfig.title
      : payload.query
        ? `Table: ${payload.query.substring(0, 50)}${payload.query.length > 50 ? "..." : ""}`
        : "Data Table",
    description:
      payload.tableConfig?.description ?? payload.summary?.insights?.[0] ?? "",
  };
}

export function normalizeVisualArtifact(
  artifact: ArtifactData<SqlAnalysisData>,
): VisualSnapshot | null {
  const payload = artifact.payload;

  if (!payload) return null;
  if ((payload.stage ?? "") !== "complete") return null;

  const visualType = payload.visualType;

  if (visualType === "chart") {
    const resolvedChartConfig =
      payload.chartConfig ?? buildFallbackChartConfig(payload);
    if (!resolvedChartConfig) return null;

    const rows = Array.isArray(payload.rows)
      ? (payload.rows as Result[]).map((row) => ({ ...row }))
      : [];

    return {
      id: artifact.id,
      createdAt: artifact.createdAt,
      artifact,
      payload: {
        ...payload,
        chartConfig: resolvedChartConfig,
        columns: (payload.columns ?? []).map(
          (column: { name: string; type?: string }) => ({ ...column }),
        ),
        rows,
        tableConfig:
          (payload.columns?.length ?? 0) > 0
            ? (payload.tableConfig ?? buildFallbackTableConfig(payload))
            : payload.tableConfig,
      },
      rows,
      type: "chart",
    };
  }

  if (visualType === "card") {
    const rows = Array.isArray(payload.rows)
      ? (payload.rows as Result[]).map((row) => ({ ...row }))
      : [];

    const defaultCardConfig: CardConfig = {
      configType: "card",
      title:
        payload.cardConfig?.title ??
        payload.columns?.[0]?.name ??
        "Untitled Card",
      description: payload.cardConfig?.description ?? "",
      takeaway: payload.cardConfig?.takeaway ?? "",
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
        cardConfig: defaultCardConfig,
      },
      rows,
      type: "card",
    };
  }

  if (visualType === "table") {
    const rows = Array.isArray(payload.rows)
      ? (payload.rows as Result[]).map((row) => ({ ...row }))
      : [];
    const resolvedChartConfig =
      payload.chartConfig ?? buildFallbackChartConfig(payload);

    const defaultTableConfig = buildFallbackTableConfig(payload);

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
        chartConfig: resolvedChartConfig ?? undefined,
      },
      rows,
      type: "table",
    };
  }

  if (visualType === "text") {
    return {
      id: artifact.id,
      createdAt: artifact.createdAt,
      artifact,
      payload,
      rows: [],
      type: "text",
    };
  }

  return null;
}

export function buildJoinSourceInfo(
  snapshot: VisualSnapshot,
  selectedDbIdentifier?: string,
  selectedSqlBackend?: SqlBackend,
): JoinSourceInfo {
  const sourceDescriptor =
    snapshot.payload.sourceDescriptor ??
    (snapshot.payload.sqlBackend || selectedSqlBackend
      ? buildDashboardSourceDescriptor({
          runtimeBackend:
            snapshot.payload.sqlBackend ?? selectedSqlBackend ?? "duckdb-wasm",
          dbIdentifier:
            snapshot.payload.dbIdentifier ?? selectedDbIdentifier ?? null,
          catalogContext: snapshot.payload.catalogContext ?? null,
        })
      : null);

  const sqlBackend =
    getDashboardSourceDescriptorRuntimeBackend(sourceDescriptor) ??
    snapshot.payload.sqlBackend ??
    selectedSqlBackend ??
    null;

  return {
    sourceDescriptor,
    storedDbIdentifier: resolveStoredChartDbIdentifier({
      sqlBackend,
      payloadDbIdentifier:
        getDashboardSourceDescriptorDbIdentifier(sourceDescriptor) ??
        snapshot.payload.dbIdentifier,
      selectedDbIdentifier,
    }),
    executionDbIdentifier:
      sqlBackend === "duckdb-wasm"
        ? (
            getDashboardSourceDescriptorDbIdentifier(sourceDescriptor) ??
            snapshot.payload.dbIdentifier
          )?.trim() || selectedDbIdentifier?.trim()
        : (
            getDashboardSourceDescriptorDbIdentifier(sourceDescriptor) ??
            snapshot.payload.dbIdentifier
          )?.trim(),
    catalogContext:
      getDashboardSourceDescriptorCatalogContext(sourceDescriptor) ??
      snapshot.payload.catalogContext ??
      null,
    sqlBackend,
  };
}
