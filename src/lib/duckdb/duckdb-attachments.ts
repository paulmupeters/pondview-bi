import type { SourceConnectionConfig } from "@/lib/sources/source-config";

const ATTACH_TYPE_BY_SOURCE: Record<string, string | undefined> = {
  postgres: "postgres",
  mysql: "mysql",
  sqlite: "sqlite",
};

const DEFAULT_EXTENSION_BY_SOURCE: Record<string, string | undefined> = {
  motherduck: "motherduck",
  postgres: "postgres",
  mysql: "mysql",
  sqlite: "sqlite",
};

function sanitizeExtensionName(extension: string): string {
  const sanitized = extension.replace(/[^A-Za-z0-9_]/g, "");
  if (!sanitized) {
    throw new Error(`Invalid DuckDB extension name: ${extension}`);
  }
  return sanitized;
}

function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, "''");
}

export function quoteString(value: string): string {
  return `'${escapeSingleQuotes(value)}'`;
}

export function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function deriveAlias(connection: SourceConnectionConfig): string {
  if (connection.alias) {
    // Sanitize the explicitly provided alias to ensure it's a valid DuckDB identifier
    const sanitized = connection.alias.replace(/[^A-Za-z0-9_]/g, "_");
    const withoutLeadingUnderscore = sanitized.replace(/^_+/, "");
    return withoutLeadingUnderscore || "source";
  }

  const identifier = connection.identifier ?? "";
  const segments = identifier.split(/[/:]/).filter(Boolean);
  const candidate = segments[segments.length - 1] || "source";
  const sanitized = candidate.replace(/[^A-Za-z0-9_]/g, "_");
  const withoutLeadingUnderscore = sanitized.replace(/^_+/, "");
  return withoutLeadingUnderscore || "source";
}

function buildAttachStatement(
  connection: SourceConnectionConfig,
  alias: string,
): string {
  if (!connection.identifier) {
    throw new Error(
      `Cannot build ATTACH statement: no identifier resolved for connection (type=${connection.type}, connectionId=${connection.connectionId ?? "none"}).`,
    );
  }

  const attachParts: string[] = [];
  const attachType = ATTACH_TYPE_BY_SOURCE[connection.type];

  if (attachType) {
    attachParts.push(`TYPE ${attachType}`);
  }
  if (connection.readOnly) {
    attachParts.push("READ_ONLY");
  }

  const optionsClause =
    attachParts.length > 0 ? ` (${attachParts.join(", ")})` : "";
  return `ATTACH ${quoteString(connection.identifier)} AS ${quoteIdentifier(alias)}${optionsClause};`;
}

export interface AttachmentPlan {
  alias: string;
  statements: string[];
}

export function buildAttachmentPlan(
  connection: SourceConnectionConfig,
): AttachmentPlan {
  const alias = deriveAlias(connection);
  const statements: string[] = [];

  const extension =
    connection.duckdbExtension || DEFAULT_EXTENSION_BY_SOURCE[connection.type];
  if (extension && extension !== "duckdb") {
    const sanitizedExtension = sanitizeExtensionName(extension);
    statements.push(`INSTALL ${sanitizedExtension};`);
    statements.push(`LOAD ${sanitizedExtension};`);
  }

  statements.push(buildAttachStatement(connection, alias));

  return {
    alias,
    statements,
  };
}

export function buildDetachStatement(
  alias: string,
  options: { ifExists?: boolean } = {},
): string {
  const keyword = options.ifExists
    ? "DETACH DATABASE IF EXISTS"
    : "DETACH DATABASE";
  return `${keyword} ${quoteIdentifier(alias)};`;
}
