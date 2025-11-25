import {
  buildAttachmentPlan,
  buildDetachStatement,
} from "@/lib/duckdb/duckdb-attachments";
import {
  getDuckDbInstance,
  runSqlAndGetRowObjectsJson as runRaw,
} from "@/lib/duckdb/duckdb-node";
import { detectPostgresConnection, resolveDbPath } from "@/lib/duckdb/path";
import type { Result } from "@/lib/types";

/**
 * Rewrites SQL to reference tables in an attached database.
 * Handles cases where tables are already schema-qualified or not.
 */
function rewriteSqlForAttachedDatabase(sql: string, alias: string): string {
  // Simple heuristic: if the SQL already contains schema-qualified names
  // (e.g., "public.users" or "schema.table"), prepend the alias.
  // Otherwise, assume tables are in the public schema.

  // Escape the alias for use in regex
  const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Don't rewrite if the alias is already present
  if (new RegExp(`\\b${escapedAlias}\\.`, "i").test(sql)) {
    return sql;
  }

  // Check if SQL has schema-qualified table names (pattern: schema.table)
  const hasSchemaQualified = /\b\w+\.\w+\b/.test(sql);

  if (hasSchemaQualified) {
    // Prepend alias to schema-qualified names
    // Pattern: FROM schema.table -> FROM alias.schema.table
    return sql.replace(
      /\b(FROM|JOIN|UPDATE|INTO)\s+(\w+)\.(\w+)/gi,
      (match, keyword, schema, table) => {
        // Don't rewrite if it's already prefixed with the alias or is a known DuckDB schema
        if (
          schema.toLowerCase() === alias.toLowerCase() ||
          ["main", "temp", "information_schema"].includes(schema.toLowerCase())
        ) {
          return match;
        }
        return `${keyword} ${alias}.${schema}.${table}`;
      }
    );
  } else {
    // No schema qualification - assume public schema
    // Pattern: FROM table -> FROM alias.public.table
    return sql.replace(
      /\b(FROM|JOIN|UPDATE|INTO)\s+(\w+)(?:\s|$|;|,)/gi,
      (match, keyword, table) => {
        // Don't rewrite if it's a keyword or already qualified
        if (
          [
            "select",
            "where",
            "group",
            "order",
            "having",
            "limit",
            "offset",
          ].includes(table.toLowerCase()) ||
          match.includes(".")
        ) {
          return match;
        }
        return `${keyword} ${alias}.public.${table}`;
      }
    );
  }
}

function normalizeRows(rawRows: Record<string, unknown>[]): Result[] {
  const normalizeValue = (value: unknown): string | number | boolean | Date => {
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
  };

  return rawRows.map((row) => {
    const out: Record<string, string | number | boolean | Date> = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = normalizeValue(value);
    }
    return out;
  });
}

/**
 * Executes SQL with optional postgres attachment handling.
 * If dbIdentifier is a postgres URI, attaches it to DuckDB first, executes the query,
 * then detaches it.
 */
export async function runSqlNormalized(
  dbIdentifier: string,
  sql: string
): Promise<Result[]> {
  const postgresConfig = detectPostgresConnection(dbIdentifier);
  const dbPath = resolveDbPath(dbIdentifier);

  // If it's a postgres URI, we need to handle attachment/detachment
  if (postgresConfig) {
    const attachmentPlan = buildAttachmentPlan(postgresConfig);
    const instance = await getDuckDbInstance(dbPath);
    const connection = await instance.connect();

    try {
      // Execute attachment statements
      for (const statement of attachmentPlan.statements) {
        await connection.runAndReadAll(statement);
      }

      // Rewrite SQL to use the attached database alias
      const rewrittenSql = rewriteSqlForAttachedDatabase(
        sql,
        attachmentPlan.alias
      );

      // Execute the query
      const reader = await connection.runAndReadAll(rewrittenSql);
      const rawRows = reader.getRowObjectsJson();

      // Normalize and return results
      return normalizeRows(rawRows);
    } finally {
      // Always detach, even if there was an error
      try {
        const detachSql = buildDetachStatement(attachmentPlan.alias, {
          ifExists: true,
        });
        await connection.runAndReadAll(detachSql);
      } catch (detachError) {
        // Log but don't throw - detach errors shouldn't fail the query
        console.warn("Failed to detach postgres database:", detachError);
      }
    }
  }

  // For non-postgres identifiers, use the original flow
  const rawRows = await runRaw(dbPath, sql);
  return normalizeRows(rawRows);
}
