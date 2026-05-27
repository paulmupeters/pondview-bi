import { afterEach, describe, expect, test } from "bun:test";
import { createBridgeMcpToolHandlers } from "./mcp";
import { DuckDbRuntime } from "./runtime/duckdb-runtime";

const runtimes: DuckDbRuntime[] = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
});

function createRuntime(): DuckDbRuntime {
  const runtime = new DuckDbRuntime();
  runtimes.push(runtime);
  return runtime;
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
});
