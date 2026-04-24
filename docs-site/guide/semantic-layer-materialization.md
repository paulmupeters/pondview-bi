# Dashboard Execution Model

The current dashboard path is browser-first. It does not depend on checked-in semantic-layer YAML.

## Runtime Model

- Dashboard join definitions are edited in Settings and stored in browser `localStorage` under `bi.dashboard.joinDefs.v1`.
- Saved charts and measures keep their original SQL plus a `DashboardSourceDescriptor`.
- The dashboard metadata schema is `pondview`.
- Execution-time planning decides whether each source runs as:
  - `live` for runtime-native DuckDB and MotherDuck sources
  - `external-cache` for Postgres, MySQL, and SQLite sources
  - `snapshot` for explicit frozen dashboard snapshots
- When the browser needs aliases for filtering or cross-source execution, it creates them in DuckDB schema `pondview_exec`.
- Stored SQL remains canonical. The runtime rewrites queries against resolved execution bindings only at execution time.

## Canonical Source Model

Each saved chart or measure carries a `DashboardSourceDescriptor` with:

- `kind`: `runtime`, `motherduck`, or `external`
- `runtimeBackend`: `duckdb-wasm`, `bridge`, or `duckdb-http`
- `dbIdentifier`
- `catalogContext`
- optional `externalType` for external connectors

This descriptor is the source of truth for dashboard persistence and execution. UI save flows should pass the descriptor through directly rather than reconstructing source metadata from selected UI state.

## Core Files

- Source descriptor model: `src/lib/dashboard/source-descriptor.ts`
- Execution planner helpers: `src/lib/dashboard/execution-plan.ts`
- Browser filter and scoped execution: `src/lib/dashboard/browser-filter-engine.ts`
- Filter SQL rewriter: `src/lib/filters/apply-filters.ts`
- SQL table parser: `src/lib/filters/parse-tables.ts`
- Dashboard metadata persistence: `src/lib/dashboard/dashboard-storage-service.ts`
- Join storage: `src/lib/joins/browser-storage.ts`
- Dashboard page execution: `src/app/dashboards/view/page.tsx`

## Execution Planning

Per table reference, the planner chooses an execution mode and alias strategy.

Execution modes:

1. `live`
   Runtime-native references execute directly from the source SQL and stored descriptor.
2. `external-cache`
   External Postgres, MySQL, and SQLite references are copied into dashboard-managed execution tables before filters and joins run.
3. `snapshot`
   Frozen dashboard snapshots pin execution to immutable snapshot bindings.

Alias strategies:

1. `view`
   For simple reusable references, create `CREATE OR REPLACE VIEW "pondview_exec"."table" AS SELECT * FROM ...`.
2. `direct`
   For references that should be used as-is, skip alias creation and point rewriting at the original source reference.
3. `table-materialize`
   For external-cache or harder-to-reuse references, create `CREATE OR REPLACE TABLE "pondview_exec"."table" AS SELECT * FROM ...`.

These execution aliases are cached per dashboard, backend, and runtime fingerprint.

## Filter Execution

When dashboard or chart filters are present:

1. The dashboard runtime plans source bindings for the relevant charts.
2. It ensures the necessary `pondview_exec.*` aliases exist.
3. `applyFiltersToSql(...)` rewrites chart SQL against those resolved references.
4. Same-table filters apply to the base execution alias.
5. Cross-table filters walk the join graph stored in browser settings and inject join-path expansion as needed.
6. If filtered execution fails, the dashboard falls back to the chart's stored SQL.

Even when there are no slicers, dashboards may still execute through planned aliases when external-cache bindings are required.

## Dimension Loading

- Available slicer dimensions come from `loadDashboardDimensions(...)` in the browser filter engine.
- Slicer value lookups come from `loadDashboardDimensionValues(...)`.
- Ad hoc dashboard-scoped queries for measures come from `executeDashboardScopedQuery(...)`.
- All of these paths reuse the same execution-planning and alias-resolution logic as chart execution.

## Persistence Boundary

The dashboard metadata schema stores canonical dashboard records only:

- dashboards with a required `runtime_backend`
- charts with `source_sql`, `source_descriptor_json`, and optional `snapshot_id`
- measures with `source_sql`, `source_descriptor_json`, and optional `snapshot_id`
- join definitions
- cache and snapshot metadata

The persistence layer does not store rewritten execution SQL, runtime alias names, or implicit save-time snapshots.

## AI Context

Datasource-specific business context is no longer stored in `semantic-layer/`. It now lives in `docs/datasource-context/` and is read by the datasource context tool/API.
