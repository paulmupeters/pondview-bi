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
import { createBridgeMcpToolHandlers, resolveMcpDatabasePath } from "./mcp";
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

  test("create_visual stores chart metadata and returns dashboard URL", async () => {
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
});
