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
import type { BridgeQueryResponse } from "@pondview/bridge-protocol";
import {
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
});
