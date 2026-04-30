import { describe, expect, test } from "bun:test";
import type { ProjectArtifactTextFile } from "./export";
import {
  collectProjectArtifactSourceRefs,
  parseProjectArtifactFileSet,
} from "./parse";

function jsonFile(path: string, value: unknown): ProjectArtifactTextFile {
  return {
    path,
    content: `${JSON.stringify(value, null, 2)}\n`,
  };
}

describe("project artifact parsing", () => {
  test("parses committed dashboard, query, and notebook files", () => {
    const files: ProjectArtifactTextFile[] = [
      jsonFile("pondview/project.json", {
        schemaVersion: 1,
        name: "Revenue Analytics",
        defaultSourceRef: "analytics",
      }),
      jsonFile("pondview/sources/registry.json", {
        schemaVersion: 1,
        sources: [{ id: "analytics", kind: "motherduck" }],
      }),
      jsonFile("pondview/dashboards/revenue/dashboard.json", {
        schemaVersion: 1,
        id: "revenue",
        title: "Revenue",
        sourceRef: "analytics",
        joinsFile: "joins.json",
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
      jsonFile("pondview/queries/shared/monthly-revenue.query.json", {
        schemaVersion: 1,
        id: "monthly-revenue",
        name: "Monthly Revenue",
        kind: "query",
        sourceRef: "analytics",
      }),
      {
        path: "pondview/queries/shared/monthly-revenue.sql",
        content: "select month, revenue from monthly_revenue\n",
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
            sourceRef: "analytics",
          },
        ],
      }),
      {
        path: "pondview/notebooks/revenue-notes/cells/summary.md",
        content: "Revenue is growing.\n",
      },
    ];

    const parsed = parseProjectArtifactFileSet(files, {
      validateSourceRefs: true,
    });

    expect(parsed.projectManifest?.name).toBe("Revenue Analytics");
    expect(parsed.dashboards).toHaveLength(1);
    expect(parsed.sharedQueries[0]?.metadata.kind).toBe("query");
    expect(parsed.publishedNotebooks[0]?.contentFiles[0]?.content).toBe(
      "Revenue is growing.\n",
    );
    expect(collectProjectArtifactSourceRefs(parsed)).toEqual(["analytics"]);
  });

  test("reports missing referenced files", () => {
    expect(() =>
      parseProjectArtifactFileSet([
        jsonFile("pondview/queries/shared/monthly-revenue.query.json", {
          schemaVersion: 1,
          id: "monthly-revenue",
          name: "Monthly Revenue",
        }),
      ]),
    ).toThrow(
      'Missing project artifact file "pondview/queries/shared/monthly-revenue.sql".',
    );
  });

  test("validates source refs against the tracked registry", () => {
    expect(() =>
      parseProjectArtifactFileSet(
        [
          jsonFile("pondview/sources/registry.json", {
            schemaVersion: 1,
            sources: [{ id: "analytics", kind: "motherduck" }],
          }),
          jsonFile("pondview/queries/shared/monthly-revenue.query.json", {
            schemaVersion: 1,
            id: "monthly-revenue",
            name: "Monthly Revenue",
            sourceRef: "warehouse",
          }),
          {
            path: "pondview/queries/shared/monthly-revenue.sql",
            content: "select 1\n",
          },
        ],
        { validateSourceRefs: true },
      ),
    ).toThrow("Unknown project sourceRef values: warehouse.");
  });
});
