# Materialization Architecture (Context + Joins)

This project no longer uses semantic explore YAML models, query compilation, or model-edit APIs.

The runtime model is now:

- `semantic-layer/context/context.md` for AI/business context
- `semantic-layer/models/sources.yml` for physical source mappings and attachment metadata
- `semantic-layer/joins.yml` for global join definitions
- per-table materialization into DuckDB schema `mat`

## Core Files

- Materializer: `src/lib/materialization/table-materializer.ts`
- Materialized query runner: `src/lib/materialization/query.ts`
- Join loader/path resolver: `src/lib/joins/loader.ts`
- Filter SQL engine: `src/lib/filters/apply-filters.ts`
- SQL table parser: `src/lib/filters/parse-tables.ts`

## Materialization Schema and Tracking

Materialized tables are written to schema `mat`:

```sql
CREATE OR REPLACE TABLE "mat"."orders" AS
SELECT * FROM <source reference>;
```

Runs are tracked in:

```sql
CREATE TABLE IF NOT EXISTS main.table_materialization_runs (
  table_name   TEXT PRIMARY KEY,
  source_name  TEXT NOT NULL,
  source_hash  TEXT NOT NULL,
  target_table TEXT NOT NULL,
  row_count    BIGINT,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

The hash is computed from source config (`sources.yml`) metadata. If unchanged, rebuild is skipped.

## Source Attachments

`sources.yml` can define optional connection metadata per source:

```yaml
version: 1
sources:
  - name: orders
    table: main.orders
    connection:
      type: motherduck
      identifier: md:my_db
      alias: orders_source
      readOnly: true
      duckdbExtension: motherduck
```

Attachment statements are generated via `src/lib/duckdb/duckdb-attachments.ts` (`INSTALL`/`LOAD` + `ATTACH`, plus cleanup `DETACH`).

## Dashboard Filter Execution

For dashboard data requests:

1. tables referenced by chart SQL are detected,
2. those tables (plus join-neighbor tables) are materialized into `mat.*`,
3. dashboard filters are applied by rewriting chart SQL through `applyFiltersToSql(...)`,
4. filtered SQL is executed against the materialization DuckDB runtime.

Same-table filters and cross-table filters are supported. Cross-table filters use `joins.yml` path resolution.

## Runtime Notes

- Materialization uses in-process DuckDB Node API.
- `DUCKDB_PERSIST_PATH` can persist the materialized runtime DB to disk.
- If unset, materialization state is in-memory.
