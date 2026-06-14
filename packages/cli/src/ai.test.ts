import { describe, expect, test } from "bun:test";
import { buildBridgeFinalSqlPayload } from "./ai";

describe("buildBridgeFinalSqlPayload", () => {
  test("generates a chart payload for categorical numeric SELECT results", () => {
    const payload = buildBridgeFinalSqlPayload({
      sql: "SELECT region, total FROM sales_by_region",
      rows: [
        { region: "North", total: 10 },
        { region: "South", total: 15 },
      ],
      columns: [
        { name: "region", type: "VARCHAR" },
        { name: "total", type: "DOUBLE" },
      ],
      durationMs: 4,
      userQuery: "show sales by region as a chart",
    });

    expect(payload.visualType).toBe("chart");
    expect(payload.chartConfig).toMatchObject({
      visualType: "chart",
      type: "bar",
      title: "show sales by region as a chart",
      xKey: "region",
      yKeys: ["total"],
      countMode: false,
    });
  });

  test("keeps table payloads when chart generation is disabled", () => {
    const payload = buildBridgeFinalSqlPayload({
      sql: "SELECT region, total FROM sales_by_region",
      rows: [{ region: "North", total: 10 }],
      columns: [
        { name: "region", type: "VARCHAR" },
        { name: "total", type: "DOUBLE" },
      ],
      durationMs: 3,
      userQuery: "show sales by region as a chart",
      generateChart: false,
    });

    expect(payload.visualType).toBe("table");
    expect(payload.chartConfig).toBeUndefined();
  });

  test("generates a card payload for single value results", () => {
    const payload = buildBridgeFinalSqlPayload({
      sql: "SELECT COUNT(*) AS total_customers FROM customers",
      rows: [{ total_customers: 42 }],
      columns: [{ name: "total_customers", type: "BIGINT" }],
      durationMs: 2,
      userQuery: "how many customers are there?",
    });

    expect(payload.visualType).toBe("card");
    expect(payload.cardConfig).toMatchObject({
      configType: "card",
      title: "how many customers are there?",
      description: "Total Customers: 42",
    });
  });
});
