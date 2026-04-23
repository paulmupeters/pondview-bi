import { describe, expect, test } from "bun:test";
import type { ProjectArtifactTextFile } from "./export";
import {
  importParsedProjectArtifacts,
  type ProjectArtifactImportDeps,
} from "./import";
import { parseProjectArtifactFileSet } from "./parse";

function jsonFile(path: string, value: unknown): ProjectArtifactTextFile {
  return {
    path,
    content: `${JSON.stringify(value, null, 2)}\n`,
  };
}

describe("project artifact import", () => {
  test("writes parsed project assets through workspace boundaries", async () => {
    const parsed = parseProjectArtifactFileSet([
      jsonFile("pondview/queries/shared/orders.query.json", {
        schemaVersion: 1,
        id: "orders",
        name: "Orders",
      }),
      {
        path: "pondview/queries/shared/orders.sql",
        content: "select * from orders\n",
      },
      jsonFile("pondview/notebooks/order-notes/notebook.json", {
        schemaVersion: 1,
        id: "order-notes",
        title: "Order Notes",
        cells: [
          {
            id: "intro",
            kind: "text",
            file: "cells/intro.md",
          },
        ],
      }),
      {
        path: "pondview/notebooks/order-notes/cells/intro.md",
        content: "Review order trends.\n",
      },
      jsonFile("pondview/dashboards/orders/dashboard.json", {
        schemaVersion: 1,
        id: "orders",
        title: "Orders",
        measures: [],
        visuals: [
          {
            id: "orders-table",
            metadataFile: "visuals/orders-table.visual.json",
            sqlFile: "visuals/orders-table.sql",
          },
        ],
      }),
      jsonFile("pondview/dashboards/orders/visuals/orders-table.visual.json", {
        schemaVersion: 1,
        id: "orders-table",
        config: {
          configType: "table",
          title: "Orders",
          description: "All orders",
        },
      }),
      {
        path: "pondview/dashboards/orders/visuals/orders-table.sql",
        content: "select * from orders\n",
      },
    ]);

    const calls = {
      queries: 0,
      dashboards: 0,
      notebooks: 0,
      deletedNotebookCells: 0,
      cells: 0,
    };
    const deps: ProjectArtifactImportDeps = {
      upsertSavedSqlQuery: async (query) => {
        calls.queries += 1;
        expect(query.id).toBe("project-query:shared:orders");
        return [query];
      },
      replaceDashboardFromProject: async (input) => {
        calls.dashboards += 1;
        expect(input.dashboard.id).toBe("orders");
        expect(input.charts[0]?.id).toBe("orders:visual:orders-table");
        return { id: input.dashboard.id };
      },
      upsertAnalysisNotebook: async (notebook) => {
        calls.notebooks += 1;
        expect(notebook.id).toBe("order-notes");
      },
      deleteAnalysisCellsByNotebookId: async (notebookId) => {
        calls.deletedNotebookCells += 1;
        expect(notebookId).toBe("order-notes");
      },
      upsertAnalysisCell: async (cell) => {
        calls.cells += 1;
        expect(cell.id).toBe("order-notes:cell:intro");
      },
    };

    const imported = await importParsedProjectArtifacts(
      parsed,
      { now: 123 },
      deps,
    );

    expect(imported.dashboards).toEqual([{ id: "orders" }]);
    expect(imported.sharedQueries).toHaveLength(1);
    expect(imported.publishedNotebooks).toHaveLength(1);
    expect(calls).toEqual({
      queries: 1,
      dashboards: 1,
      notebooks: 1,
      deletedNotebookCells: 1,
      cells: 1,
    });
  });
});
