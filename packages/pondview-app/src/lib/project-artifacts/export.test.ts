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
  exportDashboardArtifact,
  exportPublishedNotebookArtifact,
  exportSavedQueryArtifact,
  serializeDashboardArtifact,
  serializePublishedNotebookArtifact,
  serializeSharedQueryArtifact,
  toProjectArtifactId,
} from "./export";

describe("project artifact id normalization", () => {
  test("slugifies arbitrary labels into stable artifact ids", () => {
    expect(toProjectArtifactId("  Revenue (%) Overview  ")).toBe(
      "revenue-overview",
    );
  });

  test("caps generated artifact ids so they remain valid path segments", () => {
    const id = toProjectArtifactId(
      "Note to self lorem dolor irure in dolore laborum veniam deserunt excepteur ullamco lorem deserunt magna adipisicing ipsum consequat anim pariatur eu et elit minim eiusmod",
    );

    expect(id).toBe(
      "note-to-self-lorem-dolor-irure-in-dolore-laborum-veniam-deserunt-excepteur-ullam",
    );
    expect(id.length).toBeLessThanOrEqual(80);
  });
});

describe("dashboard artifact export", () => {
  test("exports dashboards without runtime-only metadata", () => {
    const dashboard: WorkspaceDashboard = {
      id: "dashboard_123",
      title: "Revenue Overview",
      createdAt: 1,
      updatedAt: 2,
      columns: 4,
      autoFitRows: true,
      homeDbIdentifier: "md:analytics",
      homeSqlBackend: "bridge",
      storageStatus: "shared",
    };

    const charts: WorkspaceChart[] = [
      {
        id: "chart_123",
        dashboardId: dashboard.id,
        title: "Monthly Revenue",
        description: null,
        sql: " select month, revenue from monthly_revenue ",
        sourceDescriptor: buildDashboardSourceDescriptor({
          runtimeBackend: "bridge",
          dbIdentifier: "md:analytics",
          catalogContext: "main",
        }),
        sourceDescriptorJson: null,
        snapshotId: "snapshot_1",
        dbIdentifier: "md:analytics",
        catalogContext: "main",
        sqlBackend: "bridge",
        chartConfigJson: JSON.stringify({
          visualType: "chart",
          type: "line",
          title: "Monthly Revenue",
          description: "Revenue trend by month",
          xKey: "month",
          yKeys: ["revenue"],
          legend: false,
          multipleLines: false,
        }),
        semanticQueryJson: '{"runtimeOnly":true}',
        exploreName: "revenue_explore",
        position: 1,
        layoutX: 2,
        layoutY: 3,
        layoutW: 2,
        layoutH: 4,
        createdAt: 3,
        updatedAt: 4,
      },
      {
        id: "chart_456",
        dashboardId: dashboard.id,
        title: "Total Revenue Card",
        description: null,
        sql: " select sum(revenue) as total_revenue from monthly_revenue ",
        sourceDescriptor: buildDashboardSourceDescriptor({
          runtimeBackend: "bridge",
          dbIdentifier: "md:analytics",
          catalogContext: "main",
        }),
        sourceDescriptorJson: null,
        snapshotId: null,
        dbIdentifier: "md:analytics",
        catalogContext: "main",
        sqlBackend: "bridge",
        chartConfigJson: JSON.stringify({
          configType: "card",
          measureId: "total-revenue",
          title: "Total Revenue",
          description: "Current total revenue",
        }),
        semanticQueryJson: null,
        exploreName: null,
        position: 0,
        createdAt: 3,
        updatedAt: 4,
      },
      {
        id: "chart_789",
        dashboardId: dashboard.id,
        title: "Narrative",
        description: null,
        sql: "select 1",
        sourceDescriptor: buildDashboardSourceDescriptor({
          runtimeBackend: "bridge",
          dbIdentifier: "md:analytics",
          catalogContext: "main",
        }),
        sourceDescriptorJson: null,
        snapshotId: null,
        dbIdentifier: "md:analytics",
        catalogContext: "main",
        sqlBackend: "bridge",
        chartConfigJson: JSON.stringify({
          configType: "text",
          title: "Narrative",
          content: "Revenue is **up** this month.",
        }),
        semanticQueryJson: null,
        exploreName: null,
        position: 2,
        createdAt: 3,
        updatedAt: 4,
      },
    ];

    const measures: WorkspaceDashboardMeasure[] = [
      {
        id: "measure_123",
        dashboardId: dashboard.id,
        key: "total_revenue",
        label: "Total Revenue",
        sql: " select sum(revenue) as total_revenue from monthly_revenue ",
        sourceDescriptor: buildDashboardSourceDescriptor({
          runtimeBackend: "bridge",
          dbIdentifier: "md:analytics",
          catalogContext: "main",
        }),
        sourceDescriptorJson: null,
        snapshotId: "snapshot_2",
        dbIdentifier: "md:analytics",
        catalogContext: "main",
        sqlBackend: "bridge",
        createdAt: 5,
        updatedAt: 6,
      },
    ];

    const slicers: WorkspaceDashboardSlicer[] = [
      {
        id: "slicer_1",
        dashboardId: dashboard.id,
        field: "order_date",
        title: "Order Date",
        limit: 50,
        position: 0,
        createdAt: 7,
        updatedAt: 8,
      },
    ];

    const artifact = exportDashboardArtifact({
      dashboard,
      charts,
      measures,
      slicers,
      joins: [
        {
          leftTable: "orders",
          leftColumn: "customer_id",
          rightTable: "customers",
          rightColumn: "id",
          type: "left",
        },
      ],
      resolveSourceRef: ({ dbIdentifier }) =>
        dbIdentifier === "md:analytics" ? "analytics" : null,
    });

    expect(artifact.manifest).toEqual({
      schemaVersion: 1,
      id: "dashboard_123",
      title: "Revenue Overview",
      columns: 4,
      autoFitRows: true,
      sourceRef: "analytics",
      joinsFile: "joins.json",
      slicers: [
        {
          id: "order-date",
          field: "order_date",
          title: "Order Date",
          limit: 50,
        },
      ],
      measures: [
        {
          id: "total-revenue",
          metadataFile: "measures/total-revenue.measure.json",
          sqlFile: "measures/total-revenue.sql",
        },
      ],
      visuals: [
        {
          id: "total-revenue-card",
          metadataFile: "visuals/total-revenue-card.visual.json",
          sqlFile: "visuals/total-revenue-card.sql",
        },
        {
          id: "monthly-revenue",
          metadataFile: "visuals/monthly-revenue.visual.json",
          sqlFile: "visuals/monthly-revenue.sql",
          layout: {
            x: 2,
            y: 3,
            w: 2,
            h: 4,
          },
        },
        {
          id: "narrative",
          metadataFile: "visuals/narrative.visual.json",
          sqlFile: "visuals/narrative.sql",
        },
      ],
    });

    expect(artifact.visuals[0]?.metadata).toEqual({
      schemaVersion: 1,
      id: "total-revenue-card",
      config: {
        configType: "card",
        measureId: "total-revenue",
        title: "Total Revenue",
        description: "Current total revenue",
      },
      catalogContext: "main",
    });

    expect(artifact.visuals[1]?.metadata).toEqual({
      schemaVersion: 1,
      id: "monthly-revenue",
      config: {
        visualType: "chart",
        type: "line",
        title: "Monthly Revenue",
        description: "Revenue trend by month",
        xKey: "month",
        yKeys: ["revenue"],
        legend: false,
        countMode: false,
        multipleLines: false,
      },
      catalogContext: "main",
    });

    expect(artifact.visuals[2]?.metadata).toEqual({
      schemaVersion: 1,
      id: "narrative",
      config: {
        configType: "text",
        title: "Narrative",
        content: "Revenue is **up** this month.",
      },
      catalogContext: "main",
    });

    const files = serializeDashboardArtifact(artifact);
    const manifestFile = files.find((file) =>
      file.path.endsWith("dashboard.json"),
    );
    expect(manifestFile?.content).toContain('"schemaVersion": 1');
    expect(manifestFile?.content).not.toContain("storageStatus");
    expect(files.some((file) => file.content.includes("snapshot_1"))).toBe(
      false,
    );
    expect(
      files.some((file) => file.content.includes("semanticQueryJson")),
    ).toBe(false);
  });

  test("uses a project-safe manifest id for attached dashboard ids", () => {
    const dashboard: WorkspaceDashboard = {
      id: "attached:bridge::sales-catalog:dashboard_123",
      title: "Attached Revenue",
      createdAt: 1,
      updatedAt: 2,
    };

    const artifact = exportDashboardArtifact({
      dashboard,
      charts: [],
    });

    expect(artifact.manifest.id).toBe(
      "attached_bridge_sales-catalog_dashboard_123",
    );
    expect(artifact.manifest.id).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("shared query artifact export", () => {
  test("exports shared query metadata and canonical sql", () => {
    const query: SavedSqlQuery = {
      id: "saved-sql-123",
      name: "Monthly Revenue",
      sql: " select month, revenue from monthly_revenue ",
      createdAt: 1,
      updatedAt: 2,
    };

    const artifact = exportSavedQueryArtifact({
      query,
      group: "Finance",
      sourceRef: "analytics",
      catalogContext: "main",
      description: "Reusable monthly revenue rollup",
      tags: ["revenue", "finance"],
    });

    expect(artifact.metadata).toEqual({
      schemaVersion: 1,
      id: "monthly-revenue",
      name: "Monthly Revenue",
      kind: "query",
      description: "Reusable monthly revenue rollup",
      sourceRef: "analytics",
      catalogContext: "main",
      tags: ["finance", "revenue"],
    });

    const files = serializeSharedQueryArtifact(artifact);
    expect(files[0]?.path).toBe(
      "pondview/queries/finance/monthly-revenue.query.json",
    );
    expect(files[1]?.content).toBe(
      "select month, revenue from monthly_revenue\n",
    );
  });

  test("can represent reusable views under query artifacts", () => {
    const query: SavedSqlQuery = {
      id: "saved-sql-view",
      name: "Revenue By Month View",
      sql: "create or replace view revenue_by_month as select 1 as revenue",
      createdAt: 1,
      updatedAt: 2,
    };

    const artifact = exportSavedQueryArtifact({
      query,
      group: "models",
      kind: "view",
      sourceRef: "analytics",
    });

    expect(artifact.metadata).toMatchObject({
      schemaVersion: 1,
      id: "revenue-by-month-view",
      name: "Revenue By Month View",
      kind: "view",
      sourceRef: "analytics",
    });
  });
});

describe("published notebook artifact export", () => {
  test("exports authored notebook intent and strips execution payload details", () => {
    const notebook: WorkspaceAnalysisNotebook = {
      id: "notebook_123",
      title: "Pricing Review",
      createdAt: 1,
      updatedAt: 2,
    };

    const cells: WorkspaceAnalysisCell[] = [
      {
        id: "cell_text",
        notebookId: notebook.id,
        position: 0,
        kind: "text",
        aiEnabled: false,
        sqlEnabled: false,
        promptText: "## Context\nReview current pricing trends.",
        sqlDraft: null,
        selectedDbIdentifier: null,
        selectedCatalogContext: null,
        status: "complete",
        resultPayloadJson: null,
        createdAt: 1,
        updatedAt: 2,
        lastRunAt: null,
      },
      {
        id: "cell_sql",
        notebookId: notebook.id,
        position: 1,
        kind: "sql",
        aiEnabled: false,
        sqlEnabled: true,
        promptText: "Show monthly revenue",
        sqlDraft: " select month, revenue from monthly_revenue ",
        selectedDbIdentifier: "md:analytics",
        selectedCatalogContext: "main",
        status: "complete",
        resultPayloadJson: JSON.stringify({
          query: "select month, revenue from monthly_revenue",
          dbIdentifier: "md:analytics",
          catalogContext: "main",
          sqlBackend: "bridge",
          visualType: "chart",
          chartConfig: {
            visualType: "chart",
            type: "line",
            title: "Monthly Revenue",
            description: "Revenue trend by month",
            xKey: "month",
            yKeys: ["revenue"],
            legend: false,
            multipleLines: false,
          },
          rows: [{ month: "2025-01", revenue: 100 }],
          columns: [{ name: "month" }, { name: "revenue" }],
          executionTime: 12,
        }),
        createdAt: 3,
        updatedAt: 4,
        lastRunAt: 4,
      },
    ];

    const artifact = exportPublishedNotebookArtifact({
      notebook,
      cells,
      resolveSourceRef: ({ dbIdentifier }) =>
        dbIdentifier === "md:analytics" ? "analytics" : null,
    });

    expect(artifact.manifest).toEqual({
      schemaVersion: 1,
      id: "notebook_123",
      title: "Pricing Review",
      cells: [
        {
          id: "context-review-current-pricing-trends",
          kind: "text",
          file: "cells/context-review-current-pricing-trends.md",
        },
        {
          id: "show-monthly-revenue",
          kind: "sql",
          file: "cells/show-monthly-revenue.sql",
          visualFile: "cells/show-monthly-revenue.visual.json",
          sourceRef: "analytics",
          catalogContext: "main",
        },
      ],
    });

    const files = serializePublishedNotebookArtifact(artifact);
    const visualFile = files.find((file) => file.path.endsWith(".visual.json"));
    expect(visualFile?.content).toContain('"visualType": "chart"');
    expect(visualFile?.content).not.toContain('"rows"');
    expect(visualFile?.content).not.toContain('"executionTime"');

    const sqlFile = files.find((file) => file.path.endsWith(".sql"));
    expect(sqlFile?.content).toBe(
      "select month, revenue from monthly_revenue\n",
    );
  });

  test("caps long notebook cell ids before writing cell content files", () => {
    const notebook: WorkspaceAnalysisNotebook = {
      id: "notebook_123",
      title: "Long Cell Prompts",
      createdAt: 1,
      updatedAt: 2,
    };
    const promptText =
      "Note to self lorem dolor irure in dolore laborum veniam deserunt excepteur ullamco lorem deserunt magna adipisicing ipsum consequat anim pariatur eu et elit minim eiusmod reprehenderit ipsum laborum esse anim laborum est cupidatat";
    const cells: WorkspaceAnalysisCell[] = [0, 1].map((position) => ({
      id: `cell_${position}`,
      notebookId: notebook.id,
      position,
      kind: "text",
      aiEnabled: false,
      sqlEnabled: false,
      promptText,
      sqlDraft: null,
      selectedDbIdentifier: null,
      selectedCatalogContext: null,
      status: "complete",
      resultPayloadJson: null,
      createdAt: position + 1,
      updatedAt: position + 2,
      lastRunAt: null,
    }));

    const artifact = exportPublishedNotebookArtifact({
      notebook,
      cells,
    });

    expect(artifact.manifest.cells.map((cell) => cell.id)).toEqual([
      "note-to-self-lorem-dolor-irure-in-dolore-laborum-veniam-deserunt-excepteur-ullam",
      "note-to-self-lorem-dolor-irure-in-dolore-laborum-veniam-deserunt-excepteur-ull-2",
    ]);
    expect(
      artifact.contentFiles.every(
        (file) => (file.path.split("/").at(-1)?.length ?? 0) <= 83,
      ),
    ).toBe(true);
  });
});
