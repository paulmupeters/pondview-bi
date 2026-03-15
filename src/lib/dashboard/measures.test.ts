import { describe, expect, test } from "bun:test";
import {
  buildMeasureOptions,
  buildMeasuresByName,
  extractMeasuresFromMetricCards,
  formatMeasureValue,
  interpolateMeasurePlaceholders,
  type MeasuresByName,
  normalizeMeasureName,
} from "@/lib/dashboard/measures";
import type { Result } from "@/lib/types";

type MeasureTestChart = {
  id: string;
  chartConfigJson: string;
};

function createChart(id: string, chartConfigJson: string): MeasureTestChart {
  return {
    id,
    chartConfigJson,
  };
}

const CARD_CONFIG_JSON = JSON.stringify({
  configType: "card",
  title: "Metric",
  description: "Single metric",
});

const TABLE_CONFIG_JSON = JSON.stringify({
  configType: "table",
  title: "Table",
  description: "Table",
});

describe("dashboard measures", () => {
  test("extracts measures from metric cards only", () => {
    const charts: MeasureTestChart[] = [
      createChart("metric-1", CARD_CONFIG_JSON),
      createChart("table-1", TABLE_CONFIG_JSON),
      createChart("metric-2", CARD_CONFIG_JSON),
    ];

    const chartData: Record<string, Result[]> = {
      "metric-1": [{ highest_category: "Books", ignored: 1 }],
      "table-1": [{ table_value: "should_not_be_included" }],
      "metric-2": [{ total_revenue: 1200 }],
    };

    const measures = extractMeasuresFromMetricCards(charts, chartData);

    expect(measures).toEqual({
      highest_category: "Books",
      total_revenue: formatMeasureValue(1200),
    });
  });

  test("keeps the first value when measure keys collide", () => {
    const charts: MeasureTestChart[] = [
      createChart("metric-1", CARD_CONFIG_JSON),
      createChart("metric-2", CARD_CONFIG_JSON),
    ];

    const chartData: Record<string, Result[]> = {
      "metric-1": [{ revenue: 1000 }],
      "metric-2": [{ revenue: 2000 }],
    };

    const measures = extractMeasuresFromMetricCards(charts, chartData);
    expect(measures).toEqual({ revenue: formatMeasureValue(1000) });
  });

  test("skips metric cards that do not have data rows", () => {
    const charts: MeasureTestChart[] = [
      createChart("metric-1", CARD_CONFIG_JSON),
    ];
    const chartData: Record<string, Result[]> = {
      "metric-1": [],
    };

    const measures = extractMeasuresFromMetricCards(charts, chartData);
    expect(measures).toEqual({});
  });

  test("interpolates known placeholders and preserves unknown placeholders", () => {
    const content =
      "Highest category: {{highest_category}}. Missing: {{missing_measure}}.";
    const measures: MeasuresByName = {
      highest_category: "Books",
    };

    expect(interpolateMeasurePlaceholders(content, measures)).toBe(
      "Highest category: Books. Missing: {{missing_measure}}.",
    );
  });

  test("normalizes placeholder tokens before lookup", () => {
    const content = "Winner: {{ Highest Category }}";
    const measures: MeasuresByName = {
      highest_category: "Books",
    };

    expect(interpolateMeasurePlaceholders(content, measures)).toBe(
      "Winner: Books",
    );
  });

  test("formats supported measure value types", () => {
    const date = new Date("2024-01-01T00:00:00.000Z");

    expect(formatMeasureValue(true)).toBe("true");
    expect(formatMeasureValue(false)).toBe("false");
    expect(formatMeasureValue(null)).toBe("");
    expect(formatMeasureValue(undefined)).toBe("");
    expect(formatMeasureValue("text")).toBe("text");
    expect(formatMeasureValue(date)).toBe(date.toLocaleString());
  });

  test("normalizes measure names to placeholder-friendly keys", () => {
    expect(normalizeMeasureName(" Highest Category ")).toBe("highest_category");
    expect(normalizeMeasureName("Revenue (%)")).toBe("revenue");
    expect(normalizeMeasureName("orders.total-sales")).toBe(
      "orders_total_sales",
    );
  });

  test("prefers saved measures over legacy metric-card measures on key collisions", () => {
    const options = buildMeasureOptions({
      savedMeasures: [
        {
          id: "measure-1",
          dashboardId: "dashboard-1",
          key: "revenue",
          label: "Revenue",
          sql: "select 1 as revenue",
          dbIdentifier: null,
          sqlBackend: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      savedValuesByMeasureId: {
        "measure-1": "2,500",
      },
      legacyMeasures: {
        revenue: "1,000",
        orders: "120",
      },
    });

    expect(options).toEqual([
      {
        key: "orders",
        label: "Orders",
        value: "120",
        source: "legacy",
      },
      {
        key: "revenue",
        label: "Revenue",
        value: "2,500",
        source: "saved",
        measureId: "measure-1",
        sql: "select 1 as revenue",
      },
    ]);

    expect(buildMeasuresByName(options)).toEqual({
      orders: "120",
      revenue: "2,500",
    });
  });
});
