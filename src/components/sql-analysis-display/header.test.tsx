import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SqlAnalysisHeader } from "@/components/sql-analysis-display/header";
import { Button } from "@/components/ui/button";

describe("SqlAnalysisHeader", () => {
  test("renders add to dashboard in the shared header row", () => {
    const markup = renderToStaticMarkup(
      <SqlAnalysisHeader
        activeView="chart"
        canShowTable={true}
        onActiveViewChange={() => {}}
        canShowVisualOptionsToggle={true}
        showVisualOptions={false}
        onVisualOptionsToggle={() => {}}
        addToDashboardTrigger={
          <Button variant="outline" size="sm">
            Add to dashboard
          </Button>
        }
        showAddToChatButton={false}
        onAddToChatClick={() => {}}
        showClearButton={false}
        onClear={() => {}}
      />,
    );

    expect(markup).toContain("Data");
    expect(markup).toContain("Visual");
    expect(markup).toContain("Add to dashboard");
    expect(markup).toContain("Visual options");
  });

  test("only shows visual options when visual mode controls are enabled", () => {
    const markup = renderToStaticMarkup(
      <SqlAnalysisHeader
        activeView="table"
        canShowTable={true}
        onActiveViewChange={() => {}}
        canShowVisualOptionsToggle={false}
        showVisualOptions={false}
        onVisualOptionsToggle={() => {}}
        addToDashboardTrigger={
          <Button variant="outline" size="sm">
            Add to dashboard
          </Button>
        }
        showAddToChatButton={false}
        onAddToChatClick={() => {}}
        showClearButton={false}
        onClear={() => {}}
      />,
    );

    expect(markup).toContain("Add to dashboard");
    expect(markup).not.toContain("Visual options");
  });
});
