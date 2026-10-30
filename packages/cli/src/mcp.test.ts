import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { BridgeQueryResponse } from "@pondview/bridge-protocol";
import {
  createBridgeMcpServer,
  createBridgeMcpToolHandlers,
  resolveMcpDatabasePath,
  toToolResult,
} from "./mcp";
import { DuckDbRuntime } from "./runtime/duckdb-runtime";

const runtimes: DuckDbRuntime[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createRuntime(): DuckDbRuntime {
  const runtime = new DuckDbRuntime();
  runtimes.push(runtime);
  return runtime;
}

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "pondview-mcp-"));
  tempDirs.push(dir);
  return dir;
}

function queryResponse(): BridgeQueryResponse {
  return {
    columns: [],
    rows: [],
    rowCount: 0,
  };
}

async function createSeededRuntime(): Promise<DuckDbRuntime> {
  const runtime = createRuntime();
  await runtime.query("CREATE TABLE users (id INTEGER, name VARCHAR);");
  await runtime.query(
    "INSERT INTO users VALUES (1, 'Ada'), (2, 'Grace'), (3, 'Katherine'), (4, 'Evelyn'), (5, 'Mary'), (6, 'Annie');",
  );
  await runtime.query("CREATE SCHEMA pondview;");
  await runtime.query("CREATE TABLE pondview.internal_state (id INTEGER);");
  return runtime;
}

