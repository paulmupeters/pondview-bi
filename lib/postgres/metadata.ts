import { getBunSql, resolvePostgresUri } from "@/lib/postgres/resolve";

function dbFor(id: string) {
  return getBunSql(resolvePostgresUri(id)) as any;
}

export async function getSchemas(id: string): Promise<string[]> {
  const db = dbFor(id);
  const rows = await db`
    SELECT schema_name FROM information_schema.schemata 
    WHERE schema_name NOT IN ('information_schema','pg_catalog')
    ORDER BY 1
  `;
  return (rows as Array<{ schema_name: string }>).map((r) => r.schema_name);
}

export async function getTablesForSchema(
  id: string,
  schema: string,
  limit = 20,
): Promise<string[]> {
  const lim = Math.max(1, Math.min(1000, Number(limit) || 20));
  const db = dbFor(id);
  const rows = await db`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = ${schema} AND table_type='BASE TABLE' 
    ORDER BY table_name 
    LIMIT ${lim}
  `;
  return (rows as Array<{ table_name: string }> ).map((r) => r.table_name);
}

export async function getTables(
  id: string,
): Promise<
  Array<{ table_schema: string; table_name: string; table_type: string }>
> {
  const db = dbFor(id);
  const rows = await db`
    SELECT table_schema, table_name, table_type 
    FROM information_schema.tables 
    WHERE table_schema NOT IN ('information_schema','pg_catalog') 
    ORDER BY table_schema, table_name
  `;
  return (rows as Array<{ table_schema: string; table_name: string; table_type: string }> ).filter((r) => r.table_type === "BASE TABLE");
}
