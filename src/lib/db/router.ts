import type { DbAdapter, TableRow } from "@/lib/db/driver";
import * as duckMeta from "@/lib/duckdb/metadata";
import * as duckQuery from "@/lib/duckdb/query";
import { runSqlAndGetRowObjectsJsonHttp } from "@/lib/duckdb/duckdb-node";

// All queries now go through DuckDB, which handles postgres URIs via the postgres extension
const duckdbAdapter: DbAdapter = {
  runSqlNormalized: duckQuery.runSqlNormalized,
  getSchemas: duckMeta.getSchemas,
  getTablesForSchema: duckMeta.getTablesForSchema,
  getTables: duckMeta.getTables,
};

function normalizeValue(value: unknown): string | number | boolean | Date {
  if (value instanceof Date) return value;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

// HTTP adapter for DuckDB - only supports queries, not metadata operations
const httpDuckdbAdapter: DbAdapter = {
  runSqlNormalized: async (_id: string, sql: string): Promise<TableRow[]> => {
    const rawRows = await runSqlAndGetRowObjectsJsonHttp(undefined, sql);
    return rawRows.map((row) => {
      const out: TableRow = {};
      for (const [key, value] of Object.entries(row)) {
        out[key] = normalizeValue(value);
      }
      return out;
    });
  },
  getSchemas: async () => {
    throw new Error("HTTP adapter does not support schema introspection");
  },
  getTablesForSchema: async () => {
    throw new Error("HTTP adapter does not support table introspection");
  },
  getTables: async () => {
    throw new Error("HTTP adapter does not support table introspection");
  },
};

export const runSqlNormalized = (
  id: string,
  sql: string,
  useHttp?: boolean
) => {
  if (useHttp) {
    return httpDuckdbAdapter.runSqlNormalized(id, sql);
  }
  return duckdbAdapter.runSqlNormalized(id, sql);
};
export const getSchemas = (id: string) => duckdbAdapter.getSchemas(id);
export const getTablesForSchema = (id: string, s: string, l?: number) =>
  duckdbAdapter.getTablesForSchema(id, s, l);
export const getTables = (id: string) => duckdbAdapter.getTables(id);
