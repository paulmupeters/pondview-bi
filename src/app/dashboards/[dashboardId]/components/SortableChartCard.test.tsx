import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { TableConfig } from "@/lib/types";
import type { DashboardChart } from "../types";
import { DashboardChartCard } from "./SortableChartCard";

const chart: DashboardChart = {
  id: "chart_1",
  title: "Customers",
  description: null,
  sql: "select * from customers",
  dbIdentifier: null,
  chartConfigJson: "{}",
  position: 0,
  createdAt: 1,
  updatedAt: 2,
};

const tableConfig: TableConfig = {
  configType: "table",
  title: "Customers",
  description: "Customer rows",
};

describe("DashboardChartCard", () => {
  test("constrains table results so dashboard tiles can scroll instead of overflowing", () => {
    const markup = renderToStaticMarkup(
      <DashboardChartCard
        chart={chart}
        config={tableConfig}
        rows={[
          { id: 1, name: "Ada" },
          { id: 2, name: "Grace" },
        ]}
        measures={{}}
        measureOptions={[]}
        onConfigChange={async () => undefined}
        onDelete={async () => undefined}
        expandedSqlChartId={null}
        onToggleSql={() => undefined}
        onSqlUpdate={async () => undefined}
        onSelect={() => undefined}
      />,
    );

    expect(markup).toContain("h-full min-h-0 flex-col overflow-hidden");
    expect(markup).toContain(
      "flex min-h-0 w-full flex-1 overflow-hidden",
    );
    expect(markup).toContain("flex-1 overflow-auto rounded-md border w-full");
  });
});
