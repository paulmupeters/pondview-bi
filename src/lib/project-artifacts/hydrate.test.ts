import { describe, expect, test } from "bun:test";
import type { ProjectArtifactTextFile } from "./export";
import { hydrateProjectArtifacts } from "./hydrate";
import { parseProjectArtifactFileSet } from "./parse";

function jsonFile(path: string, value: unknown): ProjectArtifactTextFile {
  return {
    path,
    content: `${JSON.stringify(value, null, 2)}\n`,
  };
}

describe("project artifact hydration", () => {
  test("hydrates parsed project assets into workspace models", () => {
    const parsed = parseProjectArtifactFileSet([
      jsonFile("pondview/project.json", {
        schemaVersion: 1,
        name: "Revenue Analytics",
        defaultSourceRef: "analytics",
      }),
      jsonFile("pondview.sources.local.json", {
        schemaVersion: 1,
        bindings: {
          analytics: {
            runtimeBackend: "bridge",
            dbIdentifier: "md:analytics",
            catalogContext: "main",
          },
        },
      }),
      jsonFile("pondview/dashboards/revenue/dashboard.json", {
        schemaVersion: 1,
        id: "revenue",
        title: "Revenue",
        columns: 4,
        sourceRef: "analytics",
        joinsFile: "joins.json",
        slicers: [{ id: "region", field: "region", title: "Region" }],
        measures: [
          {
            id: "total-revenue",
            metadataFile: "measures/total-revenue.measure.json",
            sqlFile: "measures/total-revenue.sql",
          },
        ],
        visuals: [
          {
            id: "revenue-table",
            metadataFile: "visuals/revenue-table.visual.json",
            sqlFile: "visuals/revenue-table.sql",
          },
        ],
      }),
      jsonFile("pondview/dashboards/revenue/joins.json", {
        schemaVersion: 1,
        joins: [
          {
            leftTable: "orders",
            leftColumn: "customer_id",
            rightTable: "customers",
            rightColumn: "id",
            type: "left",
          },
        ],
      }),
      jsonFile(
        "pondview/dashboards/revenue/measures/total-revenue.measure.json",
        {
          schemaVersion: 1,
          id: "total-revenue",
          key: "total_revenue",
          label: "Total Revenue",
        },
      ),
      {
        path: "pondview/dashboards/revenue/measures/total-revenue.sql",
        content: "select sum(revenue) as total_revenue from orders\n",
      },
      jsonFile(
        "pondview/dashboards/revenue/visuals/revenue-table.visual.json",
        {
          schemaVersion: 1,
          id: "revenue-table",
          config: {
            configType: "table",
            title: "Revenue Table",
            description: "Revenue by order",
          },
        },
      ),
      {
        path: "pondview/dashboards/revenue/visuals/revenue-table.sql",
        content: "select revenue from orders\n",
      },
      jsonFile("pondview/queries/views/monthly-revenue.query.json", {
        schemaVersion: 1,
        id: "monthly-revenue",
        name: "Monthly Revenue",
        kind: "view",
        sourceRef: "analytics",
        tags: ["finance"],
      }),
      {
        path: "pondview/queries/views/monthly-revenue.sql",
        content: "create view monthly_revenue as select 1 as revenue\n",
      },
      jsonFile("pondview/notebooks/revenue-notes/notebook.json", {
        schemaVersion: 1,
        id: "revenue-notes",
        title: "Revenue Notes",
        cells: [
          {
            id: "summary",
            kind: "text",
            file: "cells/summary.md",
          },
          {
            id: "top-customers",
            kind: "sql",
            file: "cells/top-customers.sql",
            visualFile: "cells/top-customers.visual.json",
            sourceRef: "analytics",
          },
        ],
      }),
      {
        path: "pondview/notebooks/revenue-notes/cells/summary.md",
        content: "Revenue is growing.\n",
      },
      {
        path: "pondview/notebooks/revenue-notes/cells/top-customers.sql",
        content: "select customer, revenue from customers\n",
      },
      jsonFile(
        "pondview/notebooks/revenue-notes/cells/top-customers.visual.json",
        {
          configType: "table",
          title: "Top Customers",
          description: "Highest value customers",
        },
      ),
    ]);

    const hydrated = hydrateProjectArtifacts(parsed, { now: 123 });

    expect(hydrated.dashboards[0]?.dashboard).toMatchObject({
      id: "revenue",
      title: "Revenue",
      columns: 4,
      homeDbIdentifier: "md:analytics",
      homeSqlBackend: "bridge",
      storageStatus: "shared",
      projectPath: "pondview/dashboards/revenue",
    });
    expect(hydrated.dashboards[0]?.charts[0]).toMatchObject({
      id: "revenue:visual:revenue-table",
      dbIdentifier: "md:analytics",
      catalogContext: null,
      snapshotId: null,
    });
    expect(hydrated.dashboards[0]?.joins).toHaveLength(1);
    expect(hydrated.sharedQueries[0]).toMatchObject({
      id: "project-query:views:monthly-revenue",
      kind: "view",
      sourceRef: "analytics",
      tags: ["finance"],
    });
    expect(hydrated.publishedNotebooks[0]?.cells).toHaveLength(2);
    expect(hydrated.publishedNotebooks[0]?.notebook.projectPath).toBe(
      "pondview/notebooks/revenue-notes",
    );
    expect(hydrated.publishedNotebooks[0]?.cells[1]).toMatchObject({
      id: "revenue-notes:cell:top-customers",
      sqlDraft: "select customer, revenue from customers",
      selectedDbIdentifier: "md:analytics",
    });
    expect(
      hydrated.publishedNotebooks[0]?.cells[1]?.resultPayloadJson,
    ).toContain('"tableConfig"');
  });
});
