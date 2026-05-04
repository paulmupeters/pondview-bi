import { describe, expect, test } from "bun:test";
import { resolveStoredChartDbIdentifier } from "@/components/dashboard-builder-panel";
import { normalizeVisualArtifact } from "@/components/dashboard-builder-panel.shared";
import { getDashboardItemConfig } from "@/components/dashboard-builder-panel.visuals";
import type { ArtifactData } from "@/hooks/types";
import type { SqlAnalysisData } from "./sql-analysis-display.types";

describe("resolveStoredChartDbIdentifier", () => {
  test("does not fall back to selectedDbIdentifier for remote runtime charts", () => {
    expect(
      resolveStoredChartDbIdentifier({
        sqlBackend: "duckdb-http",
        payloadDbIdentifier: undefined,
        selectedDbIdentifier: "duckdb:connected-runtime",
      }),
    ).toBeNull();
  });

  test("keeps explicit non-wasm db identifiers for remote external sources", () => {
    expect(
      resolveStoredChartDbIdentifier({
        sqlBackend: "duckdb-http",
        payloadDbIdentifier: "sqlite:/tmp/warehouse.db",
        selectedDbIdentifier: "duckdb:connected-runtime",
      }),
    ).toBe("sqlite:/tmp/warehouse.db");
  });
});

describe("dashboard builder visual snapshots", () => {
  test("keeps chart options available for table result payloads", () => {
    const artifact: ArtifactData<SqlAnalysisData> = {
      id: "result-1",
      type: "execute-sql",
      status: "complete",
      version: 1,
      createdAt: 10,
      updatedAt: 10,
      payload: {
        stage: "complete",
        query: "select month, revenue from revenue_by_month",
        columns: [
          { name: "month", type: "VARCHAR" },
          { name: "revenue", type: "DOUBLE" },
        ],
        rows: [
          { month: "Jan", revenue: 10 },
          { month: "Feb", revenue: 20 },
        ],
        visualType: "table",
      },
    };

    const snapshot = normalizeVisualArtifact(artifact);

    expect(snapshot).not.toBeNull();
    if (!snapshot) return;

    expect(snapshot?.type).toBe("table");
    expect(snapshot?.payload.tableConfig?.configType).toBe("table");
    expect(snapshot?.payload.chartConfig?.visualType).toBe("chart");

    const chartConfig = getDashboardItemConfig({
      ...snapshot,
      type: "chart",
    }).config;

    expect(chartConfig).toMatchObject({
      visualType: "chart",
      xKey: "month",
      yKeys: ["revenue"],
    });
  });

  test("keeps table options available for chart result payloads", () => {
    const artifact: ArtifactData<SqlAnalysisData> = {
      id: "result-2",
      type: "execute-sql",
      status: "complete",
      version: 1,
      createdAt: 10,
      updatedAt: 10,
      payload: {
        stage: "complete",
        query: "select month, revenue from revenue_by_month",
        columns: [
          { name: "month", type: "VARCHAR" },
          { name: "revenue", type: "DOUBLE" },
        ],
        rows: [
          { month: "Jan", revenue: 10 },
          { month: "Feb", revenue: 20 },
        ],
        visualType: "chart",
        chartConfig: {
          visualType: "chart",
          title: "Revenue",
          description: "",
          type: "bar",
          xKey: "month",
          yKeys: ["revenue"],
          legend: false,
          multipleLines: false,
          countMode: false,
        },
      },
    };

    const snapshot = normalizeVisualArtifact(artifact);

    expect(snapshot).not.toBeNull();
    if (!snapshot) return;

    expect(snapshot.type).toBe("chart");
    expect(snapshot.payload.tableConfig).toMatchObject({
      configType: "table",
      title: "Table: select month, revenue from revenue_by_month",
    });

    const tableConfig = getDashboardItemConfig({
      ...snapshot,
      type: "table",
    }).config;

    expect(tableConfig).toMatchObject({
      configType: "table",
      title: "Table: select month, revenue from revenue_by_month",
    });
  });
});
