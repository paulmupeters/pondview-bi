import type { SourceConnectionConfig } from "@/../semantic-layer/source-updater";

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
    return {
      type: "postgres",
      identifier: id,
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

    return {
      type: "postgres",
      identifier: uri,
      duckdbExtension: "postgres",
      readOnly: true,
    };
  }

  return null;
}

export function resolveDbPath(dbIdentifier: string, token?: string): string {
  const id = (dbIdentifier ?? "").trim();
  if (!id) return ":memory:";
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
