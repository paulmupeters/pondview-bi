import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  resolveSqlAnalysisActiveView,
  SqlAnalysisDisplay,
} from "@/components/sql-analysis-display";

describe("SqlAnalysisDisplay", () => {
  test("renders without an artifact mutation provider in non-chat contexts", () => {
    expect(() =>
      renderToStaticMarkup(
        <SqlAnalysisDisplay
          data={null}
          stage="loading"
          showStageIndicator={false}
          onConfigChange={() => {}}
        />,
      ),
    ).not.toThrow();
  });

  test("prefers the incoming table view while a card result transitions to tabular data", () => {
    expect(
      resolveSqlAnalysisActiveView({
        activeView: "chart",
        currentQuery: "select * from t",
        previousQuery: "select 1",
        currentVisualType: "table",
        previousVisualType: "card",
      }),
    ).toBe("table");
  });

  test("prefers the incoming chart view while a table result transitions to a card", () => {
    expect(
      resolveSqlAnalysisActiveView({
        activeView: "table",
        currentQuery: "select count(*) from t",
        previousQuery: "select * from t",
        currentVisualType: "card",
        previousVisualType: "table",
      }),
    ).toBe("chart");
  });
});
