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
 * Executes SQL with attachment handling for external extension-backed sources.
 * MotherDuck is opened directly via the database path; Postgres/MySQL/SQLite
 * are attached for the duration of the query.
 */
export async function runSqlNormalized(
  dbIdentifier: string,
  sql: string,
): Promise<Result[]> {
  const externalConnection = detectExternalConnection(dbIdentifier);
  const dbPath = resolveDbPath(dbIdentifier);

  // External URIs are attached temporarily before executing the query.
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

  // MotherDuck and local DuckDB paths are opened directly.
  const rawRows = await runRaw(dbPath, sql);
  return normalizeRows(rawRows);
}
