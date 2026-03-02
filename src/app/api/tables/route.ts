import {
  getSchemas,
  getTablesForSchema,
  runSqlNormalized,
} from "@/lib/db/router";

export const runtime = "nodejs";

function quoteIdent(id: string): string {
  return '"' + id.replace(/"/g, '""') + '"';
}

export async function GET(req: Request) {
  console.log("GET request received");
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const schema = searchParams.get("schema");
  const table = searchParams.get("table");
  const limit = searchParams.get("limit");

  if (!id) {
    return new Response(
      JSON.stringify({ error: "Missing required query param: id" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  try {
    // Metadata mode: list schemas for a database.
    if (!schema && !table) {
      const schemas = await getSchemas(id);
      return Response.json({ schemas });
    }

    // Metadata mode: list tables for a schema.
    if (schema && !table) {
      const schemaTablesLimit = limit ? Math.max(1, Number(limit) || 20) : 20;
      const tables = await getTablesForSchema(id, schema, schemaTablesLimit);
      return Response.json({ schema, tables });
    }

    if (!schema || !table) {
      return new Response(
        JSON.stringify({
          error: "When table is provided, schema is required.",
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }

    const qSchema = quoteIdent(schema);
    const qTable = quoteIdent(table);
    const lim = limit ? Math.max(0, Number(limit) || 0) : 0;
    const sql =
      lim > 0
        ? `select * from ${qSchema}.${qTable} limit ${lim}`
        : `select * from ${qSchema}.${qTable}`;

    const rows = await runSqlNormalized(id, sql);
    console.log("GET request completed");
    // Return row-major JSON array suitable for DuckDB-Wasm insertJSONFromPath
    return Response.json({ schema, table, rows });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e ?? "");
    console.error(message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}


