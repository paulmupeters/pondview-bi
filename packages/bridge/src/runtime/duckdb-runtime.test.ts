import { describe, expect, test } from "bun:test";
import { DuckDbRuntime } from "./duckdb-runtime";

describe("DuckDbRuntime", () => {
  test("runs SQL through native DuckDB", async () => {
    const runtime = new DuckDbRuntime();

    const result = await runtime.query("SELECT 42 AS answer;");

    expect(result.columns.map((column) => column.name)).toEqual(["answer"]);
    expect(result.rows).toEqual([{ answer: 42 }]);
    expect(result.rowCount).toBe(1);
  });

  test("allows read-only SQL in readonly mode", async () => {
    const runtime = new DuckDbRuntime({ readonly: true });

    const result = await runtime.query("SHOW TABLES;");

    expect(result.rows).toEqual([]);
  });

  test("blocks mutating SQL in readonly mode", async () => {
    const runtime = new DuckDbRuntime({ readonly: true });

    await expect(
      runtime.query("CREATE TABLE nope AS SELECT 1 AS value;"),
    ).rejects.toThrow("Readonly bridge mode allows only read-only SQL.");
  });
});
