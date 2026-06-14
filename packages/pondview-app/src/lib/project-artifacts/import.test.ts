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
      listSavedSqlQueries: async () => [],
      upsertSavedSqlQuery: async (query) => {
        calls.queries += 1;
        expect(query.id).toBe("project-query:shared:orders");
        return [query];
      },
      deleteSavedSqlQuery: async () => [],
      listDashboards: async () => [],
      replaceDashboardFromProject: async (input) => {
        calls.dashboards += 1;
        expect(input.dashboard.id).toBe("orders");
        expect(input.charts[0]?.id).toBe("orders:visual:orders-table");
        return { id: input.dashboard.id };
      },
      deleteDashboard: async () => ({ deleted: false }),
      listAnalysisNotebooks: async () => [],
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
      deleteAnalysisNotebook: async () => undefined,
    };

    const imported = await importParsedProjectArtifacts(
      parsed,
      { now: 123 },
      deps,
    );

    expect(imported.dashboards).toEqual([{ id: "orders" }]);
    expect(imported.sharedQueries).toHaveLength(1);
    expect(imported.publishedNotebooks).toHaveLength(1);
    expect(imported.reconciliation).toEqual({
      deletedDashboardIds: [],
      deletedSavedQueryIds: [],
      deletedNotebookIds: [],
    });
    expect(calls).toEqual({
      queries: 1,
      dashboards: 1,
      notebooks: 1,
      deletedNotebookCells: 1,
      cells: 1,
    });
  });

  test("reconciles stale project-owned assets that are absent from the import", async () => {
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
        cells: [],
      }),
      jsonFile("pondview/dashboards/orders/dashboard.json", {
        schemaVersion: 1,
        id: "orders",
        title: "Orders",
        measures: [],
        visuals: [],
      }),
    ]);

    const deleted = {
      queries: [] as string[],
      dashboards: [] as string[],
      notebooks: [] as string[],
    };
    const deps: ProjectArtifactImportDeps = {
      listSavedSqlQueries: async () => [
        {
          id: "project-query:shared:orders",
          name: "Orders",
          sql: "select * from orders",
          projectPath: "pondview/queries/shared/orders.query.json",
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "project-query:shared:legacy",
          name: "Legacy",
          sql: "select * from legacy",
          projectPath: "pondview/queries/shared/legacy.query.json",
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "local-query",
          name: "Local only",
          sql: "select 1",
          projectPath: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      upsertSavedSqlQuery: async (query) => [query],
      deleteSavedSqlQuery: async (queryId) => {
        deleted.queries.push(queryId);
        return [];
      },
      listDashboards: async () => [
        {
          id: "orders",
          title: "Orders",
          projectPath: "pondview/dashboards/orders",
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "legacy-dashboard",
          title: "Legacy Dashboard",
          projectPath: "pondview/dashboards/legacy-dashboard",
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "local-dashboard",
          title: "Local Dashboard",
          projectPath: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      replaceDashboardFromProject: async (input) => ({
        id: input.dashboard.id,
      }),
      deleteDashboard: async (dashboardId) => {
        deleted.dashboards.push(dashboardId);
        return { deleted: true };
      },
      listAnalysisNotebooks: async () => [
        {
          id: "order-notes",
          title: "Order Notes",
          projectPath: "pondview/notebooks/order-notes",
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "legacy-notebook",
          title: "Legacy Notebook",
          projectPath: "pondview/notebooks/legacy-notebook",
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "local-notebook",
          title: "Local Notebook",
          projectPath: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      upsertAnalysisNotebook: async () => undefined,
      deleteAnalysisCellsByNotebookId: async () => undefined,
      upsertAnalysisCell: async () => undefined,
      deleteAnalysisNotebook: async (notebookId) => {
        deleted.notebooks.push(notebookId);
      },
    };

    const imported = await importParsedProjectArtifacts(parsed, {}, deps);

    expect(imported.reconciliation).toEqual({
      deletedDashboardIds: ["legacy-dashboard"],
      deletedSavedQueryIds: ["project-query:shared:legacy"],
      deletedNotebookIds: ["legacy-notebook"],
    });
    expect(deleted).toEqual({
      queries: ["project-query:shared:legacy"],
      dashboards: ["legacy-dashboard"],
      notebooks: ["legacy-notebook"],
    });
  });
});
