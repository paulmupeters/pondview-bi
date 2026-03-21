import { describe, expect, test } from "bun:test";
import { createRunQueryWasm } from "@/lib/sql/run-query-wasm";

describe("runQueryWasm", () => {
  test("extracts columns from schema and normalizes bigint values", async () => {
    const runQueryWasm = createRunQueryWasm({
      getClient: () => ({
        execute: async () => ({
          schema: {
            fields: [
              { name: "id", type: { toString: () => "BIGINT" } },
              { name: "label", type: { toString: () => "VARCHAR" } },
            ],
          },
          toArray: () => [{ id: BigInt(42), label: "hello" }],
        }),
      }),
      now: (() => {
        let value = 0;
        return () => {
          value += 5;
          return value;
        };
      })(),
    });

    const result = await runQueryWasm({ sql: "SELECT 1" });

    expect(result.columns).toEqual([
      { name: "id", type: "BIGINT" },
      { name: "label", type: "VARCHAR" },
    ]);
    expect(result.rows).toEqual([{ id: "42", label: "hello" }]);
    expect(result.durationMs).toBe(5);
  });

  test("falls back to row keys when schema metadata is unavailable", async () => {
    const runQueryWasm = createRunQueryWasm({
      getClient: () => ({
        execute: async () => ({
          toArray: () => [{ a: 1, b: 2 }],
        }),
      }),
      now: () => 0,
    });

    const result = await runQueryWasm({ sql: "SELECT a, b" });

    expect(result.columns).toEqual([{ name: "a" }, { name: "b" }]);
    expect(result.rows).toEqual([{ a: 1, b: 2 }]);
  });

  test("returns empty rows and columns for empty result sets", async () => {
    const runQueryWasm = createRunQueryWasm({
      getClient: () => ({
        execute: async () => ({
          toArray: () => [],
        }),
      }),
      now: () => 10,
    });

    const result = await runQueryWasm({ sql: "SELECT * FROM empty_table" });

    expect(result.rows).toEqual([]);
    expect(result.columns).toEqual([]);
    expect(result.durationMs).toBe(0);
  });
});
