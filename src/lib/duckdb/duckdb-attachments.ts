import type { SourceConnectionConfig } from "@/lib/sources/source-config";

const ATTACH_TYPE_BY_SOURCE: Record<string, string | undefined> = {
  postgres: "postgres",
  mysql: "mysql",
  sqlite: "sqlite",
};

const DEFAULT_EXTENSION_BY_SOURCE: Record<string, string | undefined> = {
  duckdb_remote: "httpfs",
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

const RESERVED_DUCKDB_NAMES = new Set(["main", "system", "temp", "temporary"]);

function stripQueryString(identifier: string): string {
  const queryIndex = identifier.indexOf("?");
  return queryIndex >= 0 ? identifier.slice(0, queryIndex) : identifier;
}

type AttachmentAliasInput = Pick<
  SourceConnectionConfig,
  "alias" | "identifier"
>;

export function resolveAttachmentAlias(
  connection: AttachmentAliasInput,
): string {
  if (connection.alias) {
    // Sanitize the explicitly provided alias to ensure it's a valid DuckDB identifier
    const sanitized = connection.alias.replace(/[^A-Za-z0-9_]/g, "_");
    const withoutLeadingUnderscore = sanitized.replace(/^_+/, "");
    const alias = withoutLeadingUnderscore || "source";
    return RESERVED_DUCKDB_NAMES.has(alias.toLowerCase())
      ? `${alias}_db`
      : alias;
  }

  const identifier = connection.identifier ?? "";
  const segments = stripQueryString(identifier).split(/[/:]/).filter(Boolean);
  const candidate = segments[segments.length - 1] || "source";
  const sanitized = candidate.replace(/[^A-Za-z0-9_]/g, "_");
  const withoutLeadingUnderscore = sanitized.replace(/^_+/, "");
  const alias = withoutLeadingUnderscore || "source";
  return RESERVED_DUCKDB_NAMES.has(alias.toLowerCase()) ? `${alias}_db` : alias;
}

function buildAttachStatement(
  connection: SourceConnectionConfig,
  alias: string,
): string {
  const identifier = connection.identifier ?? connection.connectionId;
  if (!identifier) {
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
  return `ATTACH ${quoteString(identifier)} AS ${quoteIdentifier(alias)}${optionsClause};`;
}

export interface AttachmentPlan {
  alias: string;
  statements: string[];
}

export interface AttachmentPlanOptions {
  skipExtensionLoad?: boolean;
}

export function buildAttachmentPlan(
  connection: SourceConnectionConfig,
  options: AttachmentPlanOptions = {},
): AttachmentPlan {
  const alias = resolveAttachmentAlias(connection);
  const statements: string[] = [];

  const extension =
    connection.duckdbExtension || DEFAULT_EXTENSION_BY_SOURCE[connection.type];
  if (extension && extension !== "duckdb" && !options.skipExtensionLoad) {
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
