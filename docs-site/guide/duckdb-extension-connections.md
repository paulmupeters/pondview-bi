# DuckDB Extension Connections

This project routes external SQL sources through DuckDB extensions when needed, but dashboards now treat those connections differently from interactive SQL.

## Two Main Uses

DuckDB extension-backed sources show up in two distinct paths:

1. **Interactive SQL**
   - `runQuery(...)` can attach an external source and execute directly against it.
   - This is the normal path for manual queries, chat-generated SQL, and ad hoc inspection.

2. **Dashboard execution**
   - Saved dashboard charts and measures preserve canonical SQL plus a `DashboardSourceDescriptor`.
   - At execution time, external Postgres, MySQL, and SQLite sources are typically refreshed into dashboard-managed execution tables before joins and filters run.
   - The execution aliases used by the dashboard runtime live in `pondview_exec`.

## How External Detection Works

`@/lib/duckdb/path.ts` exports `detectExternalConnection(...)`, which recognizes supported external identifiers and returns a `SourceConnectionConfig`.

Examples include:

- Postgres: `postgres://...`, `postgresql://...`, `pg:alias`
- MySQL: `mysql://...`, `mysql:alias`
- SQLite: `sqlite:/path/to/file.db`
- Quack Remote DuckDB: `quack:host[:port]`
- HTTPFS DuckDB files: `s3://...`, `r2://...`, `gcs://...`, `gs://...`

The returned config includes:

- source `type`
- normalized `identifier`
- `duckdbExtension`
- `readOnly`

## Attachment Planning

`buildAttachmentPlan()` in `@/lib/duckdb/duckdb-attachments.ts` turns a `SourceConnectionConfig` into the DuckDB statements needed to:

- install/load the extension if necessary
- attach the source with a runtime alias
- detach it afterward

These aliases are temporary runtime details. They are not persisted in dashboard SQL or dashboard metadata.

## Interactive Query Flow

For interactive SQL, `runQuery(...)` can:

1. detect the external connection
2. install/load the extension
3. attach the source
4. run the SQL through the selected backend
5. detach the source

This keeps the low-level query path flexible without baking the attached alias into saved artifacts.

## Dashboard Flow

For dashboards, the important behavior is different:

- saved charts and measures keep their original source SQL
- the saved source descriptor identifies the real source
- external sources are copied into dashboard-managed execution tables only when the runtime planner needs them
- filters and joins run against planned execution bindings, not against rewritten saved SQL

That means external caching is an execution concern, not a persistence concern.

## Adding New Connectors

Built-in UI connectors are added in code. Project-local custom sources can be
added with `pondview source add` when the source is already DuckDB
attach-compatible.

To support another external backend in the UI:

1. Extend `detectExternalConnection(...)` in `@/lib/duckdb/path.ts`.
2. Return a `SourceConnectionConfig` with the correct source type and DuckDB extension.
3. Register any needed attachment behavior in `@/lib/duckdb/duckdb-attachments.ts`.
4. Verify both paths:
   - direct interactive SQL attachment
   - dashboard execution-time caching or binding
5. Update the docs for supported identifiers and any required env vars.

Quack is the first connector that needs an extension repository and attach options. It installs `quack` from `core_nightly`, attaches with `TYPE quack`, and can provide a token and `DISABLE_SSL` option through the typed attachment plan.

## Notes

- Avoid persisting temporary attach aliases in saved metadata.
- Prefer alias-based environment lookups such as `pg:analytics` or `mysql:warehouse` when you do not want raw credentials in browser-facing state.
- If a connector needs write access, review the `readOnly` defaults before enabling it.
