# DuckDB Usage Overview

This note summarizes every place the app touches DuckDB today, how each surface is wired, and where the boundaries are starting to blur (dashboards, cached tables, AI tools). Use it as the source of truth until we consolidate the runners the way we want (either WASM/HTTP for local materializations and Node API for connected tables).

## Execution Surfaces at a Glance

| Runner | Where it lives | Primary entry points | Typical identifiers |
| --- | --- | --- | --- |
| Node adapter (`@duckdb/node-api`) | `src/lib/duckdb/duckdb-node.ts` via `runSqlNormalized` | AI tools, SQL console/REPL, dashboards, `/api/tables`, schema introspection | `md:analytics`, `duckdb:data/server.duckdb`, any filesystem path |
| HTTP adapter (`duckdb-http`) | `src/lib/duckdb/duckdb-http.ts` + `/api/duckdb/query` when `config` is provided | Semantic-layer materializer, manual `/api/duckdb/query` calls, future remote DuckDBs | URL, host/port (+ auth) |
| DuckDB-Wasm (OPFS) | `src/lib/duckdb/duckdb-wasm.ts` + `duckdb-wasm-client.ts` | Connect Data dialog “cache in DuckDB” path, local cleanup | Implicit `opfs://local.duckdb` |

## Node Adapter (`runSqlNormalized`)

`runSqlNormalized` is the only path the server uses when a `dbIdentifier` does **not** look like Postgres. It resolves the identifier, runs the SQL through `@duckdb/node-api`, and normalizes the rows before they ever touch React components.

```5:33:src/lib/db/router.ts
export const runSqlNormalized = (id: string, sql: string) =>
  selectAdapter(id).runSqlNormalized(id, sql);
```

```5:32:src/lib/duckdb/query.ts
export async function runSqlNormalized(
  dbIdentifier: string,
  sql: string,
): Promise<Result[]> {
  const dbPath = resolveDbPath(dbIdentifier);
  const rawRows = await runRaw(dbPath, sql);
  // ...
}
```

```52:64:src/lib/duckdb/duckdb-node.ts
export async function runSqlAndGetRowObjectsJson(
  dbPath: string,
  sql: string
): Promise<Record<string, unknown>[]> {
  const instance = await getDuckDbInstance(dbPath);
  const connection = await instance.connect();
  const reader = await connection.runAndReadAll(sql);
  return reader.getRowObjectsJson();
}
```

### Features that currently hard-depend on `runSqlNormalized`

- **AI tools** – `executeSqlTool` and `getTableSchemaTool` both call `runSqlNormalized` directly, so the LLM is always talking to the node adapter no matter what database identifier it sees.
- **Prompt input SQL/chart mode** – `SqlAnalysisDisplay`, `DuckdbRepl`, and `createDuckDbExecuteQuery` all funnel through the `runSqlAndGetRowObjectsJson` server action (`src/actions/queries.ts`), which again calls `runSqlNormalized`.
- **Dashboards** – API routes `src/app/api/dashboard/[dashboardId]/data/route.ts` and `dimension-values/route.ts` call `runSqlNormalized` with the `chart.dbIdentifier` that gets captured when a card is saved.
- **Schema browsing** – Server actions `getSchemas`, `getTables`, and `/api/tables` run through the same adapter.

### What `dbIdentifier` actually is today

- `resolveDbPath` accepts bare file paths, `duckdb:` URIs, or `md:` MotherDuck identifiers (injecting the token automatically).
- The identifier that ends up on a chart (and therefore on a dashboard) ultimately flows from `selectedDb` in `PromptInputWrapper`, which comes from the `ConnectedDataPanel`. That panel currently prefers `attachAs` over the true connection string:

```50:67:src/components/connected-data-panel.tsx
const getDbIdentifier = (entry: (typeof connectedTables)[0]): string => {
  return entry.attachAs || `${entry.type}:${entry.databasePath}`;
};
```

> **Implication:** when `attachAs` exists (it always does in `appendConnectedTable`), dashboards persist e.g. `finance_source` instead of `md:production`. `resolveDbPath` treats that as a local DuckDB file. That mismatch is what causes most “dashboard can’t find table” reports whenever the wrong method is picked.

## HTTP Adapter (`duckdb-http`)

The HTTP path lets us talk to DuckDB instances exposed through the `httpserver` extension. Two places use it today:

1. **On-demand queries** – `runQuery` (client) posts to `/api/duckdb/query`. If the request body contains `config`, that route calls `runSqlAndGetRowObjectsJsonHttp` instead of the node adapter.
2. **Semantic-layer materialization** – `src/lib/materialization/semantic-layer.ts` uses `executeDuckDbHttpQuery` for every statement, so materializations and their tracking table always run on the HTTP endpoint, not the local DuckDB instance.

