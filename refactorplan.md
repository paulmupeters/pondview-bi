# Simplify Dashboard Source Resolution, Caching, and Snapshots

## Summary

Replace the current mixed model with a clean v2 dashboard architecture built around one rule: saved charts and measures always keep their original source SQL and an explicit source descriptor, while execution-time planners decide whether a query runs live, against an external-source cache, or against an explicit frozen snapshot.

This refactor removes implicit save-time SQL rewriting, removes `pondview_source` from normal dashboard save flows, separates operational external caching from user-invoked snapshots, and keeps dashboards on a single runtime backend family while still allowing multiple sources inside that backend.

## Key Changes

### 1. Canonical source model

- Introduce a shared `DashboardSourceDescriptor` type used by SQL preview results, chat and manual save flows, dashboard persistence, and dashboard execution.
- `DashboardSourceDescriptor` is decision-complete and stored as JSON:
  - `kind: "runtime" | "motherduck" | "external"`
  - `runtimeBackend: "duckdb-wasm" | "bridge" | "duckdb-http"`
  - `dbIdentifier: string | null`
  - `catalogContext: string | null`
  - `externalType?: "postgres" | "mysql" | "sqlite"`
- Replace loose `dbIdentifier` and `catalogContext` inference in UI save flows with this descriptor. `selectedDbIdentifier` is never used as fallback metadata once a query result already contains a descriptor.
- Charts and measures store:
  - `source_sql`
  - `source_descriptor_json`
  - `chart_config_json` or measure fields
  - optional `snapshot_id`
- Remove the current dual-storage model where both rewritten execution SQL and `source_*` fields are persisted.

### 2. New persistence boundary

- Use a clean metadata schema, `pondview`, for the new dashboard layout.
- Store dashboards in `pondview` with a required `runtime_backend` column. A dashboard may contain multiple sources, but they must all execute through the same backend family.
- Store charts and measures in `pondview` using canonical source fields only. Do not persist rewritten SQL, `pondview_source` aliases, or save-time snapshot SQL.
- We are starting clean, so existing dashboards are not migrated and users recreate dashboards manually in the new schema.

### 3. Split execution into three explicit layers

- Add a new planner module, for example `src/lib/dashboard/execution-plan.ts`, responsible for converting saved charts and measures into runnable references.
- Execution modes:
  - `live`: runtime DuckDB and MotherDuck tables are queried directly from source SQL.
  - `external-cache`: Postgres, MySQL, and SQLite tables are copied into dashboard-managed cache tables before they participate in joins and filters.
  - `snapshot`: a user-invoked frozen dashboard snapshot pins execution to immutable snapshot tables.
- Save-time code in `dashboard-storage-service.ts` becomes persistence-only. It no longer decides attachment or materialization policy.
- `run-query.ts` stays a low-level runner. Dashboard-specific planning moves above it.

### 4. Make external caching operational, not semantic

- Introduce persistent dashboard-managed cache metadata for external sources:
  - `dashboard_source_caches`
  - `dashboard_cache_tables`
- External caches are keyed by dashboard id + source descriptor hash + canonical table name.
- External caches are refreshed by planner or runtime actions, not by rewriting saved chart SQL.
- Runtime-native DuckDB catalogs and MotherDuck never go through external cache unless the user explicitly freezes the dashboard.
- Remove `pondview_source` as a persisted concept. It may still exist as an internal temporary attach alias during cache refresh, but never appears in saved chart SQL or saved metadata.

### 5. Rename and narrow the current `mat` behavior

- Treat the current `mat` layer as ephemeral execution aliasing only.
- Rename the concept in code from “materialization” to “execution aliasing”.
- Move ephemeral alias tables and views into a clearer schema name such as `pondview_exec`.
- The filter engine consumes a resolved table-reference map from the execution planner and only creates temporary alias views and tables needed for filter rewriting.
- Saved SQL remains original source SQL even when the execution layer runs through `pondview_exec`.

### 6. Make snapshots explicit and dashboard-level

- Remove automatic snapshotting during “add chart to dashboard”.
- Add explicit dashboard actions:
  - `Refresh external sources`
  - `Freeze dashboard snapshot`
  - `Return to live`
- `Freeze dashboard snapshot` creates immutable snapshot tables for the dashboard’s resolved live execution graph and records a `snapshot_id`.
- Snapshot execution uses the same planner path, but with snapshot bindings instead of live/cache bindings.
- Unfreezing clears the active `snapshot_id` and returns the dashboard to live execution.

## Public API and Interface Changes

- Replace `SqlAnalysisData` and preview result save metadata with a required `sourceDescriptor?: DashboardSourceDescriptor | null`.
- Dashboard repository and storage service APIs accept `sourceSql` and `sourceDescriptor`, not raw `dbIdentifier` and `catalogContext` pairs.
- Dashboard execution APIs accept a planned execution context:
  - backend
  - source bindings by canonical table
  - optional snapshot binding
- Dashboard creation and edit flows must reject adding a chart whose `sourceDescriptor.runtimeBackend` does not match the dashboard’s `runtime_backend`.

## Test Plan

- Source propagation:
  - SQL preview, manual, and chat save flows persist the exact `DashboardSourceDescriptor` from execution results.
  - No dashboard save path falls back to selected DB metadata when a descriptor already exists.
- Persistence:
- `pondview` reads and writes charts and measures using only canonical source fields.
- Execution planning:
  - Runtime DuckDB catalogs execute live with their stored catalog context.
  - MotherDuck charts execute live and never generate dashboard save-time snapshots.
  - External Postgres, MySQL, and SQLite charts resolve to dashboard cache tables before joins and filters.
  - Mixed sources within the same backend family plan successfully.
  - Backend-family mismatches are rejected at add-to-dashboard time.
- Filter and alias execution:
  - Filtered execution uses `pondview_exec` aliases and never mutates stored SQL.
  - Alias planning works across live runtime refs, MotherDuck refs, external-cache refs, and snapshot refs.
- Snapshot behavior:
  - Adding charts does not create snapshots.
  - Freezing a dashboard creates immutable snapshot bindings and switches execution to them.
  - Returning to live removes snapshot bindings without changing stored source SQL.
- Manual recreation path:
  - A fresh v2 dashboard works end-to-end.
  - Legacy v1 dashboards are not surfaced through v2 reads.

## Assumptions and Defaults

- This document is the intended content for `refactorplan.md`.
- Single runtime backend per dashboard is acceptable; multiple sources within that backend are required.
- External sources must support cross-source joins and filters by being cached into dashboard-managed tables first.
- Snapshotting remains a supported feature, but only as an explicit dashboard action.
- Existing dashboards and cards in the old model will not be migrated; the old `pondview` schema remains untouched for safety, and users recreate dashboards manually in v2.


How to enable logs

  1. In browser devtools console run:
     localStorage.setItem("pondview:debug:notebook-controller", "1")
  2. Reload and reproduce (add cell / toggle manual).
  3. Logs will appear as:
     [notebook-debug:<n>] <event>
  4. To disable:
     localStorage.removeItem("pondview:debug:notebook-controller")

  You can also use URL param ?debugNotebook=1.

  What to send me

  - The first repeated event sequence right before the crash.
  - Especially if you see tight repeats of:
      - prompt-input:event:manual-console-api-change
      - notebook-cell:event:console-api-change
      - controller:reconcile:*
      - chat:event:cell-focus
