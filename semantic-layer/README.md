# Semantic Layer Materialization

This project now materializes semantic models into a DuckDB instance that is reachable through the HTTP `httpserver` extension. The flow is designed so that every time a semantic model is edited, the corresponding explore is re-materialized and dashboards automatically read from the freshly built tables.

## Prerequisites

Set the DuckDB HTTP connection parameters via environment variables (or pass an equivalent config to the helper functions):

- `DUCKDB_HTTP_HOST` – host or base URL of the DuckDB HTTP server
- `DUCKDB_HTTP_PORT` – port exposed by the HTTP server
- `DUCKDB_HTTP_AUTH` *(optional)* – basic auth credentials (`user:pass`) or API token

These values are consumed by `resolveHttpDuckDbConfig` inside `src/lib/duckdb/duckdb-http.ts`.

## `sources.yml` structure

Source entries now capture enough metadata to reproduce the external attachments inside DuckDB. A representative entry looks like:

```yaml
version: 1
sources:
  - name: unicorns
    table: main.unicorns
    connection:
      type: motherduck        # duckdb | motherduck | postgres | mysql
      identifier: md:my_db    # DSN or database path passed to ATTACH
      alias: unicorns_source  # Optional override for ATTACH AS <alias>
      readOnly: true          # Optional ATTACH READ_ONLY flag
      duckdbExtension: motherduck # Optional override for the INSTALL/LOAD step
```

- `type` determines which DuckDB attach type is used (e.g., `TYPE postgres`).
- `duckdbExtension` overrides the extension that is installed/loaded before the `ATTACH`. When omitted, it falls back to the defaults defined in `DEFAULT_EXTENSION_BY_SOURCE` inside `src/lib/duckdb/duckdb-attachments.ts`.
- `identifier` is the argument passed into `ATTACH '<identifier>' ...`.
- `alias` (defaults to a sanitized identifier) becomes the database alias inside DuckDB.
- `readOnly` controls whether `READ_ONLY` is appended to the attachment clause.

The helper `connectedTableToSources` in `semantic-layer/source-updater.ts` converts connected-table selections into this format, and all API calls that mutate `sources.yml` now propagate the additional fields automatically.

## Materialization workflow

1. Model edits (dimensions, measures, joins, segments) trigger `materializeSemanticLayer` after the YAML file is updated. The data model editor surfaces the latest refresh status inline so authors can see whether a change triggered a rebuild.
2. The materializer (see `src/lib/materialization/semantic-layer.ts`):
   - hashes the explore YAML together with its source entry to detect changes,
   - ensures a tracking table (`main.semantic_materialization_runs`) exists,
   - installs/loads the required DuckDB extensions and issues `ATTACH` statements based on the source metadata,
   - recreates `semantic_materialized.<explore>` with `CREATE OR REPLACE TABLE … AS SELECT * FROM <source>`,
   - records the latest hash, target table name, and row count in the tracking table.
3. Dashboard APIs (`/api/dashboard/...`) fetch the tracking table via `listMaterializations()` and rewrite the explore `base` tables so semantic queries resolve against the materialized copies.

The tracking table can be queried directly or through the exported `listMaterializations` helper to inspect refresh times and output tables.

## Available helpers

- `materializeSemanticLayer(options)` – runs materialization for all explores or a single explore.
- `listMaterializations(options)` – returns current rows from `semantic_materialization_runs`.
- `applyMaterializationsToDataModel(dataModel, records)` – rewrites a loaded `DataModel` so the query planner operates on the materialized tables.

Options accept an optional DuckDB HTTP config if you need to override the global environment variables.

## Query Execution Architecture

All SQL queries (including connections to other databases like PostgreSQL) are now executed through DuckDB. When a PostgreSQL URI is detected (e.g., `postgres://...` or `pg:ALIAS`), DuckDB automatically:

1. Installs and loads the `postgres` extension
2. Attaches the PostgreSQL database using `ATTACH ... TYPE postgres`
3. Rewrites the SQL query to reference tables through the attached database alias
4. Executes the query
5. Detaches the database

This unified approach means all queries benefit from DuckDB's query engine and extensions. The postgres adapter (`src/lib/postgres/`) is no longer used for query execution, though the files remain for reference.

## Adding new connectors

To support an additional backend:

1. Extend `DEFAULT_EXTENSION_BY_SOURCE` and (if needed) `ATTACH_TYPE_BY_SOURCE` in `src/lib/duckdb/duckdb-attachments.ts` with the required extension name and attach type.
2. Ensure `connectedTables` captures the DSN/identifier and sets `type` (and optionally `duckdbExtension`) accordingly.
3. Provide any credentials/tokens through the `databasePath`/`identifier` fields (for MotherDuck you can continue to append `motherduck_token=...`).
4. Update `detectPostgresConnection` in `src/lib/duckdb/query.ts` and `src/lib/duckdb/metadata.ts` to detect your new connection type, or create a similar detection function.

Once those pieces are in place, the materializer will automatically install the extension, attach the database, and refresh the materialized table on the next model edit.

