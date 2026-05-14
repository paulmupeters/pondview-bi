import { describe, expect, test } from "bun:test";
import { DEFAULT_WASM_DB_IDENTIFIER } from "@/lib/sql/sql-runtime";
import {
  buildRuntimeTableReference,
  type RuntimeTableMetadata,
  resolveRuntimeTableReferenceFromMetadata,
  resolveToolRuntimeTarget,
} from "./sql-tool-shared";

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

const postgresPublicTable: RuntimeTableMetadata = {
  table_catalog: "main_db",
  table_schema: "public",
  table_name: "saved_keywords",
  table_type: "BASE TABLE",
  table_reference: '"main_db"."saved_keywords"',
};

describe("buildRuntimeTableReference", () => {
  test("uses catalog.table for attached default-schema tables", () => {
    expect(buildRuntimeTableReference(postgresPublicTable)).toBe(
      '"main_db"."saved_keywords"',
    );
  });

  test("uses catalog.schema.table for non-default schemas", () => {
    expect(
      buildRuntimeTableReference({
        table_catalog: "warehouse",
        table_schema: "analytics",
        table_name: "events",
      }),
    ).toBe('"warehouse"."analytics"."events"');
  });
});

describe("resolveRuntimeTableReferenceFromMetadata", () => {
  test("resolves a bare table name to its attached catalog reference", () => {
    expect(
      resolveRuntimeTableReferenceFromMetadata("saved_keywords", [
        postgresPublicTable,
      ]),
    ).toBe('"main_db"."saved_keywords"');
  });

  test("resolves public.schema references to the attached catalog reference", () => {
    expect(
      resolveRuntimeTableReferenceFromMetadata("public.saved_keywords", [
        postgresPublicTable,
      ]),
    ).toBe('"main_db"."saved_keywords"');
  });

  test("maps public references to DuckDB default schema tables", () => {
    expect(
      resolveRuntimeTableReferenceFromMetadata("public.saved_keywords", [
        {
          ...postgresPublicTable,
          table_schema: "main",
          table_reference: '"main_db"."saved_keywords"',
        },
      ]),
    ).toBe('"main_db"."saved_keywords"');
  });

  test("preserves the attached catalog reference when already supplied", () => {
    expect(
      resolveRuntimeTableReferenceFromMetadata("main_db.saved_keywords", [
        postgresPublicTable,
      ]),
    ).toBe('"main_db"."saved_keywords"');
  });

  test("throws a helpful error for ambiguous bare table names", () => {
    expect(() =>
      resolveRuntimeTableReferenceFromMetadata("saved_keywords", [
        postgresPublicTable,
        {
          table_catalog: "other_db",
          table_schema: "public",
          table_name: "saved_keywords",
          table_type: "BASE TABLE",
          table_reference: '"other_db"."saved_keywords"',
        },
      ]),
    ).toThrow(/ambiguous/i);
  });
});
