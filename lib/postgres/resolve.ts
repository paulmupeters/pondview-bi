// Note: We require('bun') at runtime inside getBunSql to avoid build-time issues under Node.

declare global {
  // eslint-disable-next-line no-var
  var __bunSqlClients: Map<string, unknown> | undefined;
}

const clientCache: Map<string, unknown> =
  globalThis.__bunSqlClients ?? new Map();
if (!globalThis.__bunSqlClients) globalThis.__bunSqlClients = clientCache;

export function resolvePostgresUri(dbIdentifier: string): string {
  const id = (dbIdentifier ?? "").trim();
  if (!id) throw new Error("Empty Postgres identifier");
  if (id.startsWith("postgres://") || id.startsWith("postgresql://"))
    return id;
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
    if (!uri) throw new Error(`No Postgres URL found for alias ${name}`);
    return uri;
  }
  throw new Error(
    "Unsupported Postgres identifier. Use postgres:// or pg:ALIAS",
  );
}

export function getBunSql(uri: string): unknown {
  let client = clientCache.get(uri);
  if (!client) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { SQL } = require("bun");
    client = new SQL(uri);
    clientCache.set(uri, client);
  }
  return client;
}
