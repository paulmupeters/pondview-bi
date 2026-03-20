/**
 * Prefix for materialized table identifiers
 */
export const MATERIALIZED_TABLE_PREFIX = "materialized:";

/**
 * Schema name for materialized tables
 */
export const MATERIALIZED_SCHEMA = "mat";

/**
 * Checks if a database identifier represents a materialized table
 */
export function isMaterializedTableIdentifier(dbIdentifier?: string): boolean {
  if (!dbIdentifier) {
    return false;
  }
  return dbIdentifier.startsWith(MATERIALIZED_TABLE_PREFIX);
}

/**
 * Extracts the table name from a materialized table identifier
 * Format: materialized:mat.<table_name>
 */
export function extractMaterializedTableName(
  dbIdentifier: string,
): string | null {
  if (!isMaterializedTableIdentifier(dbIdentifier)) {
    return null;
  }

  const parts = dbIdentifier.slice(MATERIALIZED_TABLE_PREFIX.length).split(".");
  if (parts.length >= 2 && parts[0] === MATERIALIZED_SCHEMA) {
    return parts.slice(1).join(".");
  }

  return null;
}

/**
 * Creates a materialized table identifier
 */
export function createMaterializedTableIdentifier(tableName: string): string {
  return `${MATERIALIZED_TABLE_PREFIX}${MATERIALIZED_SCHEMA}.${tableName}`;
}
