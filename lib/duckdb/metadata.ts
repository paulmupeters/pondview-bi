import { runSqlAndGetRowObjectsJson } from "@/lib/duckdb/duckdb-node";
import { resolveDbPath } from "@/lib/duckdb/path";

export async function getSchemas(dbIdentifier: string): Promise<string[]> {
  const dbPath = resolveDbPath(dbIdentifier);
  const result = await runSqlAndGetRowObjectsJson(
    dbPath,
    `
      SELECT DISTINCT table_schema
      FROM information_schema.tables
      WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
      ORDER BY 1
    `,
  );
  return result.map((r) => r.table_schema as string);
}

export async function getTablesForSchema(
  dbIdentifier: string,
  schema: string,
  limit = 20,
): Promise<string[]> {
  const dbPath = resolveDbPath(dbIdentifier);
  const safeSchema = schema.replace(/'/g, "''");
  const lim = Number.isFinite(limit as unknown as number)
    ? Math.max(1, Math.min(1000, limit))
    : 20;
  const result = await runSqlAndGetRowObjectsJson(
    dbPath,
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = '${safeSchema}' AND table_type = 'BASE TABLE'
      ORDER BY table_name
      LIMIT ${lim}
    `,
  );
  return result.map((r) => r.table_name as string);
}

export async function getTables(
  dbIdentifier: string,
): Promise<Array<{ table_schema: string; table_name: string; table_type: string }>> {
  const dbPath = resolveDbPath(dbIdentifier);
  const tablesResult = await runSqlAndGetRowObjectsJson(
    dbPath,
    `
      SELECT 
        table_schema,
        table_name,
        table_type
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
      ORDER BY table_schema, table_name
    `,
  );
  const filteredResult = tablesResult.filter(
    (table) => (table.table_type as string) === "BASE TABLE",
  ) as Array<{ table_schema: string; table_name: string; table_type: string }>;
  return filteredResult;
}


