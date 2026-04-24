# DuckDB Usage Overview

This note summarizes the current DuckDB execution surfaces and how dashboards fit into them after the dashboard source-descriptor refactor.

## Execution Surfaces at a Glance

| Runner | Where it lives | Primary entry points | Typical identifiers |
| --- | --- | --- | --- |
| Bridge runtime | `src/lib/bridge/pondview-bridge.ts` via `runQuery(...)` | SQL console, chat/manual SQL runs, dashboard execution when backend is `bridge` | runtime-default, `md:analytics`, external connector identifiers |
| DuckDB HTTP runtime | `src/lib/duckdb/duckdb-http-browser.ts` via `runQuery(...)` | SQL console, chat/manual SQL runs, dashboard execution when backend is `duckdb-http` | runtime-default, `md:analytics`, external connector identifiers |
| DuckDB-Wasm | `src/lib/sql/run-query-wasm.ts` via `runQuery(...)` | local browser SQL execution, dashboard execution when backend is `duckdb-wasm` | `wasm:local` |

The old write-up around a single node-centric path is no longer the right mental model for dashboard execution. Dashboard execution now follows the stored `DashboardSourceDescriptor` plus the selected runtime backend.

## Shared Query Entry Point

`runQuery(...)` in `src/lib/sql/run-query.ts` is the common low-level query runner for interactive SQL.

It accepts:

- SQL text
- optional `dbIdentifier`
- optional `catalogContext`
- a runtime backend preference

It then routes to:

- Bridge
- DuckDB HTTP
- DuckDB-Wasm
- MotherDuck attachment flow when the identifier is `md:...`

## Dashboard Source Model

Dashboards no longer infer execution only from loose `dbIdentifier` fields.

Saved charts and measures carry a `DashboardSourceDescriptor` with:

- `kind`: `runtime`, `motherduck`, or `external`
- `runtimeBackend`
- `dbIdentifier`
- `catalogContext`
- optional `externalType`

That descriptor is persisted with canonical SQL and reused during dashboard execution.

## Dashboard Execution

Dashboard execution is browser-first and runs through:

- `src/lib/dashboard/browser-filter-engine.ts`
- `src/lib/dashboard/execution-plan.ts`
- `src/lib/dashboard/source-descriptor.ts`

The execution planner resolves each source into one of three modes:

1. `live`
   Runtime-native DuckDB or MotherDuck sources execute directly.
2. `external-cache`
   Postgres, MySQL, and SQLite sources are copied into runtime-managed execution tables before joins and filters run.
3. `snapshot`
   Explicit frozen dashboard snapshots execute against immutable bindings.

When aliases are needed, the runtime creates them in `pondview_exec`.

## Dashboard Persistence

Dashboard metadata is stored in the DuckDB schema `pondview`, not in IndexedDB object stores.

Saved dashboard entities store canonical source information only:

- `source_sql`
- `source_descriptor_json`
- optional `snapshot_id`

They do not store:

- runtime-rewritten SQL
- `pondview_source` aliases
- save-time materialization SQL

## External Connectors

External connectors still rely on DuckDB extensions and attachment plans, but the role has narrowed:

- interactive SQL can attach the source directly for execution
- dashboard execution can attach temporarily when refreshing execution-time external caches

The important distinction is that external caching is now operational, not semantic. The cache exists to make dashboard joins and filters work in a single runtime, not to replace the saved source SQL.

## Connected Tables Data Flow

At a high level:

1. Connected source metadata is stored in browser state.
2. Interactive SQL surfaces run through `runQuery(...)`.
3. Saved dashboard content preserves canonical SQL plus a source descriptor.
4. Dashboard execution plans runtime bindings from that saved descriptor rather than reconstructing source identity from transient UI state.

## Current Boundaries

The current separation of concerns is:

- `runQuery(...)` is the low-level SQL runner
- dashboard persistence is handled by `dashboard-storage-service.ts`
- dashboard execution planning is handled above the runner
- filter rewriting happens only at execution time

That is the boundary to preserve as new dashboard snapshot and cache-management UI is added.
