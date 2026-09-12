import { describe, expect, test } from "bun:test";
import {
  buildQueryChartPoints,
  isNumericQueryColumn,
  queryChartNumericColumns,
  queryChartTitle,
  suggestQueryChart,
} from "./query-results-chart-model";

const rows = [
  { month: "2026-01-01", region: "North", revenue: 12 },
  { month: "2026-02-01", region: "South", revenue: "30" },
  { month: "2026-03-01", region: "West", revenue: null },
];

describe("MCP App query chart model", () => {
  test("recognizes numeric columns from DuckDB metadata or values", () => {
    expect(
      isNumericQueryColumn({ name: "revenue", type: "DECIMAL(12,2)" }, rows),
    ).toBe(true);
    expect(
      isNumericQueryColumn({ name: "region", type: "VARCHAR" }, rows),
    ).toBe(false);
    expect(
      queryChartNumericColumns({
        columns: [{ name: "region" }, { name: "revenue" }],
        rows,
      }).map((column) => column.name),
    ).toEqual(["revenue"]);
  });

  test("suggests a temporal line chart and a categorical bar chart", () => {
    expect(
      suggestQueryChart({
        columns: [
          { name: "month", type: "DATE" },
          { name: "revenue", type: "DOUBLE" },
        ],
        rows,
        rowCount: rows.length,
      }),
    ).toEqual({ type: "line", xKey: "month", yKey: "revenue" });

    expect(
      suggestQueryChart({
        columns: [
          { name: "region", type: "VARCHAR" },
          { name: "revenue", type: "DOUBLE" },
        ],
        rows,
        rowCount: rows.length,
      }),
    ).toEqual({ type: "bar", xKey: "region", yKey: "revenue" });
  });

  test("builds bounded chart points and skips non-numeric values", () => {
    expect(
      buildQueryChartPoints(
        rows,
        {
          type: "bar",
          xKey: "region",
          yKey: "revenue",
        },
        2,
      ),
    ).toEqual([
      { id: "North-1", label: "North", value: 12 },
      { id: "South-1", label: "South", value: 30 },
    ]);
    expect(
      queryChartTitle({ type: "bar", xKey: "region", yKey: "revenue" }),
    ).toBe("revenue by region");
  });
});