```133:188:src/app/api/duckdb/query/route.ts
if (body.dbIdentifier) {
  const dbPath = resolveDbPath(body.dbIdentifier);
  const rows = await runSqlAndGetRowObjectsJson(dbPath, body.sql);
  return Response.json({ rows });
}
const rows = await runSqlAndGetRowObjectsJsonHttp(body.config, body.sql, req.signal);
return Response.json({ rows });
```

```58:123:src/lib/materialization/semantic-layer.ts
const config = resolveHttpDuckDbConfig(options.duckdb);
await ensureTrackingTable(config);
// ...
await executeDuckDbHttpQuery(config, sql);
```

## DuckDB-Wasm (OPFS)

`DuckdbWasmProvider` owns a singleton `AsyncDuckDB` that reads/writes `opfs://local.duckdb`. The only consumer right now is `ConnectDataDialog` (plus the cleanup path when a connected table is removed):

- When “Cache in DuckDB-Wasm” is toggled, `connect-data-dialog.tsx` fetches rows from `/api/tables` and calls `DuckdbWasmClient.insertJSONRows(schema, table, rows)`, which writes JSON into OPFS and creates the table in the browser.
- Removing a connected table drops the cached tables by calling `DuckdbWasmClient.dropTable`.

No query surface actually reads those cached OPFS tables yet; the WASM database never feeds dashboards or the SQL console.

## Connected Tables Data Flow

1. **Capture** – `appendConnectedTable` stores entries (type, `databasePath`, optional schema/tables, `attachAs`, etc.) in `localStorage` and POSTs to `/api/semantic-layer/sources` so the semantic layer can attach the same source later.
2. **Client selection** – `useConnectedTables` hydrates those entries so components such as `ConnectedDataPanel` can present them. Selecting one sets `selectedDb` to either `attachAs` or `type:databasePath`.
3. **Authoring** – `PromptInputWrapper` passes `selectedDb` into:
   - `DuckdbRepl` → `createDuckDbExecuteQuery` → `/api/duckdb/query` → `runSqlNormalized`.
   - `SqlAnalysisDisplay` when charting, which ends up in the same server action.
   - `DashboardBuilderPanel`, which persists `payload.dbIdentifier` so future dashboard loads will again run `runSqlNormalized` with the same string.
4. **AI context** – `connectedTables` is serialized into the chat system prompt, but all tool invocations still route through `runSqlNormalized`.

## Pain Points & Aligning to the Desired Split

- **Cached WASM tables are effectively write-only.** We ingest rows into OPFS but no code ever uses the WASM connection to satisfy a query. If local materialized tables should prefer WASM or HTTP, we either need to run queries through `DuckdbWasmClient` (for purely local work) or push those tables to the HTTP endpoint that the semantic layer already uses.
- **Dashboards/SQL console can’t tell which runner to use.** Every `dbIdentifier` currently flows into the node adapter. When an identifier is actually an alias (`attachAs`) or a semantic-layer materialized table name, `resolveDbPath` opens/creates a local DuckDB file with that alias instead of attaching to the intended source. We need an explicit discriminator (e.g., `duckdb+wasm://`, `duckdb+http://`, `duckdb+node://`) or at minimum stop swapping the identifier for `attachAs` in `ConnectedDataPanel`.
- **Materialization runner is isolated.** The semantic layer writes to HTTP, but dashboards still read through the node adapter, so they never see the HTTP-only tables unless we manually re-attach them locally. Deciding “materialized tables = WASM or HTTP” means we should either (a) keep them entirely in OPFS and run dashboards via WASM, or (b) materialize via HTTP and ensure dashboards query that same HTTP endpoint instead of the node adapter.
- **Connected tables should stay on the node adapter.** To reach the target architecture (“connected_tables using runSqlNormalized via node API”), we simply need to propagate the original `databasePath` (`md:...`, `duckdb:...`, filesystem path) into `selectedDb`/`dbIdentifier` everywhere instead of the alias, and make sure dashboards persist that identifier. Once that is in place, the node adapter remains the single source of truth for connected sources, while local materializations can move to the WASM or HTTP runner.

> **Next actions:** Decide on an explicit `dbIdentifier` scheme (or metadata field) that lets us route queries to the right runner, update `ConnectedDataPanel` to emit real connection strings, and add a consumer that can query the WASM/HTTP materialized tables before we rely on them in dashboards.


