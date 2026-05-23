# DuckDB Wasm Provider Usage

This guide describes how to work with the shared DuckDB-Wasm singleton exposed by `DuckdbWasmProvider`, alongside the higher-level `DuckdbWasmClient`. It covers acquiring the connection, executing queries, cancelling work, and tearing everything down when you are finished.

## Connection Lifecycle

- Import and cache the provider once per bundle:

```ts
import { DuckdbWasmProvider } from "@/lib/duckdb/duckdb-wasm";

const duckdbProvider = DuckdbWasmProvider.getInstance();
```

- The first call to `getCurrentWasm()` boots the WASM bundle, opens the database, and creates a single `AsyncDuckDBConnection`. Later calls reuse both the connection and the in-flight promise:

```ts
const { db, con } = await duckdbProvider.getCurrentWasm();
```

- While the provider is initialising it keeps `asyncDuckDBState === "initialising"`, so any concurrent callers share the same promise instead of racing a second instantiation.

- Hold on to `{ db, con }` for as long as your feature needs DuckDB. Creating and destroying the connection per call is unnecessary overhead.

## Running Queries with `DuckdbWasmClient`

- Most UI and feature code should use the client abstraction, which adds `execute`, cancellation wiring, and queueing on top of the provider:

```ts
import { DuckdbWasmClient } from "@/lib/duckdb/duckdb-wasm-client";

const duckdbClient = new DuckdbWasmClient();

type DashboardSummary = { dashboard_id: string; total: number };

export async function fetchDashboardSummaries() {
  const result = await duckdbClient.execute({
    sql: `SELECT dashboard_id, count(*) AS total FROM events GROUP BY 1`,
  });
  return result.toArray() as DashboardSummary[];
}
```

- The client serialises work through a tiny in-memory queue so expensive statements cannot run in parallel and starve the browser. You can still prepare statements by reaching for `withConnection` when you need lower-level access:

```ts
export async function fetchDashboardById(id: string) {
  return duckdbClient.withConnection(async (con) => {
    const stmt = await con.prepare(`SELECT * FROM dashboards WHERE id = ?`);
    try {
      return (await stmt.query(id)).toArray();
    } finally {
      await stmt.close();
    }
  });
}
```

- `AsyncDuckDBConnection` still exposes helpers for streaming and Arrow data; the client keeps that power while wrapping common ergonomics.

## Aborting Work

- Provide an `AbortSignal` to `execute()` and the client will call `con.interrupt()` for you:

```ts
const controller = new AbortController();

const promise = duckdbClient.execute({
  sql: `SELECT * FROM log_events ORDER BY ts DESC LIMIT 1000`,
  signal: controller.signal,
});

// Wire to UI
cancelButton.addEventListener("click", () => controller.abort());

const rows = (await promise).toArray();
```

- Calling `interrupt()` affects only the currently running statement. The same connection can continue processing later work.

## Cleaning Up

- When you no longer need DuckDB (e.g. logging out or unloading the app), wait for the queue to drain and tear down the provider through the client:

```ts
await duckdbClient.destroy();
```

- Internally this closes the connection, terminates the WASM worker, resets the initialisation state, and releases multi-tab ownership via the `Coordinator`. Other tabs waiting on ownership can then call `getCurrentWasm()` to take over.

- To fully wipe the on-disk database, run `clearOPFS()`, which invokes `destroy()` before removing the OPFS files.

## Checking Availability

- Use the client (or provider) helper to know whether a connection is currently ready:

```ts
if (duckdbClient.isConnected()) {
  // Safe to run lightweight metadata checks or show "connected" UI
}
```

- If `isConnected()` returns `false`, call `execute()` or `withConnection()` to trigger initialisation before issuing queries. After a successful `destroy()`, `isConnected()` will remain false until the next initialisation completes.

- In Suspense/data-loader friendly code paths, cache the `getCurrentWasm()` promise from the provider if you need even finer control; the client simply forwards through.

## Interactive Shell / REPL

- Use the **Open DuckDB Shell** button to open a modal backed by `DuckdbShellDialog`, which now embeds a lightweight in-app REPL (`DuckdbRepl`).
- Navigate to `/shell` for a focused page that reuses the same `DuckdbRepl` component. It operates against the shared OPFS-backed database via `DuckdbWasmProvider`.
- The REPL supports:
  - Enter to run (Shift+Enter for newline)
  - Up/Down to navigate recent history (first/last line)
  - Esc to cancel the current query
- Results render using the existing `SqlResultsTable` component and match the app theme defined in `app/globals.css`.
