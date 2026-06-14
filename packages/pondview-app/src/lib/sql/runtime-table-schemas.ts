const HIDDEN_RUNTIME_SCHEMAS = [
  "information_schema",
  "pg_catalog",
  "pondview",
  "pondview_exec",
  "md_information_schema",
] as const;

const HIDDEN_RUNTIME_SCHEMA_SET = new Set(
  HIDDEN_RUNTIME_SCHEMAS.map((schema) => schema.toLowerCase()),
);

export const RUNTIME_SCHEMA_EXCLUSION_SQL = HIDDEN_RUNTIME_SCHEMAS.map(
  (schema) => `'${schema}'`,
).join(", ");

export function isHiddenRuntimeSchema(schema: string): boolean {
  return HIDDEN_RUNTIME_SCHEMA_SET.has(schema.trim().toLowerCase());
}
