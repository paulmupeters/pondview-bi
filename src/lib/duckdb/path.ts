import type { SourceConnectionConfig } from "@/../semantic-layer/source-updater";

const DEFAULT_RUNTIME_DUCKDB_PATH =
  process.env.DUCKDB_RUNTIME_DB?.trim() ||
  process.env.DUCKDB_PATH?.trim() ||
  process.env.DUCKDB_DATABASE_PATH?.trim() ||
  ":memory:";

/**
 * Parses a PostgreSQL URL and extracts connection components.
 * Supports both postgres:// and postgresql:// schemes.
 */
export interface PostgresUrlComponents {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  sslmode?: string;
}

export function parsePostgresUrl(url: string): PostgresUrlComponents | null {
  const trimmed = url.trim();
  if (!trimmed.startsWith("postgres://") && !trimmed.startsWith("postgresql://")) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname || "localhost";
    const port = parsed.port ? parseInt(parsed.port, 10) : 5432;
    const user = decodeURIComponent(parsed.username || "postgres");
    const password = decodeURIComponent(parsed.password || "");
    const database = decodeURIComponent(parsed.pathname.slice(1) || "postgres");
    
    // Parse query parameters for SSL mode and other options
    const params = new URLSearchParams(parsed.search);
    const sslmode = params.get("sslmode") || undefined;

    return {
      host,
      port,
      user,
      password,
      database,
      sslmode,
    };
  } catch (error) {
    console.error("Failed to parse PostgreSQL URL:", error);
    return null;
  }
}

/**
 * Builds a DuckDB-compatible Postgres connection string from components.
 * Format: "host=... port=... user=... password=... dbname=..."
 * Note: DuckDB's Postgres extension doesn't support sslmode parameter in the connection string.
 * SSL configuration should be handled at the server level or through environment variables.
 */
export function buildPostgresConnectionString(
  components: PostgresUrlComponents
): string {
  const parts: string[] = [];
  
  parts.push(`host=${components.host}`);
  parts.push(`port=${components.port}`);
  parts.push(`user=${components.user}`);
  if (components.password) {
    parts.push(`password=${components.password}`);
  }
  parts.push(`dbname=${components.database}`);
  
  // Note: DuckDB's Postgres extension doesn't support sslmode parameter
  // SSL configuration must be handled at the PostgreSQL server level
  // or through PostgreSQL environment variables (PGSSLMODE, etc.)

  return parts.join(" ");
}

/**
 * Converts a PostgreSQL URL to DuckDB's key=value connection string format.
 * If the input is already in key=value format, returns it unchanged.
 * If it's a PostgreSQL URL, parses and converts it.
 */
export function normalizePostgresConnectionString(
  connectionString: string
): string {
  const trimmed = connectionString.trim();
  
  // If it's already in key=value format (contains "host=" or "dbname="), return as-is
  if (trimmed.includes("host=") || trimmed.includes("dbname=")) {
    return trimmed;
  }

  // Try to parse as URL
  const components = parsePostgresUrl(trimmed);
  if (components) {
    return buildPostgresConnectionString(components);
  }

  // If we can't parse it, return as-is (might be a different format)
  return trimmed;
}

/**
 * Detects if a database identifier is a PostgreSQL URI and converts it to a SourceConnectionConfig.
 * Returns null if it's not a postgres URI.
 */
export function detectPostgresConnection(
  dbIdentifier: string
): SourceConnectionConfig | null {
  const id = (dbIdentifier ?? "").trim();
  if (!id) return null;

  // Check for postgres:// or postgresql:// URIs
  if (id.startsWith("postgres://") || id.startsWith("postgresql://")) {
    // Convert URL to DuckDB's key=value format
    const normalized = normalizePostgresConnectionString(id);
    return {
      type: "postgres",
      identifier: normalized,
      duckdbExtension: "postgres",
      readOnly: true, // Default to read-only for safety
    };
  }

  // Check for pg: alias format
  if (id.startsWith("pg:")) {
    const name = id.slice(3).trim() || "DEFAULT";
    const upper = name.toUpperCase();
    const candidates = [
      process.env[`PG_${upper}_URL`],
      process.env[`POSTGRES_${upper}_URL`],
      process.env[`PG_${upper}`],
      process.env[`POSTGRES_${upper}`],
      process.env.DATABASE_URL,
    ].filter(Boolean) as string[];

    const uri = candidates[0];
    if (!uri) {
      throw new Error(`No Postgres URL found for alias ${name}`);
    }

    // Convert the resolved URI to DuckDB format if it's a URL
    const normalized = normalizePostgresConnectionString(uri);
    return {
      type: "postgres",
      identifier: normalized,
      duckdbExtension: "postgres",
      readOnly: true,
    };
  }

  // Check if it's already in key=value format (for backward compatibility with new UI)
  if (id.includes("host=") || id.includes("dbname=")) {
    return {
      type: "postgres",
      identifier: id,
      duckdbExtension: "postgres",
      readOnly: true,
    };
  }

  return null;
}

export function resolveDbPath(dbIdentifier: string, token?: string): string {
  const id = (dbIdentifier ?? "").trim();
  if (!id) return DEFAULT_RUNTIME_DUCKDB_PATH;

  // Postgres identifiers are only used for attachments, so keep them in-memory
  const isPostgres = detectPostgresConnection(id) !== null;
  if (isPostgres) {
    return DEFAULT_RUNTIME_DUCKDB_PATH;
  }

  if (id.startsWith("duckdb:md:")) {
    const hasToken = /motherduck_token=/i.test(id);
    if (hasToken) return id;

    // Prefer user-provided token over environment variable
    const finalToken = token?.trim() || process.env.MOTHERDUCK_TOKEN || "";
    if (!finalToken) {
      // Return as-is if no token available (will likely fail, but preserves original behavior)
      return id;
    }

    const separator = id.includes("?") ? "&" : "?";
    // URL encode the token to handle special characters
    const encodedToken = encodeURIComponent(finalToken);

    return `${id.slice(7)}${separator}motherduck_token=${encodedToken}`;
  }
  if (id.startsWith("duckdb:")) {
    return id.slice(7);
  }
  return id;
}
