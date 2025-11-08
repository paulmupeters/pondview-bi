import type { DbAdapter } from "@/lib/db/driver";
import * as duckMeta from "@/lib/duckdb/metadata";
import * as duckQuery from "@/lib/duckdb/query";
import * as pgMeta from "@/lib/postgres/metadata";
import * as pgQuery from "@/lib/postgres/query";

const duckdbAdapter: DbAdapter = {
  runSqlNormalized: duckQuery.runSqlNormalized,
  getSchemas: duckMeta.getSchemas,
  getTablesForSchema: duckMeta.getTablesForSchema,
  getTables: duckMeta.getTables,
};

const postgresAdapter: DbAdapter = {
  runSqlNormalized: pgQuery.runSqlNormalized,
  getSchemas: pgMeta.getSchemas,
  getTablesForSchema: pgMeta.getTablesForSchema,
  getTables: pgMeta.getTables,
};

function selectAdapter(dbIdentifier: string): DbAdapter {
  const id = (dbIdentifier ?? "").trim();
  if (
    id.startsWith("postgres://") ||
    id.startsWith("postgresql://") ||
    id.startsWith("pg:")
  )
    return postgresAdapter;
  return duckdbAdapter;
}

export const runSqlNormalized = (id: string, sql: string) =>
  selectAdapter(id).runSqlNormalized(id, sql);
export const getSchemas = (id: string) => selectAdapter(id).getSchemas(id);
export const getTablesForSchema = (id: string, s: string, l?: number) =>
  selectAdapter(id).getTablesForSchema(id, s, l);
export const getTables = (id: string) => selectAdapter(id).getTables(id);
