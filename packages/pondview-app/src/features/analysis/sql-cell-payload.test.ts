import { describe, expect, test } from "bun:test";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import {
  createSqlCellPayload,
  updateSqlCellPayloadConfig,
  updateSqlCellPayloadVisualType,
} from "@/features/analysis/sql-cell-payload";
import type { SqlBackend } from "@/lib/sql/sql-runtime";
import type { Config } from "@/lib/types";

function makeRunResult(overrides?: {
  sql?: string;
  rows?: Record<string, unknown>[];
  columns?: { name: string; type?: string }[];
  backend?: SqlBackend;
  dbIdentifier?: string;
  catalogContext?: string | null;
  durationMs?: number;
}) {
  return {
    sql: overrides?.sql ?? "select * from orders",
    rows: overrides?.rows ?? [{ revenue: 42 }],
    columns: overrides?.columns ?? [{ name: "revenue", type: "INTEGER" }],
    durationMs: overrides?.durationMs ?? 18,
    backend: overrides?.backend ?? ("duckdb-wasm" as SqlBackend),
    dbIdentifier: overrides?.dbIdentifier,
    catalogContext: overrides?.catalogContext,
  };
}

function makeChartConfig(overrides?: Partial<Config>): Config {
  return {
    visualType: "chart",
    description: "Revenue trend",
    takeaway: "Revenue is rising",
    type: "line",
    title: "Revenue by month",
    xKey: "month",
    yKeys: ["revenue"],
    multipleLines: false,
    legend: false,
    countMode: false,
    ...overrides,
  };
}

describe("sql cell payload", () => {
  test("defaults to card for single-value results", () => {
    const payload = createSqlCellPayload({
      result: makeRunResult(),
      selectedCatalogContext: null,
    });

    expect(payload.visualType).toBe("card");
    expect(payload.summary).toEqual({
      totalRows: 1,
      executionTimeMs: 18,
      insights: [],
    });
  });

  test("preserves existing visual settings across reruns", () => {
    const previousPayload: SqlAnalysisData = {
      query: "select month, revenue from revenue_by_month",
      visualType: "chart",
      chartConfig: makeChartConfig(),
      cardConfig: undefined,
    };

    const payload = createSqlCellPayload({
      result: makeRunResult({
        sql: "select month, revenue from revenue_by_month",
        rows: [{ month: "Jan", revenue: 42 }],
        columns: [
          { name: "month", type: "VARCHAR" },
          { name: "revenue", type: "INTEGER" },
        ],
      }),
      previousPayload,
      selectedCatalogContext: "main",
    });

    expect(payload.visualType).toBe("chart");
    expect(payload.chartConfig).toEqual(previousPayload.chartConfig);
    expect(payload.catalogContext).toBe("main");
  });

  test("updates stored config and visual type immutably", () => {
    const payload: SqlAnalysisData = {
      query: "select 1",
      visualType: "table",
      chartConfig: undefined,
      cardConfig: undefined,
    };

    const withConfig = updateSqlCellPayloadConfig(payload, {
      chartConfig: makeChartConfig({ type: "bar", title: "Revenue by region" }),
    });
    const withVisualType = updateSqlCellPayloadVisualType(withConfig, "chart");

    expect(withConfig).not.toBe(payload);
    expect(withConfig.chartConfig).toEqual({
      visualType: "chart",
      description: "Revenue trend",
      takeaway: "Revenue is rising",
      type: "bar",
      title: "Revenue by region",
      xKey: "month",
      yKeys: ["revenue"],
      multipleLines: false,
      legend: false,
      countMode: false,
    });
    expect(withVisualType.visualType).toBe("chart");
  });
});
