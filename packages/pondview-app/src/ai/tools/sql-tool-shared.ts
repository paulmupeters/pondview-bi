import { runQuery } from "@/lib/sql/run-query";
import { RUNTIME_SCHEMA_EXCLUSION_SQL } from "@/lib/sql/runtime-table-schemas";
import {
  classifyDbIdentifier,
  DEFAULT_WASM_DB_IDENTIFIER,
  resolveDbIdentifierForSqlBackend,
  resolveSqlBackend,
  type SqlBackend,
} from "@/lib/sql/sql-runtime";
import type { Result } from "@/lib/types";

export type RuntimeTableMetadata = {
  table_catalog: string;
  table_schema: string;
  table_name: string;
  table_type: string;
  table_reference: string;
};

const LIST_RUNTIME_TABLES_SQL = `
  SELECT
    table_catalog,
    table_schema,
    table_name,
    table_type
  FROM information_schema.tables
  WHERE table_schema NOT IN (${RUNTIME_SCHEMA_EXCLUSION_SQL})
  ORDER BY table_catalog, table_schema, table_name
`;

export function normalizeRows(rows: Record<string, unknown>[]): Result[] {
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

  return rows.map((row) => {
    const normalized: Result = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = normalizeValue(value);
    }
    return normalized;
  });
}

export function deriveColumns(
  rows: Result[],
): Array<{ name: string; type: string }> {
  if (rows.length === 0) {
    return [];
  }

  return Object.keys(rows[0]).map((name) => ({
    name,
    type: "string",
  }));
}

export function resolveToolRuntimeTarget(databasePath?: string): {
  backend: SqlBackend;
  dbIdentifier?: string;
} {
  const backend = resolveSqlBackend({ dbIdentifier: databasePath });
  const normalizedDatabasePath = databasePath?.trim();
  const safeDatabasePath =
    backend === "duckdb-wasm" &&
    normalizedDatabasePath &&
    classifyDbIdentifier(normalizedDatabasePath) === "unknown"
      ? DEFAULT_WASM_DB_IDENTIFIER
      : databasePath;

  return {
    backend,
    dbIdentifier: resolveDbIdentifierForSqlBackend(safeDatabasePath, backend),
  };
}

function normalizeIdentifierPart(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if (first === '"' && last === '"') {
      return trimmed.slice(1, -1).replace(/""/g, '"').toLowerCase();
    }
    if (first === "`" && last === "`") {
      return trimmed.slice(1, -1).replace(/``/g, "`").toLowerCase();
    }
  }
  return trimmed.toLowerCase();
}

function splitTableReference(reference: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "`" | null = null;

  for (let index = 0; index < reference.length; index += 1) {
    const char = reference[index];

    if (quote) {
      current += char;
      if (char === quote) {
        const next = reference[index + 1];
        if (next === quote) {
          current += next;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (char === '"' || char === "`") {
      quote = char;
      current += char;
      continue;
    }

    if (char === ".") {
      const part = current.trim();
      if (!part) {
        return [];
      }
      parts.push(part);
      current = "";
      continue;
    }

    current += char;
  }

  if (quote) {
    return [];
  }

  const finalPart = current.trim();
  if (!finalPart) {
    return [];
  }
  parts.push(finalPart);
  return parts;
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function isDefaultTableSchema(schema: string): boolean {
  const normalized = schema.trim().toLowerCase();
  return normalized === "" || normalized === "main" || normalized === "public";
}

export function buildRuntimeTableReference(
  table: Pick<
    RuntimeTableMetadata,
    "table_catalog" | "table_schema" | "table_name"
  >,
): string {
  const catalog = table.table_catalog.trim();
  const schema = table.table_schema.trim() || "main";
  const name = table.table_name.trim();
  const parts = catalog
    ? [catalog, schema, name]
    : isDefaultTableSchema(schema)
      ? [name]
      : [schema, name];

  return parts.map(quoteIdentifier).join(".");
}

function formatReferenceForError(table: RuntimeTableMetadata): string {
  return buildRuntimeTableReference(table);
}

export function resolveRuntimeTableReferenceFromMetadata(
  tableReference: string,
  tables: RuntimeTableMetadata[],
): string {
  const parts = splitTableReference(tableReference);
  if (parts.length === 0 || parts.length > 3) {
    return tableReference;
  }

  let normalizedParts = parts.map(normalizeIdentifierPart);
  if (normalizedParts.length === 1 && normalizedParts[0]?.includes(".")) {
    normalizedParts = splitTableReference(normalizedParts[0]).map(
      normalizeIdentifierPart,
    );
  }
  if (normalizedParts.length === 0 || normalizedParts.length > 3) {
    return tableReference;
  }
  const matches = tables.filter((table) => {
    const catalog = table.table_catalog.trim().toLowerCase();
    const schema = table.table_schema.trim().toLowerCase();
    const name = table.table_name.trim().toLowerCase();

    if (normalizedParts.length === 1) {
      return name === normalizedParts[0];
    }

    if (normalizedParts.length === 2) {
      const [qualifier, tableName] = normalizedParts;
      return (
        name === tableName &&
        (schema === qualifier ||
          catalog === qualifier ||
          (isDefaultTableSchema(qualifier) && isDefaultTableSchema(schema)))
      );
    }

    const [catalogName, schemaName, tableName] = normalizedParts;
    return (
      catalog === catalogName && schema === schemaName && name === tableName
    );
  });

  if (matches.length === 0) {
    return tableReference;
  }

  if (matches.length > 1) {
    const options = matches.map(formatReferenceForError).join(", ");
    throw new Error(
      `Table reference "${tableReference}" is ambiguous. Use one of: ${options}`,
    );
  }

  return buildRuntimeTableReference(matches[0]);
}

export async function listRuntimeTables(
  databasePath?: string,
): Promise<RuntimeTableMetadata[]> {
  const { dbIdentifier } = resolveToolRuntimeTarget(databasePath);
  const result = await runQuery({ sql: LIST_RUNTIME_TABLES_SQL, dbIdentifier });

  return result.rows.map((row) => {
    const metadata = {
      table_catalog: String(row.table_catalog ?? ""),
      table_schema: String(row.table_schema ?? ""),
      table_name: String(row.table_name ?? ""),
      table_type: String(row.table_type ?? ""),
    };

    return {
      ...metadata,
      table_reference: buildRuntimeTableReference(metadata),
    };
  });
}

export async function resolveRuntimeTableReference(
  tableReference: string,
  databasePath?: string,
): Promise<string> {
  const tables = await listRuntimeTables(databasePath);
  return resolveRuntimeTableReferenceFromMetadata(tableReference, tables);
}

export async function executeSqlForRuntime(
  sql: string,
  databasePath?: string,
): Promise<{
  rows: Result[];
  durationMs: number;
  backend: SqlBackend;
  dbIdentifier?: string;
}> {
  const { dbIdentifier } = resolveToolRuntimeTarget(databasePath);
  const response = await runQuery({ sql, dbIdentifier });
  return {
    rows: normalizeRows(response.rows),
    durationMs: response.durationMs,
    backend: response.backend,
    dbIdentifier,
  };
}
