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
  options: {
    defaultSchema?: string;
  } = {},
): string {
  const defaultSchema = (options.defaultSchema ?? "main").trim() || "main";
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
        const normalizedSchema = schema.toLowerCase();
        if (
          normalizedSchema === alias.toLowerCase() ||
          ["temp", "information_schema"].includes(normalizedSchema)
        ) {
          return match;
        }
        if (normalizedSchema === defaultSchema.toLowerCase()) {
          return `${keyword} ${alias}.${table}`;
        }
        return `${keyword} ${alias}.${schema}.${table}`;
      },
    );
  }

  // No schema qualification - assume the attached database default schema.
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
      return `${keyword} ${alias}.${table}`;
    },
  );
}
