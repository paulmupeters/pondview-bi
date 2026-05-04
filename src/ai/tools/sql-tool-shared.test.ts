import { describe, expect, test } from "bun:test";
import { DEFAULT_WASM_DB_IDENTIFIER } from "@/lib/sql/sql-runtime";
import { resolveToolRuntimeTarget } from "./sql-tool-shared";

describe("resolveToolRuntimeTarget", () => {
  test("uses local WASM when the model passes a table name as databasePath", () => {
    expect(resolveToolRuntimeTarget("unicorns")).toEqual({
      backend: "duckdb-wasm",
      dbIdentifier: DEFAULT_WASM_DB_IDENTIFIER,
    });
  });

  test("preserves explicit local WASM identifiers", () => {
    expect(resolveToolRuntimeTarget(DEFAULT_WASM_DB_IDENTIFIER)).toEqual({
      backend: "duckdb-wasm",
      dbIdentifier: DEFAULT_WASM_DB_IDENTIFIER,
    });
  });
});
