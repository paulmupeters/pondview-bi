import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SqlAnalysisDisplay } from "@/components/sql-analysis-display";

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
});
