import { describe, expect, test } from "bun:test";
import { buildDashboardSourceDescriptor } from "@/lib/dashboard/source-descriptor";
import type { SavedSqlQuery } from "@/lib/workspace/saved-sql-queries-repo";
import type {
  WorkspaceAnalysisCell,
  WorkspaceAnalysisNotebook,
  WorkspaceChart,
  WorkspaceDashboard,
  WorkspaceDashboardMeasure,
  WorkspaceDashboardSlicer,
} from "@/lib/workspace/workspace-db";
import {
  exportAllSavedQueryProjectFiles,
  exportDashboardProjectFiles,
  exportPublishedNotebookProjectFiles,
} from "./collect";

describe("project artifact collectors", () => {
  test("exports a live dashboard snapshot through workspace deps", async () => {
    const dashboard: WorkspaceDashboard = {
      id: "dashboard_1",
      title: "Executive Metrics",
      createdAt: 1,
      updatedAt: 2,
      columns: 3,
      autoFitRows: false,
      homeDbIdentifier: "md:analytics",
      homeSqlBackend: "duckdb-http",
    };
    const sourceDescriptor = buildDashboardSourceDescriptor({
      runtimeBackend: "duckdb-http",
      dbIdentifier: "md:analytics",
      catalogContext: "main",
    });
    const charts: WorkspaceChart[] = [
      {
        id: "chart_1",
        dashboardId: dashboard.id,
        title: "Revenue Trend",
        description: null,
        sql: "select month, revenue from monthly_revenue",
        sourceDescriptor,
        sourceDescriptorJson: null,
        snapshotId: "runtime-only",
        dbIdentifier: "md:analytics",
        catalogContext: "main",
        sqlBackend: "duckdb-http",
        chartConfigJson: JSON.stringify({
          visualType: "chart",
          type: "line",
          title: "Revenue Trend",
          description: "Monthly revenue over time",
          xKey: "month",
          yKeys: ["revenue"],
          legend: false,
          multipleLines: false,
        }),
        semanticQueryJson: null,
        exploreName: null,
        position: 0,
        createdAt: 3,
        updatedAt: 4,
      },
    ];
    const measures: WorkspaceDashboardMeasure[] = [
      {
        id: "measure_1",
        dashboardId: dashboard.id,
        key: "total_revenue",
        label: "Total Revenue",
        sql: "select sum(revenue) as total_revenue from monthly_revenue",
        sourceDescriptor,
        sourceDescriptorJson: null,
        snapshotId: null,
        dbIdentifier: "md:analytics",
        catalogContext: "main",
        sqlBackend: "duckdb-http",
        createdAt: 5,
        updatedAt: 6,
      },
    ];
    const slicers: WorkspaceDashboardSlicer[] = [
      {
        id: "slicer_1",
        dashboardId: dashboard.id,
        field: "region",
        title: "Region",
        limit: 25,
        position: 0,
        createdAt: 7,
        updatedAt: 8,
      },
    ];

    const files = await exportDashboardProjectFiles(
      {
        dashboardId: dashboard.id,
        sourceMappings: [
          {
            sourceRef: "analytics",
            dbIdentifier: "md:analytics",
            sqlBackend: "duckdb-http",
          },
        ],
        requireSourceRefs: true,
      },
      {
        getDashboardWithCharts: async () => ({ dashboard, charts }),
        listMeasuresByDashboard: async () => measures,
        listSlicersByDashboard: async () => slicers,
        listJoinDefsByDashboard: async () => [],
      },
    );

    const manifest = files.find((file) => file.path.endsWith("dashboard.json"));
    expect(manifest?.content).toContain('"sourceRef": "analytics"');
    expect(files.some((file) => file.content.includes("runtime-only"))).toBe(
      false,
    );
  });

  test("fails dashboard export when required source mappings are missing", async () => {
    const dashboard: WorkspaceDashboard = {
      id: "dashboard_1",
      title: "Executive Metrics",
      createdAt: 1,
      updatedAt: 2,
      homeDbIdentifier: "md:analytics",
      homeSqlBackend: "duckdb-http",
    };

    await expect(
      exportDashboardProjectFiles(
        {
          dashboardId: dashboard.id,
          requireSourceRefs: true,
        },
        {
          getDashboardWithCharts: async () => ({ dashboard, charts: [] }),
          listMeasuresByDashboard: async () => [],
          listSlicersByDashboard: async () => [],
          listJoinDefsByDashboard: async () => [],
        },
      ),
    ).rejects.toThrow(
      'Missing project sourceRef mapping for dashboard "Executive Metrics".',
    );
  });

  test("exports all saved queries under queries", async () => {
    const queries: SavedSqlQuery[] = [
      {
        id: "query_1",
        name: "Revenue View",
        sql: "create view revenue_view as select 1 as revenue",
        createdAt: 1,
        updatedAt: 2,
      },
    ];

    const files = await exportAllSavedQueryProjectFiles(
      {
        group: "models",
        kind: "view",
        sourceRef: "analytics",
      },
      {
        listSavedSqlQueries: async () => queries,
      },
    );

    expect(files.map((file) => file.path)).toEqual([
      "pondview/queries/models/revenue-view.query.json",
      "pondview/queries/models/revenue-view.sql",
    ]);
    expect(files[0]?.content).toContain('"kind": "view"');
  });

  test("exports published notebooks from notebook snapshots", async () => {
    const notebook: WorkspaceAnalysisNotebook = {
      id: "notebook_1",
      title: "Revenue Notes",
      createdAt: 1,
      updatedAt: 2,
    };
    const cells: WorkspaceAnalysisCell[] = [
      {
        id: "cell_1",
        notebookId: notebook.id,
        position: 0,
        kind: "text",
        aiEnabled: false,
        sqlEnabled: false,
        promptText: "Explain the current revenue trend.",
        sqlDraft: null,
        selectedDbIdentifier: null,
        selectedCatalogContext: null,
        status: "idle",
        resultPayloadJson: null,
        createdAt: 3,
        updatedAt: 4,
        lastRunAt: null,
      },
    ];

    const files = await exportPublishedNotebookProjectFiles(
      { notebookId: notebook.id },
      {
        getAnalysisNotebookSnapshot: async () => ({
          notebook,
          cells,
          cellEntriesByCellId: new Map(),
        }),
      },
    );

    expect(files.map((file) => file.path)).toEqual([
      "pondview/notebooks/revenue-notes/notebook.json",
      "pondview/notebooks/revenue-notes/cells/explain-the-current-revenue-trend.md",
    ]);
  });
});
