import { describe, expect, test } from "bun:test";
import {
  buildMeasureOptions,
  buildMeasuresByName,
  extractLegacyMeasureOptionsFromMetricCards,
  extractMeasuresFromMetricCards,
  formatMeasureValue,
  interpolateMeasurePlaceholders,
  normalizeMeasureName,
  renderTextTemplate,
  type MeasureRenderContextByName,
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
      highest_category: {
        key: "highest_category",
        formattedValue: "Books",
        rawValue: "Books",
      },
      total_revenue: {
        key: "total_revenue",
        formattedValue: formatMeasureValue(1200),
        rawValue: 1200,
      },
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
    expect(measures).toEqual({
      revenue: {
        key: "revenue",
        formattedValue: formatMeasureValue(1000),
        rawValue: 1000,
      },
    });
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

  test("extracts legacy measure options from metric cards with sql metadata", () => {
    const charts = [
      {
        id: "metric-1",
        chartConfigJson: JSON.stringify({
          configType: "card",
          title: "Revenue",
          description: "Revenue metric",
        }),
        sql: "select 1000 as total_revenue",
        dbIdentifier: "warehouse",
        sqlBackend: "bridge" as const,
      },
      {
        id: "table-1",
        chartConfigJson: TABLE_CONFIG_JSON,
        sql: "select 1",
      },
    ];

    const chartData: Record<string, Result[]> = {
      "metric-1": [{ total_revenue: 1000 }],
      "table-1": [{ ignored: "value" }],
    };

    expect(
      extractLegacyMeasureOptionsFromMetricCards(charts, chartData),
    ).toEqual([
      {
        key: "total_revenue",
        label: "Revenue",
        value: "1,000",
        rawValue: 1000,
        source: "legacy",
        sql: "select 1000 as total_revenue",
        dbIdentifier: "warehouse",
        sqlBackend: "bridge",
        sourceChartId: "metric-1",
      },
    ]);
  });

  test("interpolates known placeholders and preserves unknown placeholders", () => {
    const content =
      "Highest category: {{highest_category}}. Missing: {{missing_measure}}.";
    const measures: MeasureRenderContextByName = {
      highest_category: {
        key: "highest_category",
        formattedValue: "Books",
        rawValue: "Books",
      },
    };

    expect(interpolateMeasurePlaceholders(content, measures)).toBe(
      "Highest category: Books. Missing: {{missing_measure}}.",
    );
  });

  test("normalizes placeholder tokens before lookup", () => {
    const content = "Winner: {{ Highest Category }}";
    const measures: MeasureRenderContextByName = {
      highest_category: {
        key: "highest_category",
        formattedValue: "Books",
        rawValue: "Books",
      },
    };

    expect(interpolateMeasurePlaceholders(content, measures)).toBe(
      "Winner: Books",
    );
  });

  test("renders conditional text blocks for positive numbers", () => {
    const content =
      "{{#if revenue > 0}}📈{{else}}📉{{/if}} Revenue: {{revenue}}";
    const measures: MeasureRenderContextByName = {
      revenue: {
        key: "revenue",
        formattedValue: "1,000",
        rawValue: 1000,
      },
    };

    expect(renderTextTemplate(content, measures)).toBe("📈 Revenue: 1,000");
  });

  test("renders false branch for zero or negative numbers", () => {
    const content = "{{#if revenue > 0}}📈{{else}}📉{{/if}}";
    const measures: MeasureRenderContextByName = {
      revenue: {
        key: "revenue",
        formattedValue: "-2",
        rawValue: -2,
      },
    };

    expect(renderTextTemplate(content, measures)).toBe("📉");
  });

  test("returns empty content for false conditions without else", () => {
    const content = "Status: {{#if revenue > 0}}📈{{/if}}";
    const measures: MeasureRenderContextByName = {
      revenue: {
        key: "revenue",
        formattedValue: "0",
        rawValue: 0,
      },
    };

    expect(renderTextTemplate(content, measures)).toBe("Status: ");
  });

  test("uses raw numeric values instead of locale formatted strings", () => {
    const content = "{{#if revenue > 900}}high{{else}}low{{/if}}";
    const measures: MeasureRenderContextByName = {
      revenue: {
        key: "revenue",
        formattedValue: "1,000",
        rawValue: 1000,
      },
    };

    expect(renderTextTemplate(content, measures)).toBe("high");
  });

  test("treats missing measure keys as false in conditional blocks", () => {
    expect(
      renderTextTemplate("{{#if revenue > 0}}📈{{else}}📉{{/if}}", {}),
    ).toBe("📉");
  });

  test("supports string equality conditions", () => {
    const content = '{{#if status == "up"}}online{{else}}offline{{/if}}';
    const measures: MeasureRenderContextByName = {
      status: {
        key: "status",
        formattedValue: "up",
        rawValue: "up",
      },
    };

    expect(renderTextTemplate(content, measures)).toBe("online");
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
      savedRawValuesByMeasureId: {
        "measure-1": 2500,
      },
      legacyMeasureOptions: [
        {
          key: "revenue",
          label: "Revenue (Legacy)",
          value: "1,000",
          rawValue: 1000,
          source: "legacy",
          sql: "select 1000 as revenue",
          sourceChartId: "chart-1",
        },
        {
          key: "orders",
          label: "Orders",
          value: "120",
          rawValue: 120,
          source: "legacy",
          sql: "select 120 as orders",
          sourceChartId: "chart-2",
        },
      ],
    });

    expect(options).toEqual([
      {
        key: "orders",
        label: "Orders",
        value: "120",
        rawValue: 120,
        source: "legacy",
        sql: "select 120 as orders",
        sourceChartId: "chart-2",
      },
      {
        key: "revenue",
        label: "Revenue",
        value: "2,500",
        rawValue: 2500,
        source: "saved",
        measureId: "measure-1",
        sql: "select 1 as revenue",
        dbIdentifier: null,
        sqlBackend: null,
      },
    ]);

    expect(buildMeasuresByName(options)).toEqual({
      orders: {
        key: "orders",
        formattedValue: "120",
        rawValue: 120,
      },
      revenue: {
        key: "revenue",
        formattedValue: "2,500",
        rawValue: 2500,
      },
    });
  });
});
