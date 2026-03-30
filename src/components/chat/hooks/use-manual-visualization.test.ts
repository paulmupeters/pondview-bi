import { describe, expect, test } from "bun:test";
import {
  getDefaultManualVisualType,
  getManualVisualizationResetState,
  normalizeManualVisualizationPayload,
} from "@/components/chat/hooks/use-manual-visualization";

describe("manual visualization helpers", () => {
  const tabularResult = {
    sql: "select region, sum(revenue) from sales",
    rows: [{ region: "EU", revenue: 42 }],
    columns: [
      { name: "region", type: "text" },
      { name: "revenue", type: "number" },
    ],
    durationMs: 12,
    backend: "duckdb-wasm" as const,
    dbIdentifier: "wasm:local",
    catalogContext: "analytics",
  };

  test("chooses a default manual visual type from result and config state", () => {
    expect(
      getDefaultManualVisualType({
        result: null,
        manualVisualType: null,
        manualChartConfig: null,
      }),
    ).toBeNull();

    expect(
      getDefaultManualVisualType({
        result: tabularResult,
        manualVisualType: null,
        manualChartConfig: null,
      }),
    ).toBe("table");

    expect(
      getDefaultManualVisualType({
        result: tabularResult,
        manualVisualType: null,
        manualChartConfig: {
          visualType: "chart",
          title: "Revenue",
          description: "",
          type: "bar",
          xKey: "region",
          yKeys: ["revenue"],
          multipleLines: false,
          legend: false,
          countMode: false,
        },
      }),
    ).toBe("chart");
  });

  test("resets manual visualization state when a new SQL result arrives", () => {
    expect(getManualVisualizationResetState(null)).toEqual({
      chartConfig: null,
      cardConfig: null,
      visualType: null,
    });

    expect(
      getManualVisualizationResetState({
        ...tabularResult,
        rows: [{ value: 7 }],
        columns: [{ name: "value", type: "number" }],
      }),
    ).toEqual({
      chartConfig: null,
      cardConfig: null,
      visualType: "card",
    });
  });

  test("normalizes a manual visualization payload and derives source metadata", () => {
    const payload = normalizeManualVisualizationPayload({
      result: tabularResult,
      visualType: "chart",
      chartConfig: {
        visualType: "chart",
        title: "Revenue",
        description: "",
        type: "bar",
        xKey: "region",
        yKeys: ["revenue"],
        multipleLines: false,
        legend: false,
        countMode: false,
      },
    });

    expect(payload.visualType).toBe("chart");
    expect(payload.rowCount).toBe(1);
    expect(payload.chartConfig?.title).toBe("Revenue");
    expect(payload.sourceDescriptor).toEqual({
      kind: "runtime",
      runtimeBackend: "duckdb-wasm",
      dbIdentifier: "wasm:local",
      catalogContext: "analytics",
    });
  });
});
