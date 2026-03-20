import {
  buildAttachmentPlan,
  buildDetachStatement,
} from "@/lib/duckdb/duckdb-attachments";
import {
  getDuckDbInstance,
  runSqlAndGetRowObjectsJson,
} from "@/lib/duckdb/duckdb-node";
import {
  extractMotherDuckDatabaseName,
  isMotherDuckIdentifier,
} from "@/lib/duckdb/motherduck";
import { detectExternalConnection, resolveDbPath } from "@/lib/duckdb/path";

/**
 * Extracts the database name (table_catalog) from a DuckDB identifier.
 * For MotherDuck: extracts the database name from an `md:` identifier.
 * For local files: returns null (will need to query information_schema to get catalog)
 */
function extractDatabaseName(dbIdentifier: string): string | null {
  const id = (dbIdentifier ?? "").trim();
  if (!id) return null;

  if (isMotherDuckIdentifier(id)) {
    return extractMotherDuckDatabaseName(id) || null;
  }

  // For local files, we'll need to query information_schema to get the catalog
  // Return null to indicate we should query for it
  return null;
}

export async function getSchemas(dbIdentifier: string): Promise<string[]> {
  const externalConnection = detectExternalConnection(dbIdentifier);
  const dbPath = resolveDbPath(dbIdentifier);

  // If it's an external URI (postgres/mysql), query through the attached database
  if (externalConnection) {
    const attachmentPlan = buildAttachmentPlan(externalConnection);
    const instance = await getDuckDbInstance(dbPath);
    const connection = await instance.connect();

    try {
      // Execute attachment statements
      for (const statement of attachmentPlan.statements) {
        await connection.runAndReadAll(statement);
      }

      // Query postgres information_schema through the attached database
      const sql = `
        SELECT DISTINCT table_schema
        FROM ${attachmentPlan.alias}.information_schema.tables
        WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
        ORDER BY 1
      `;

      const reader = await connection.runAndReadAll(sql);
      const result = reader.getRowObjectsJson();
      return result.map((r) => String(r.table_schema));
    } finally {
      // Always detach
      try {
        const detachSql = buildDetachStatement(attachmentPlan.alias, {
          ifExists: true,
        });
        await connection.runAndReadAll(detachSql);
      } catch (detachError) {
        console.warn("Failed to detach postgres database:", detachError);
      }
    }
  }

  // For non-postgres identifiers, use the original flow
  const dbName = extractDatabaseName(dbIdentifier);
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
    `,
  );
  console.log("getSchemas result", result);
  return result.map((r) => r.table_schema as string);
}

export async function getTablesForSchema(
  dbIdentifier: string,
  schema: string,
  limit = 20,
): Promise<string[]> {
  const externalConnection = detectExternalConnection(dbIdentifier);
  const dbPath = resolveDbPath(dbIdentifier);
  const safeSchema = schema.replace(/'/g, "''");
  const lim = Number.isFinite(limit as unknown as number)
    ? Math.max(1, Math.min(1000, limit))
    : 20;

  // If it's an external URI (postgres/mysql), query through the attached database
  if (externalConnection) {
    const attachmentPlan = buildAttachmentPlan(externalConnection);
    const instance = await getDuckDbInstance(dbPath);
    const connection = await instance.connect();

    try {
      // Execute attachment statements
      for (const statement of attachmentPlan.statements) {
        await connection.runAndReadAll(statement);
      }

      // Query postgres information_schema through the attached database
      const sql = `
        SELECT table_name
        FROM ${attachmentPlan.alias}.information_schema.tables
        WHERE table_schema = '${safeSchema}' AND table_type = 'BASE TABLE'
        ORDER BY table_name
        LIMIT ${lim}
      `;

      const reader = await connection.runAndReadAll(sql);
      const result = reader.getRowObjectsJson();
      return result.map((r) => String(r.table_name));
    } finally {
      // Always detach
      try {
        const detachSql = buildDetachStatement(attachmentPlan.alias, {
          ifExists: true,
        });
        await connection.runAndReadAll(detachSql);
      } catch (detachError) {
        console.warn("Failed to detach postgres database:", detachError);
      }
    }
  }

  // For non-postgres identifiers, use the original flow
  const dbName = extractDatabaseName(dbIdentifier);
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
    `,
  );
  console.log("getTablesForSchema result", result);
  return result.map((r) => r.table_name as string);
}

export async function getTables(
  dbIdentifier: string,
): Promise<
  Array<{ table_schema: string; table_name: string; table_type: string }>
> {
  const externalConnection = detectExternalConnection(dbIdentifier);
  const dbPath = resolveDbPath(dbIdentifier);

  // If it's an external URI (postgres/mysql), query through the attached database
  if (externalConnection) {
    const attachmentPlan = buildAttachmentPlan(externalConnection);
    const instance = await getDuckDbInstance(dbPath);
    const connection = await instance.connect();

    try {
      // Execute attachment statements
      for (const statement of attachmentPlan.statements) {
        await connection.runAndReadAll(statement);
      }

      // Query postgres information_schema through the attached database
      const sql = `
        SELECT 
          table_schema,
          table_name,
          table_type
        FROM ${attachmentPlan.alias}.information_schema.tables 
        WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
        ORDER BY table_schema, table_name
      `;

      const reader = await connection.runAndReadAll(sql);
      const tablesResult = reader.getRowObjectsJson();
      const filteredResult = tablesResult.filter(
        (table) => String(table.table_type) === "BASE TABLE",
      ) as Array<{
        table_schema: string;
        table_name: string;
        table_type: string;
      }>;
      return filteredResult;
    } finally {
      // Always detach
      try {
        const detachSql = buildDetachStatement(attachmentPlan.alias, {
          ifExists: true,
        });
        await connection.runAndReadAll(detachSql);
      } catch (detachError) {
        console.warn("Failed to detach postgres database:", detachError);
      }
    }
  }

  // For non-postgres identifiers, use the original flow
  const dbName = extractDatabaseName(dbIdentifier);
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
    `,
  );
  const filteredResult = tablesResult.filter(
    (table) => (table.table_type as string) === "BASE TABLE",
  ) as Array<{ table_schema: string; table_name: string; table_type: string }>;
  return filteredResult;
}
