import { runSqlAndGetRowObjectsJson } from "@/lib/duckdb/duckdb-node";
import { resolveDbPath } from "@/lib/duckdb/path";

/**
 * Extracts the database name (table_catalog) from a DuckDB identifier.
 * For MotherDuck: extracts the part after "md:" and before "?" (if query params exist)
 * For local files: returns null (will need to query information_schema to get catalog)
 */
function extractDatabaseName(dbIdentifier: string): string | null {
  const id = (dbIdentifier ?? "").trim();
  if (!id) return null;
  
  if (id.startsWith("md:")) {
    // Extract database name from md:db_name or md:db_name?params
    const withoutPrefix = id.slice(3); // Remove "md:"
    const beforeQuery = withoutPrefix.split("?")[0];
    return beforeQuery || null;
  }
  
  // For local files, we'll need to query information_schema to get the catalog
  // Return null to indicate we should query for it
  return null;
}

export async function getSchemas(dbIdentifier: string): Promise<string[]> {
  const dbPath = resolveDbPath(dbIdentifier);
  const dbName = extractDatabaseName(dbIdentifier);

  // Build WHERE clause with optional table_catalog filter
  let whereClause = "table_schema NOT IN ('information_schema', 'pg_catalog')";
  if (dbName) {
    const safeDbName = dbName.replace(/'/g, "''");
    whereClause += ` AND table_catalog = '${safeDbName}'`;
  }

  const result = await runSqlAndGetRowObjectsJson(
    dbPath,
    `
      SELECT DISTINCT table_schema
      FROM information_schema.tables
      WHERE ${whereClause}
      ORDER BY 1
    `
  );
  console.log("getSchemas result", result);
  return result.map((r) => r.table_schema as string);
}

export async function getTablesForSchema(
  dbIdentifier: string,
  schema: string,
  limit = 20
): Promise<string[]> {
  const dbPath = resolveDbPath(dbIdentifier);
  const dbName = extractDatabaseName(dbIdentifier);
  const safeSchema = schema.replace(/'/g, "''");
  const lim = Number.isFinite(limit as unknown as number)
    ? Math.max(1, Math.min(1000, limit))
    : 20;

  // Build WHERE clause with optional table_catalog filter
  let whereClause = `table_schema = '${safeSchema}' AND table_type = 'BASE TABLE'`;
  if (dbName) {
    const safeDbName = dbName.replace(/'/g, "''");
    whereClause += ` AND table_catalog = '${safeDbName}'`;
  }

  const result = await runSqlAndGetRowObjectsJson(
    dbPath,
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE ${whereClause}
      ORDER BY table_name
      LIMIT ${lim}
    `
  );
  console.log("getTablesForSchema result", result);
  return result.map((r) => r.table_name as string);
}

export async function getTables(
  dbIdentifier: string
): Promise<
  Array<{ table_schema: string; table_name: string; table_type: string }>
> {
  const dbPath = resolveDbPath(dbIdentifier);
  const dbName = extractDatabaseName(dbIdentifier);

  // Build WHERE clause with optional table_catalog filter
  let whereClause = "table_schema NOT IN ('information_schema', 'pg_catalog')";
  if (dbName) {
    const safeDbName = dbName.replace(/'/g, "''");
    whereClause += ` AND table_catalog = '${safeDbName}'`;
  }

  const tablesResult = await runSqlAndGetRowObjectsJson(
    dbPath,
    `
      SELECT 
        table_schema,
        table_name,
        table_type
      FROM information_schema.tables 
      WHERE ${whereClause}
      ORDER BY table_schema, table_name
    `
  );
  const filteredResult = tablesResult.filter(
    (table) => (table.table_type as string) === "BASE TABLE"
  ) as Array<{ table_schema: string; table_name: string; table_type: string }>;
  return filteredResult;
}


