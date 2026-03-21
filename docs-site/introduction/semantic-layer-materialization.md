# Dashboard Materialization

The current dashboard path is browser-first. It does not depend on checked-in semantic-layer YAML.

## Runtime Model

- Dashboard join definitions are edited in Settings and stored in browser `localStorage` under `bi.dashboard.joinDefs.v1`.
- Chart SQL is inspected in the browser to find table references.
- When filters are active, the dashboard runtime creates per-table aliases in DuckDB schema `mat`.
- The filter engine rewrites chart SQL with a filtered base CTE and join-path expansion.

## Core Files

- Browser filter engine: `src/lib/dashboard/browser-filter-engine.ts`
- Filter SQL rewriter: `src/lib/filters/apply-filters.ts`
- SQL table parser: `src/lib/filters/parse-tables.ts`
- Join storage: `src/lib/joins/browser-storage.ts`
- Dashboard page execution: `src/app/dashboards/view/page.tsx`

## Materialization Strategies

Per table reference, the browser runtime chooses one of three strategies:

1. `view`
   For simple reusable references such as `main.orders`, create `CREATE OR REPLACE VIEW "mat"."orders" AS SELECT * FROM ...`.
2. `direct`
   For references that should be used as-is, skip alias creation and point filter rewriting at the original source reference.
3. `table-materialize`
   For harder-to-reuse references, create `CREATE OR REPLACE TABLE "mat"."orders" AS SELECT * FROM ...`.

These aliases are cached per dashboard, backend, and runtime fingerprint.

## Filter Execution

When dashboard or chart filters are present:

1. The dashboard runtime ensures the relevant `mat.*` aliases exist.
2. `applyFiltersToSql(...)` rewrites the chart SQL.
3. Same-table filters apply to the base alias.
4. Cross-table filters walk the join graph stored in browser settings and inject `LEFT JOIN` steps as needed.
5. If filtered execution fails, the dashboard falls back to the chart's stored SQL.

## Dimension Loading

- Available slicer dimensions come from `loadDashboardDimensions(...)` in the browser filter engine.
- Slicer value lookups come from `loadDashboardDimensionValues(...)`.
- Both paths reuse the same runtime alias/materialization logic as chart execution.

## AI Context

Datasource-specific business context is no longer stored in `semantic-layer/`. It now lives in `docs/datasource-context/` and is read by the datasource context tool/API.
