import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDbRuntime } from "./duckdb-runtime";

const runtimes: DuckDbRuntime[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createRuntime(
  options?: ConstructorParameters<typeof DuckDbRuntime>[0],
) {
  const runtime = new DuckDbRuntime(options);
  runtimes.push(runtime);
  return runtime;
}

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "pondview-runtime-"));
  tempDirs.push(dir);
  return dir;
}

describe("DuckDbRuntime", () => {
  test("runs SQL through native DuckDB", async () => {
    const runtime = createRuntime();

    const result = await runtime.query("SELECT 42 AS answer;");

    expect(result.columns.map((column) => column.name)).toEqual(["answer"]);
    expect(result.rows).toEqual([{ answer: 42 }]);
    expect(result.rowCount).toBe(1);
  });

  test("allows read-only SQL in readonly mode", async () => {
    const runtime = createRuntime({ readonly: true });

    const result = await runtime.query("SHOW TABLES;");

    expect(result.rows).toEqual([]);
  });

  test("blocks mutating SQL in readonly mode", async () => {
    const runtime = createRuntime({ readonly: true });

    await expect(
      runtime.query("CREATE TABLE nope AS SELECT 1 AS value;"),
    ).rejects.toThrow("Readonly bridge mode allows only read-only SQL.");
  });

  test("opens a DuckDB file as the primary database", async () => {
    const databasePath = join(createTempDir(), "analytics.duckdb");
    const writer = createRuntime({ databasePath });
    await writer.query("CREATE TABLE metrics AS SELECT 42 AS answer;");
    await writer.close();

    const runtime = createRuntime({ databasePath });
    const result = await runtime.query("SELECT answer FROM metrics;");

    expect(runtime.databaseInfo().mode).toBe("file");
    expect(runtime.databaseInfo().id).not.toBe("memory");
    expect(result.rows).toEqual([{ answer: 42 }]);
  });

  test("resolves secret-backed connection ids before attaching", async () => {
    const databasePath = join(createTempDir(), "source.duckdb");
    const writer = createRuntime({ databasePath });
    await writer.query("CREATE TABLE metrics AS SELECT 7 AS value;");
    await writer.close();

    const runtime = createRuntime({
      resolveSource: (id) =>
        id === "duckdb:source"
          ? {
              type: "duckdb",
              identifier: databasePath,
              alias: "source",
              readonly: true,
            }
          : undefined,
    });

    await runtime.query(`ATTACH 'duckdb:source' AS source (READ_ONLY);`);
    const result = await runtime.query(
      "SELECT value FROM source.main.metrics;",
    );

    expect(result.rows).toEqual([{ value: 7 }]);
  });
});
