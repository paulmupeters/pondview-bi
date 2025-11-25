import type { DbAdapter } from "@/lib/db/driver";
import * as duckMeta from "@/lib/duckdb/metadata";
import * as duckQuery from "@/lib/duckdb/query";
import * as duckQueryHttp from "@/lib/duckdb/query-http";

// All queries now go through DuckDB, which handles postgres URIs via the postgres extension
const duckdbAdapter: DbAdapter = {
  runSqlNormalized: duckQuery.runSqlNormalized,
  getSchemas: duckMeta.getSchemas,
  getTablesForSchema: duckMeta.getTablesForSchema,
  getTables: duckMeta.getTables,
};

// HTTP adapter for DuckDB - only supports queries, not metadata operations
const httpDuckdbAdapter: DbAdapter = {
  runSqlNormalized: (id: string, sql: string) =>
    duckQueryHttp.runSqlNormalizedHttp(id, sql),
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