describe("bridge MCP tools", () => {
  test("handlers accept a query-only bridge client runtime", async () => {
    const calls: Array<{ sql: string; limit?: number }> = [];
    const runtime = {
      query: async (
        sql: string,
        limit?: number,
      ): Promise<BridgeQueryResponse> => {
        calls.push({ sql, limit });
        return queryResponse();
      },
    };
    const tools = createBridgeMcpToolHandlers(runtime);

    await tools.executeSql("SELECT 42 AS answer", 12);

    expect(calls).toEqual([{ sql: "SELECT 42 AS answer", limit: 12 }]);
  });

  test("resolves the project default bridge source database", async () => {
    const projectDir = createTempDir();
    const expectedPath = join(projectDir, "data", "agent.duckdb");
    mkdirSync(join(projectDir, "pondview"), { recursive: true });
    writeFileSync(
      join(projectDir, "pondview", "project.json"),
      JSON.stringify({
        schemaVersion: 1,
        name: "MCP Project",
        defaultSourceRef: "analytics",
        sourceBindings: {
          analytics: {
            runtimeBackend: "bridge",
            dbIdentifier: "data/agent.duckdb",
            catalogContext: "main",
          },
        },
      }),
    );

    const databasePath = resolveMcpDatabasePath({ projectDir });
    const runtime = new DuckDbRuntime({ databasePath });
    runtimes.push(runtime);
    await runtime.query("CREATE TABLE mcp_resolution (id INTEGER);");

    expect(databasePath).toBe(expectedPath);
    expect(existsSync(expectedPath)).toBe(true);
  });

  test("database path overrides project default source resolution", () => {
    const projectDir = createTempDir();
    const overridePath = join(projectDir, "override.duckdb");
    mkdirSync(join(projectDir, "pondview"), { recursive: true });
    writeFileSync(
      join(projectDir, "pondview", "project.json"),
      JSON.stringify({
        schemaVersion: 1,
        name: "MCP Project",
        defaultSourceRef: "analytics",
        sourceBindings: {
          analytics: {
            runtimeBackend: "bridge",
            dbIdentifier: "data/agent.duckdb",
            catalogContext: "main",
          },
        },
      }),
    );

    expect(
      resolveMcpDatabasePath({ databasePath: overridePath, projectDir }),
    ).toBe(resolve(overridePath));
  });

  test("list_tables hides internal runtime schemas", async () => {
    const runtime = await createSeededRuntime();
    const tools = createBridgeMcpToolHandlers(runtime);

    const result = await tools.listTables();

    expect(result.tables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table_name: "users",
          table_reference: expect.stringContaining("users"),
        }),
      ]),
    );
    expect(result.tables).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table_schema: "pondview" }),
      ]),
    );
  });

  test("get_table_schema resolves quoted and unquoted references", async () => {
    const runtime = await createSeededRuntime();
    const tools = createBridgeMcpToolHandlers(runtime);

    const unquoted = await tools.getTableSchema("users");
    const quoted = await tools.getTableSchema('"users"');

    expect(unquoted.table).toBe(quoted.table);
    expect(unquoted.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ column_name: "id" }),
        expect.objectContaining({ column_name: "name" }),
      ]),
    );
    expect(unquoted.sampleRows).toHaveLength(5);
  });

  test("run_preview caps rows at 5", async () => {
    const runtime = await createSeededRuntime();
    const tools = createBridgeMcpToolHandlers(runtime);

    const result = await tools.runPreview("users");

    expect(result.rows).toHaveLength(5);
    expect(result.rowCount).toBe(5);
  });

  test("execute_sql allows SELECT by default", async () => {
    const runtime = await createSeededRuntime();
    const tools = createBridgeMcpToolHandlers(runtime);

    const result = await tools.executeSql(
      "SELECT count(*) AS total FROM users",
    );

    expect(result.rows).toEqual([{ total: "6" }]);
  });

  test("execute_sql rejects write statements by default", async () => {
    const runtime = await createSeededRuntime();
    const tools = createBridgeMcpToolHandlers(runtime);
    const statements = [
      "CREATE TABLE blocked (id INTEGER)",
      "INSERT INTO users VALUES (7, 'Blocked')",
      "UPDATE users SET name = 'Blocked' WHERE id = 1",
      "DELETE FROM users WHERE id = 1",
      "ATTACH 'blocked.duckdb' AS blocked",
      "COPY users TO 'blocked.csv'",
    ];

    for (const sql of statements) {
      await expect(tools.executeSql(sql)).rejects.toThrow(
        "execute_sql only allows read-only SQL by default",
      );
    }
  });

  test("execute_sql permits write statements with allowWriteSql", async () => {
    const runtime = await createSeededRuntime();
    const tools = createBridgeMcpToolHandlers(runtime, {
      allowWriteSql: true,
    });

    await tools.executeSql("CREATE TABLE allowed (id INTEGER)");
    await tools.executeSql("INSERT INTO allowed VALUES (1)");
    const result = await tools.executeSql("SELECT * FROM allowed");

    expect(result.rows).toEqual([{ id: 1 }]);
  });

  test("create_dashboard creates metadata and returns an openable URL", async () => {
    const runtime = createRuntime();
    const tools = createBridgeMcpToolHandlers(runtime, {
      appUrl: "http://127.0.0.1:17818/",
    });

    const result = await tools.createDashboard({
      id: "sales",
      title: "Sales",
    });
    const dashboards = await runtime.query(
      "SELECT id, title FROM pondview.dashboards",
    );

    expect(result).toMatchObject({
      dashboardId: "sales",
      url: "http://127.0.0.1:17818/dashboards/view?id=sales&pondviewMode=dashboard",
    });
    expect(dashboards.rows).toEqual([{ id: "sales", title: "Sales" }]);
  });

  test("list_dashboards returns dashboard summaries and URLs", async () => {
    const runtime = await createSeededRuntime();
    const tools = createBridgeMcpToolHandlers(runtime, {
      appUrl: "http://127.0.0.1:17818/",
    });

    await tools.createVisual({
      dashboardId: "sales",
      dashboardTitle: "Sales",
      title: "Users by id",
      sql: "SELECT id, name FROM users ORDER BY id",
      visualType: "table",
    });
    const result = await tools.listDashboards();
    const dashboard = result.dashboards[0] ?? {};

    expect(result.count).toBe(1);
    expect(dashboard).toMatchObject({
      id: "sales",
      title: "Sales",
      url: "http://127.0.0.1:17818/dashboards/view?id=sales&pondviewMode=dashboard",
    });
    expect(String(dashboard.chart_count)).toBe("1");
  });

  test("get_dashboard returns dashboard metadata and child rows", async () => {
    const runtime = await createSeededRuntime();
    const tools = createBridgeMcpToolHandlers(runtime);

    await tools.createVisual({
      dashboardId: "sales",
      dashboardTitle: "Sales",
      title: "Users by id",
      sql: "SELECT id, name FROM users ORDER BY id",
      visualType: "table",
    });
    const result = await tools.getDashboard("sales");
    const dashboard = result.dashboard as Record<string, unknown>;
    const charts = result.charts as Array<Record<string, unknown>>;

    expect(dashboard).toMatchObject({
      id: "sales",
      title: "Sales",
      url: "http://127.0.0.1:17817/dashboards/view?id=sales&pondviewMode=dashboard",
    });
    expect(charts).toHaveLength(1);
    expect(charts[0]).toMatchObject({
      dashboard_id: "sales",
      title: "Users by id",
      sql: "SELECT id, name FROM users ORDER BY id",
    });
    expect(charts[0]?.visualUrl).toBeUndefined();
    expect(result.measures).toEqual([]);
    expect(result.slicers).toEqual([]);
    expect(result.joinDefs).toEqual([]);
  });

  test("list_visuals returns visual summaries and standalone URLs", async () => {
    const runtime = await createSeededRuntime();
    const tools = createBridgeMcpToolHandlers(runtime, {
      appUrl: "http://127.0.0.1:17818/",
    });

    const salesVisual = await tools.createVisual({
      dashboardId: "sales",
      dashboardTitle: "Sales",
      title: "Users by id",
      sql: "SELECT id, name FROM users ORDER BY id",
      visualType: "bar",
      xKey: "name",
      yKeys: ["id"],
    });
    await tools.createTextCard({
      dashboardId: "ops",
      dashboardTitle: "Ops",
      title: "Ops Notes",
      content: "**Watch** the queue.",
    });

    const allResult = await tools.listVisuals();
    const salesResult = await tools.listVisuals("sales");

    expect(allResult.count).toBe(2);
    expect(salesResult.count).toBe(1);
    expect(salesResult.visuals[0]).toMatchObject({
      id: salesVisual.visualId,
      visualId: salesVisual.visualId,
      dashboardId: "sales",
      dashboardTitle: "Sales",
      title: "Users by id",
      configType: "chart",
      type: "bar",
      dashboardUrl:
        "http://127.0.0.1:17818/dashboards/view?id=sales&pondviewMode=dashboard",
      visualUrl: `http://127.0.0.1:17818/visual/${salesVisual.visualId}?pondviewMode=dashboard`,
    });
  });

  test("get_visual returns one visual or an empty standalone URL result", async () => {
    const runtime = await createSeededRuntime();
    const tools = createBridgeMcpToolHandlers(runtime);

    const created = await tools.createVisual({
      dashboardId: "sales",
      dashboardTitle: "Sales",
      title: "Users by id",
      sql: "SELECT id, name FROM users ORDER BY id",
      visualType: "table",
    });

    const found = await tools.getVisual(created.visualId);
    const missing = await tools.getVisual("missing");

    expect(found).toMatchObject({
      visualId: created.visualId,
      url: `http://127.0.0.1:17817/visual/${created.visualId}?pondviewMode=dashboard`,
      visualUrl: `http://127.0.0.1:17817/visual/${created.visualId}?pondviewMode=dashboard`,
    });
    expect(found.visual).toMatchObject({
      id: created.visualId,
      dashboard_id: "sales",
      title: "Users by id",
      configType: "table",
      type: null,
      dashboardUrl:
        "http://127.0.0.1:17817/dashboards/view?id=sales&pondviewMode=dashboard",
      visualUrl: `http://127.0.0.1:17817/visual/${created.visualId}?pondviewMode=dashboard`,
    });
    expect(missing).toEqual({
      visual: null,
      visualId: "missing",
      url: "http://127.0.0.1:17817/visual/missing?pondviewMode=dashboard",
      visualUrl: "http://127.0.0.1:17817/visual/missing?pondviewMode=dashboard",
    });
  });

  test("dashboard discovery tolerates missing metadata tables", async () => {
    const runtime = createRuntime();
    const tools = createBridgeMcpToolHandlers(runtime);

    await expect(tools.listDashboards()).resolves.toEqual({
      dashboards: [],
      count: 0,
    });
    await expect(tools.getDashboard("missing")).resolves.toMatchObject({
      dashboard: null,
      charts: [],
      url: "http://127.0.0.1:17817/dashboards/view?id=missing&pondviewMode=dashboard",
    });
  });

  test("create_visual stores chart metadata and returns visual URL", async () => {
    const runtime = await createSeededRuntime();
    const tools = createBridgeMcpToolHandlers(runtime);

    const result = await tools.createVisual({
      dashboardId: "sales",
      dashboardTitle: "Sales",
      title: "Users by id",
      description: "Generated by Codex",
      sql: "SELECT id, name FROM users ORDER BY id",
      visualType: "bar",
      xKey: "name",
      yKeys: ["id"],
    });
    const charts = await runtime.query(
      "SELECT dashboard_id, title, description, sql, sql_backend, chart_config_json FROM pondview.dashboard_charts",
    );
    const config = JSON.parse(String(charts.rows[0]?.chart_config_json));

    expect(result.dashboardId).toBe("sales");
    expect(result.url).toBe(
      "http://127.0.0.1:17817/dashboards/view?id=sales&pondviewMode=dashboard",
    );
    expect(result.visualUrl).toBe(
      `http://127.0.0.1:17817/visual/${result.visualId}?pondviewMode=dashboard`,
    );
    expect(charts.rows[0]).toMatchObject({
      dashboard_id: "sales",
      title: "Users by id",
      description: "Generated by Codex",
      sql: "SELECT id, name FROM users ORDER BY id",
      sql_backend: "bridge",
    });
    expect(config).toMatchObject({
      visualType: "chart",
      type: "bar",
      xKey: "name",
      yKeys: ["id"],
    });
  });

  test("create_text_card stores markdown text card metadata without caller SQL", async () => {
    const runtime = createRuntime();
    const tools = createBridgeMcpToolHandlers(runtime);

    const result = await tools.createTextCard({
      dashboardId: "sales",
      dashboardTitle: "Sales",
      title: "Executive Notes",
      content: "## Summary\nRevenue is **up** this month.",
      colSpan: 3,
    });
    const charts = await runtime.query(
      "SELECT dashboard_id, title, description, sql, source_sql, sql_backend, chart_config_json, layout_w, layout_h FROM pondview.dashboard_charts",
    );
    const config = JSON.parse(String(charts.rows[0]?.chart_config_json));

    expect(result).toMatchObject({
      dashboardId: "sales",
      textCardId: expect.stringContaining("executive-notes-"),
      title: "Executive Notes",
      url: "http://127.0.0.1:17817/dashboards/view?id=sales&pondviewMode=dashboard",
      visualUrl: expect.stringContaining(
        "http://127.0.0.1:17817/visual/executive-notes-",
      ),
    });
    expect(charts.rows[0]).toMatchObject({
      dashboard_id: "sales",
      title: "Executive Notes",
      description: null,
      sql: "SELECT 1 AS pondview_text_card",
      source_sql: "SELECT 1 AS pondview_text_card",
      sql_backend: "bridge",
      layout_w: 3,
      layout_h: 2,
    });
    expect(config).toEqual({
      configType: "text",
      title: "Executive Notes",
      content: "## Summary\nRevenue is **up** this month.",
      colSpan: 3,
    });
  });

  const textOfBlock = (block: { type: string }): string => {
    if (block.type !== "text" || !("text" in block)) {
      throw new Error(`expected a text content block, got ${block.type}`);
    }
    return (block as { text: string }).text;
  };

  test("toToolResult adds an open-in-browser nudge when a url is present", () => {
    const dashboardUrl =
      "http://127.0.0.1:17817/dashboards/view?id=sales&pondviewMode=dashboard";
    const result = toToolResult({ dashboardId: "sales", url: dashboardUrl });

    expect(result.structuredContent).toEqual({
      dashboardId: "sales",
      url: dashboardUrl,
    });
    expect(result.content).toHaveLength(2);
    const nudgeText = textOfBlock(result.content[0]);
    expect(nudgeText).toContain("Open this in a browser");
    expect(nudgeText).toContain(dashboardUrl);
    const jsonText = textOfBlock(result.content[1]);
    expect(jsonText).toBe(
      JSON.stringify({ dashboardId: "sales", url: dashboardUrl }, null, 2),
    );
  });

  test("toToolResult prefers visualUrl for the open-in-browser nudge", () => {
    const dashboardUrl =
      "http://127.0.0.1:17817/dashboards/view?id=sales&pondviewMode=dashboard";
    const visualUrl =
      "http://127.0.0.1:17817/visual/users-by-id-123?pondviewMode=dashboard";
    const result = toToolResult({
      dashboardId: "sales",
      visualId: "users-by-id-123",
      url: dashboardUrl,
      visualUrl,
    });

    expect(result.content).toHaveLength(2);
    const nudgeText = textOfBlock(result.content[0]);
    expect(nudgeText).toContain(visualUrl);
    expect(nudgeText).not.toContain(dashboardUrl);
  });

  test("toToolResult omits the nudge when no url is present", () => {
    const value = { rows: [{ id: 1 }], rowCount: 1 };
    const result = toToolResult(value);

    expect(result.content).toHaveLength(1);
    const jsonText = textOfBlock(result.content[0]);
    expect(jsonText).toBe(JSON.stringify(value, null, 2));
    expect(jsonText).not.toContain("Open this in a browser");
    expect(result.structuredContent).toEqual(value);
  });

  test("toToolResult omits the nudge when url is an empty string", () => {
    const result = toToolResult({ url: "" });

    expect(result.content).toHaveLength(1);
    expect(textOfBlock(result.content[0])).not.toContain(
      "Open this in a browser",
    );
  });

  test("open_ui returns app, dashboard, and analysis URLs without opening a browser", async () => {
    const runtime = createRuntime();
    const tools = createBridgeMcpToolHandlers(runtime, {
      appUrl: "http://127.0.0.1:17818/",
    });

    await expect(tools.openUi({})).resolves.toMatchObject({
      view: "app",
      url: "http://127.0.0.1:17818",
    });
    await expect(
      tools.openUi({ view: "dashboard", dashboardId: "sales dashboard" }),
    ).resolves.toMatchObject({
      view: "dashboard",
      dashboardId: "sales dashboard",
      url: "http://127.0.0.1:17818/dashboards/view?id=sales%20dashboard&pondviewMode=dashboard",
    });
    await expect(
      tools.openUi({ view: "analysis", analysisId: "analysis:1" }),
    ).resolves.toMatchObject({
      view: "analysis",
      analysisId: "analysis:1",
      url: "http://127.0.0.1:17818/analysis?id=analysis%3A1",
    });
  });

  test("show_chart returns a visual payload without saving", async () => {
    const runtime = await createSeededRuntime();
    const tools = createBridgeMcpToolHandlers(runtime);

    const { visual } = await tools.showChart({
      title: "Users",
      sql: "SELECT name, id FROM users ORDER BY id",
      visualType: "bar",
    });
    const tables = await runtime.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'pondview'",
    );

    expect(visual).toMatchObject({
      title: "Users",
      description: null,
      visualType: "bar",
      rowCount: 6,
      truncated: false,
      saved: null,
      config: { type: "bar", xKey: "name", yKeys: ["id"] },
    });
    expect(visual.rows).toHaveLength(6);
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "internal_state",
    ]);
  });

  test("show_chart caps rows and flags truncation", async () => {
    const runtime = createRuntime();
    const tools = createBridgeMcpToolHandlers(runtime);

    const { visual } = await tools.showChart({
      title: "Range",
      sql: "SELECT range AS n FROM range(6000)",
      visualType: "table",
    });

    expect(visual.rowCount).toBe(6000);
    expect(visual.rows).toHaveLength(5000);
    expect(visual.truncated).toBe(true);
  });

  test("show_chart rejects write SQL even when writes are allowed", async () => {
    const runtime = await createSeededRuntime();
    const tools = createBridgeMcpToolHandlers(runtime, { allowWriteSql: true });

    await expect(
      tools.showChart({
        title: "Drop",
        sql: "DROP TABLE users",
        visualType: "table",
      }),
    ).rejects.toThrow("read-only");
  });

  test("create_visual returns the saved visual payload", async () => {
    const runtime = await createSeededRuntime();
    const tools = createBridgeMcpToolHandlers(runtime);

    const result = await tools.createVisual({
      dashboardId: "sales",
      title: "Users",
      sql: "SELECT name, id FROM users ORDER BY id",
      visualType: "line",
    });

    expect(result.visual.saved).toEqual({
      dashboardId: "sales",
      visualId: result.visualId,
    });
    expect(result.visual.rows).toHaveLength(6);
  });

  describe("dashboards", () => {
    // Seeds a dashboard with two visuals, a text card, a slicer on users.name,
    // and a join from orders to users, mirroring the app's metadata tables.
    async function createSeededDashboard() {
      const runtime = await createSeededRuntime();
      await runtime.query(
        "CREATE TABLE orders (id INTEGER, user_id INTEGER, amount INTEGER);",
      );
      await runtime.query(
        "INSERT INTO orders VALUES (1, 1, 10), (2, 1, 20), (3, 2, 5), (4, 3, 7);",
      );
      const tools = createBridgeMcpToolHandlers(runtime);
      const users = await tools.createVisual({
        dashboardId: "sales",
        dashboardTitle: "Sales",
        title: "Users",
        sql: "SELECT name, id FROM users ORDER BY id",
        visualType: "bar",
      });
      const revenue = await tools.createVisual({
        dashboardId: "sales",
        title: "Revenue",
        sql: "SELECT SUM(amount) AS total FROM orders",
        visualType: "card",
      });
      const notes = await tools.createTextCard({
        dashboardId: "sales",
        title: "Notes",
        content: "**Hello**",
      });
      await runtime.query(`CREATE TABLE pondview.dashboard_slicers (
        id TEXT PRIMARY KEY, dashboard_id TEXT NOT NULL, field TEXT NOT NULL,
        title TEXT, "limit" INTEGER NOT NULL, position INTEGER NOT NULL,
        created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
      );`);
      await runtime.query(
        "INSERT INTO pondview.dashboard_slicers VALUES ('slicer-name', 'sales', 'users.name', 'Name', 3, 0, 0, 0);",
      );
      await runtime.query(`CREATE TABLE pondview.dashboard_join_defs (
        dashboard_id TEXT NOT NULL, position INTEGER NOT NULL,
        left_table TEXT NOT NULL, left_column TEXT NOT NULL,
        right_table TEXT NOT NULL, right_column TEXT NOT NULL, join_type TEXT,
        PRIMARY KEY (dashboard_id, position)
      );`);
      await runtime.query(
        "INSERT INTO pondview.dashboard_join_defs VALUES ('sales', 0, 'orders', 'user_id', 'users', 'id', 'left');",
      );
      return {
        runtime,
        tools,
        usersId: users.visualId,
        revenueId: revenue.visualId,
        notesId: notes.textCardId,
      };
    }

    test("show_dashboard returns visual, text, and slicer payloads", async () => {
      const { tools, usersId, revenueId, notesId } =
        await createSeededDashboard();

      const { dashboard } = await tools.showDashboard("sales");

      expect(dashboard).toMatchObject({
        id: "sales",
        title: "Sales",
        columns: 4,
        filters: [],
        skippedFilters: [],
      });
      expect(dashboard.cards.map((card) => [card.kind, card.id])).toEqual([
        ["visual", usersId],
        ["visual", revenueId],
        ["text", notesId],
      ]);
      expect(dashboard.cards[0]).toMatchObject({
        kind: "visual",
        layout: { x: 0, y: 0, w: 2, h: 2 },
        error: null,
        visual: {
          title: "Users",
          visualType: "bar",
          rowCount: 6,
          config: { type: "bar", xKey: "name", yKeys: ["id"] },
          saved: { dashboardId: "sales", visualId: usersId },
        },
      });
      expect(dashboard.cards[1]).toMatchObject({
        visual: { visualType: "card", rows: [{ total: "42" }] },
      });
      expect(dashboard.cards[2]).toEqual({
        kind: "text",
        id: notesId,
        layout: expect.objectContaining({ w: 2 }),
        title: "Notes",
        content: "**Hello**",
      });
      expect(dashboard.slicers).toEqual([
        {
          id: "slicer-name",
          field: "users.name",
          title: "Name",
          options: ["Ada", "Annie", "Evelyn"],
        },
      ]);
    });

    test("slicer filters narrow visuals directly and through joins", async () => {
      const { tools, usersId } = await createSeededDashboard();
      const filters = [
        { field: "users.name", op: "in" as const, values: ["Ada", "Grace"] },
      ];

      const { dashboard } = await tools.showDashboard("sales", filters);
      const [users, revenue] = dashboard.cards;

      expect(dashboard.filters).toEqual(filters);
      expect(users.kind === "visual" && users.visual?.rows).toEqual([
        { name: "Ada", id: 1 },
        { name: "Grace", id: 2 },
      ]);
      expect(revenue.kind === "visual" && revenue.visual?.rows).toEqual([
        { total: "35" },
      ]);
      // Slicer options stay unfiltered so the user can widen the selection.
      expect(dashboard.slicers[0]?.options).toHaveLength(3);

      const { visual } = await tools.runVisual(usersId, filters);
      expect(visual.rows).toHaveLength(2);
      expect(visual.saved).toEqual({ dashboardId: "sales", visualId: usersId });
    });

    test("unreachable filter fields are reported as skipped", async () => {
      const { tools, usersId } = await createSeededDashboard();

      const { dashboard } = await tools.showDashboard("sales", [
        { field: "regions.name", op: "in", values: ["EU"] },
      ]);

      expect(dashboard.skippedFilters).toEqual(
        expect.arrayContaining([
          {
            visualId: usersId,
            field: "regions.name",
            reason: 'No join path from "users" to "regions"',
          },
        ]),
      );
      const users = dashboard.cards[0];
      expect(users.kind === "visual" && users.visual?.rowCount).toBe(6);
    });

    test("a broken visual sets card.error and the rest still renders", async () => {
      const { runtime, tools, usersId } = await createSeededDashboard();
      await runtime.query(
        `UPDATE pondview.dashboard_charts SET sql = 'SELECT * FROM missing_table' WHERE id = '${usersId}';`,
      );

      const { dashboard } = await tools.showDashboard("sales");
      const [broken, revenue, notes] = dashboard.cards;

      expect(broken).toMatchObject({ kind: "visual", visual: null });
      expect(broken.kind === "visual" && broken.error).toContain(
        "missing_table",
      );
      expect(revenue).toMatchObject({ error: null, visual: { rowCount: 1 } });
      expect(notes.kind).toBe("text");
    });

    test("dashboard visuals reject write SQL even when writes are allowed", async () => {
      const { runtime, usersId } = await createSeededDashboard();
      const tools = createBridgeMcpToolHandlers(runtime, {
        allowWriteSql: true,
      });
      await runtime.query(
        `UPDATE pondview.dashboard_charts SET sql = 'DROP TABLE users' WHERE id = '${usersId}';`,
      );

      const { dashboard } = await tools.showDashboard("sales");

      expect(dashboard.cards[0]).toMatchObject({
        error: expect.stringContaining("read-only"),
      });
      await expect(tools.runVisual(usersId)).rejects.toThrow("read-only");
      await expect(
        runtime.query("SELECT COUNT(*) AS n FROM users"),
      ).resolves.toMatchObject({ rows: [{ n: "6" }] });
    });

    test("show_dashboard rejects unknown dashboards", async () => {
      const { tools } = await createSeededDashboard();

      await expect(tools.showDashboard("missing")).rejects.toThrow(
        'Dashboard "missing" not found',
      );
    });

    test("update_visual_config patches chart types and rebuilds others", async () => {
      const { runtime, tools, usersId } = await createSeededDashboard();

      const line = await tools.updateVisualConfig({
        visualId: usersId,
        visualType: "line",
        title: "Users over id",
      });
      expect(line.visual).toMatchObject({
        title: "Users over id",
        visualType: "line",
        config: { type: "line", xKey: "name", yKeys: ["id"] },
        saved: { dashboardId: "sales", visualId: usersId },
      });

      const table = await tools.updateVisualConfig({
        visualId: usersId,
        visualType: "table",
      });
      expect(table.visual.visualType).toBe("table");
      expect(table.visual.config).toMatchObject({ configType: "table" });

      const stored = await runtime.query(
        `SELECT title, chart_config_json FROM pondview.dashboard_charts WHERE id = '${usersId}'`,
      );
      expect(stored.rows[0]?.title).toBe("Users over id");
      expect(
        JSON.parse(String(stored.rows[0]?.chart_config_json)),
      ).toMatchObject({ configType: "table" });
    });

    test("delete_visual removes one card", async () => {
      const { tools, usersId } = await createSeededDashboard();

      await expect(tools.deleteVisual(usersId)).resolves.toEqual({
        visualId: usersId,
        dashboardId: "sales",
        deleted: true,
      });
      await expect(tools.deleteVisual(usersId)).resolves.toMatchObject({
        deleted: false,
      });
      const { dashboard } = await tools.showDashboard("sales");
      expect(dashboard.cards.map((card) => card.id)).not.toContain(usersId);
      expect(dashboard.cards).toHaveLength(2);
    });

    test("delete_dashboard removes the dashboard and its children", async () => {
      const { runtime, tools } = await createSeededDashboard();

      const result = await tools.deleteDashboard("sales");
      const remaining = await runtime.query(`SELECT
        (SELECT COUNT(*) FROM pondview.dashboards) AS dashboards,
        (SELECT COUNT(*) FROM pondview.dashboard_charts) AS charts,
        (SELECT COUNT(*) FROM pondview.dashboard_slicers) AS slicers,
        (SELECT COUNT(*) FROM pondview.dashboard_join_defs) AS join_defs`);

      expect(result).toEqual({
        dashboardId: "sales",
        deleted: true,
        removed: { charts: 3, measures: 0, slicers: 1, joinDefs: 1 },
      });
      expect(remaining.rows[0]).toEqual({
        dashboards: "0",
        charts: "0",
        slicers: "0",
        join_defs: "0",
      });
      await expect(tools.deleteDashboard("sales")).resolves.toMatchObject({
        deleted: false,
      });
    });
  });

  test("describe_table returns columns, row count, and samples", async () => {
    const runtime = await createSeededRuntime();
    const tools = createBridgeMcpToolHandlers(runtime);

    const result = await tools.describeTable("users");

    expect(result.columns).toEqual(
      expect.arrayContaining([expect.objectContaining({ column_name: "id" })]),
    );
    expect(result.rowCount).toBe(6);
    expect(result.sampleRows).toHaveLength(5);
    await expect(
      tools.describeTable("users; DROP TABLE users"),
    ).rejects.toThrow("not found");
  });

  test("query is capped and rejects writes even when writes are allowed", async () => {
    const runtime = await createSeededRuntime();
    const tools = createBridgeMcpToolHandlers(runtime, { allowWriteSql: true });

    const result = await tools.query("SELECT * FROM users ORDER BY id", 2);

    expect(result.rows).toHaveLength(2);
    expect(result).toMatchObject({ rowCount: 6, truncated: true });
    await expect(tools.query("DELETE FROM users")).rejects.toThrow("read-only");
  });

  describe("MCP App surface", () => {
    async function connectClient(
      options: Parameters<typeof createBridgeMcpServer>[1] = {},
    ) {
      const runtime = await createSeededRuntime();
      const server = createBridgeMcpServer(runtime, options);
      const client = new Client({ name: "test-host", version: "0.0.0" });
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await Promise.all([
        server.connect(serverTransport),
        client.connect(clientTransport),
      ]);
      return client;
    }

    test("every tool declares a title and a read-only or destructive hint", async () => {
      const client = await connectClient();
      const { tools } = await client.listTools();

      expect(tools.length).toBeGreaterThan(0);
      for (const tool of tools) {
        expect(tool.title, tool.name).toBeTruthy();
        const annotations = tool.annotations ?? {};
        expect(
          annotations.readOnlyHint === true ||
            typeof annotations.destructiveHint === "boolean",
          tool.name,
        ).toBe(true);
      }
    });

    test("execute_sql is marked destructive only when writes are allowed", async () => {
      const readOnly = await connectClient();
      const writable = await connectClient({ allowWriteSql: true });
      const find = async (client: Client) =>
        (await client.listTools()).tools.find(
          (tool) => tool.name === "execute_sql",
        );

      expect((await find(readOnly))?.annotations).toMatchObject({
        readOnlyHint: true,
      });
      expect((await find(writable))?.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
      });
    });

    test("show_chart and create_visual link the visual view", async () => {
      const client = await connectClient();
      const { tools } = await client.listTools();

      for (const name of ["show_chart", "create_visual"]) {
        const tool = tools.find((candidate) => candidate.name === name);
        expect(tool?._meta?.ui, name).toMatchObject({
          resourceUri: "ui://pondview/visual",
        });
      }
    });

    test("serves the visual view as an MCP App resource", async () => {
      const viewsDir = createTempDir();
      writeFileSync(join(viewsDir, "visual.html"), "<html>visual</html>");
      const client = await connectClient({ viewsDir });

      const { contents } = await client.readResource({
        uri: "ui://pondview/visual",
      });

      expect(contents[0]).toMatchObject({
        uri: "ui://pondview/visual",
        mimeType: RESOURCE_MIME_TYPE,
        text: "<html>visual</html>",
      });
    });

    test("app-only dashboard tools are hidden from the model", async () => {
      const client = await connectClient();
      const { tools } = await client.listTools();
      const find = (name: string) =>
        tools.find((candidate) => candidate.name === name);

      for (const name of [
        "get_dashboard_data",
        "run_visual",
        "update_visual_config",
      ]) {
        expect(find(name)?._meta?.ui, name).toEqual({
          resourceUri: "ui://pondview/dashboard",
          visibility: ["app"],
        });
      }
      expect(find("show_dashboard")?._meta?.ui).toEqual({
        resourceUri: "ui://pondview/dashboard",
      });
      expect(find("show_dashboard")?.annotations).toMatchObject({
        readOnlyHint: true,
      });
      expect(find("save_visual")?._meta?.ui).toMatchObject({
        resourceUri: "ui://pondview/visual",
      });
    });

    test("delete tools are destructive and deprecated tools say so", async () => {
      const client = await connectClient();
      const { tools } = await client.listTools();
      const find = (name: string) =>
        tools.find((candidate) => candidate.name === name);

      for (const name of ["delete_visual", "delete_dashboard"]) {
        expect(find(name)?.annotations, name).toMatchObject({
          readOnlyHint: false,
          destructiveHint: true,
        });
      }
      for (const [name, replacement] of [
        ["get_table_schema", "describe_table"],
        ["run_preview", "describe_table"],
        ["execute_sql", "query"],
        ["create_visual", "save_visual"],
        ["open_ui", "show_dashboard"],
        ["open_dashboard", "show_dashboard"],
        ["open_visual", "show_dashboard"],
      ]) {
        expect(find(name)?.description, name).toStartWith(
          `(deprecated: use ${replacement})`,
        );
      }
    });

    test("lists and serves the dashboard view resource", async () => {
      const viewsDir = createTempDir();
      writeFileSync(join(viewsDir, "dashboard.html"), "<html>dash</html>");
      const client = await connectClient({ viewsDir });

      const { resources } = await client.listResources();
      const { contents } = await client.readResource({
        uri: "ui://pondview/dashboard",
      });

      expect(resources.map((resource) => resource.uri)).toEqual(
        expect.arrayContaining([
          "ui://pondview/visual",
          "ui://pondview/dashboard",
        ]),
      );
      expect(contents[0]).toMatchObject({
        uri: "ui://pondview/dashboard",
        mimeType: RESOURCE_MIME_TYPE,
        text: "<html>dash</html>",
      });
    });

    test("show_dashboard summarizes cards without rows", async () => {
      const client = await connectClient();
      await client.callTool({
        name: "save_visual",
        arguments: {
          dashboardId: "sales",
          dashboardTitle: "Sales",
          title: "Users",
          sql: "SELECT name, id FROM users ORDER BY id",
          visualType: "bar",
        },
      });

      const result = await client.callTool({
        name: "show_dashboard",
        arguments: { dashboardId: "sales" },
      });
      const text = (result.content as Array<{ text: string }>)[0].text;

      expect(text).toContain('Dashboard "Sales" (sales): 1 card(s)');
      expect(text).toContain('bar "Users"');
      expect(text).toContain("6 row(s)");
      expect(text).not.toContain("Katherine");
      expect(
        (result.structuredContent as { dashboard: { cards: unknown[] } })
          .dashboard.cards,
      ).toHaveLength(1);
    });

    test("query text shows only the first rows", async () => {
      const client = await connectClient();

      const result = await client.callTool({
        name: "query",
        arguments: { sql: "SELECT range AS n FROM range(100)" },
      });
      const text = (result.content as Array<{ text: string }>)[0].text;

      expect(text).toContain("100 row(s).");
      expect(text).toContain("First 20 row(s):");
      expect(text).not.toContain('"n": 99');
    });

    test("show_chart keeps rows out of the text summary", async () => {
      const client = await connectClient();

      const result = await client.callTool({
        name: "show_chart",
        arguments: {
          title: "Range",
          sql: "SELECT range AS n FROM range(100)",
          visualType: "bar",
        },
      });
      const text = (result.content as Array<{ text: string }>)[0].text;

      expect(text).toContain('bar visual "Range" from 100 row(s).');
      expect(text).toContain("First 20 row(s):");
      expect(text).not.toContain('"n": 99');
      expect(
        (result.structuredContent as { visual: { rows: unknown[] } }).visual
          .rows,
      ).toHaveLength(100);
    });
  });
});
