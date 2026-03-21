import type { TableRow } from "@/lib/db/driver";
import { getBunSql, resolvePostgresUri } from "@/lib/postgres/resolve";

function normalize(value: unknown): string | number | boolean | Date {
  if (value instanceof Date) return value;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  if (value == null) return "";
  return JSON.stringify(value);
}

export async function runSqlNormalized(
  dbIdentifier: string,
  query: string,
): Promise<TableRow[]> {
  const uri = resolvePostgresUri(dbIdentifier);
  // biome-ignore lint/suspicious/noExplicitAny: bun SQL client has no public type
  const client = getBunSql(uri) as any;
  const rows = await client.unsafe(query);
  return (rows as Array<Record<string, unknown>>).map((row) => {
    const out: TableRow = {};
    for (const [k, v] of Object.entries(row)) out[k] = normalize(v);
    return out;
  });
}
