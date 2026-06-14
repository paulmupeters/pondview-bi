import { describe, expect, test } from "bun:test";
import {
  buildSqlAnalysisVisualState,
  resolveDefaultDashboardVisualType,
} from "@/components/sql-analysis-display/shared-visual-options";
import type { SelectedForCard } from "@/components/sql-analysis-display.types";

describe("sql analysis shared visual options", () => {
  const baseData = {
    stage: "complete" as const,
    query: "select region, revenue from sales",
    columns: [
      { name: "region", type: "TEXT" },
      { name: "revenue", type: "INTEGER" },
    ],
    rows: [
      { region: "NL", revenue: 10 },
      { region: "US", revenue: 20 },
    ],
    summary: {
      totalRows: 2,
      insights: ["Revenue by region"],
    },
    visualType: "chart" as const,
  };

  test("builds dashboard options for complete table results", () => {
    const result = buildSqlAnalysisVisualState({
      data: baseData,
      chartConfig: null,
      cardConfig: null,
      columnsForDialog: baseData.columns.map((column) => ({
        name: column.name,
      })),
      selectedForChart: {
        stage: "complete",
        rows: baseData.rows,
        summary: baseData.summary,
      },
      selectedForTable: {
        stage: "complete",
        columns: baseData.columns,
        rows: baseData.rows,
        summary: baseData.summary,
      },
    });

    expect(result.visualOptions.length).toBeGreaterThan(0);
    expect(result.visualOptions.some((option) => option.type === "table")).toBe(
      true,
    );
  });

  test("defaults dashboard dialog to table when data view is active", () => {
    expect(
      resolveDefaultDashboardVisualType({
        activeView: "table",
        selectedForCard: undefined,
      }),
    ).toBe("table");
  });

  test("defaults dashboard dialog to chart when visual view shows a chart", () => {
    expect(
      resolveDefaultDashboardVisualType({
        activeView: "chart",
        selectedForCard: undefined,
      }),
    ).toBe("chart");
  });

  test("defaults dashboard dialog to card when visual view shows a single value", () => {
    const selectedForCard: SelectedForCard = {
      stage: "complete",
      columnName: "revenue",
      value: 42,
    };

    expect(
      resolveDefaultDashboardVisualType({
        activeView: "chart",
        selectedForCard,
      }),
    ).toBe("card");
  });
});
