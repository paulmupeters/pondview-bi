import {
  buildAttachmentPlan,
  buildDetachStatement,
} from "@/lib/duckdb/duckdb-attachments";
import {
  getDuckDbInstance,
  runSqlAndGetRowObjectsJson as runRaw,
} from "@/lib/duckdb/duckdb-node";
import { detectExternalConnection, resolveDbPath } from "@/lib/duckdb/path";
import { rewriteSqlForAttachedDatabase } from "@/lib/duckdb/rewrite-sql";
import type { Result } from "@/lib/types";

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
  sql: string,
): Promise<Result[]> {
  const externalConnection = detectExternalConnection(dbIdentifier);
  const dbPath = resolveDbPath(dbIdentifier);

  // If it's an external URI (postgres/mysql), we need to handle attachment/detachment
  if (externalConnection) {
    const attachmentPlan = buildAttachmentPlan(externalConnection);
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
        attachmentPlan.alias,
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
