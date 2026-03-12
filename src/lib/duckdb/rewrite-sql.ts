/**
 * Rewrites SQL to reference tables in an attached database.
 * Handles cases where tables are already schema-qualified or not.
 *
 * Extracted from `query.ts` so it can be shared with the REPL and other
 * consumers that need to prefix table references with an attached alias.
 */
export function rewriteSqlForAttachedDatabase(
  sql: string,
  alias: string,
): string {
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
      (match, keyword: string, schema: string, table: string) => {
        // Don't rewrite if it's already prefixed with the alias or is a known DuckDB schema
        if (
          schema.toLowerCase() === alias.toLowerCase() ||
          ["main", "temp", "information_schema"].includes(schema.toLowerCase())
        ) {
          return match;
        }
        return `${keyword} ${alias}.${schema}.${table}`;
      },
    );
  }

  // No schema qualification - assume public schema
  // Pattern: FROM table -> FROM alias.public.table
  return sql.replace(
    /\b(FROM|JOIN|UPDATE|INTO)\s+(\w+)(?:\s|$|;|,)/gi,
    (match, keyword: string, table: string) => {
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
    },
  );
}
