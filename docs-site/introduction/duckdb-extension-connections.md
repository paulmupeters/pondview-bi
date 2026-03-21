# DuckDB Extension Connections

This project now routes all SQL traffic through DuckDB, even when the identifier points to an external data source. DuckDB installs the proper extension (postgres, mysql, Google Sheets, etc.), attaches the database, rewrites the SQL to reference the attached alias, executes the query, and finally detaches. This keeps the runtime in one place while still allowing the rich extension ecosystem.

## How the flow works

1. **Identifier resolution**  
   - `@/lib/duckdb/path.ts` exports `detectPostgresConnection` (generalize this into `detectExternalConnection` if you add more connectors).  
   - When it sees `postgres://`, `postgresql://`, or `pg:alias` it builds a `SourceConnectionConfig` that contains the extension name, the identifier (URI), `readOnly`, and the expected DuckDB attach type.

2. **Attachment plan**  
   - `buildAttachmentPlan()` in `@/lib/duckdb/duckdb-attachments.ts` uses the connection config to install/load the extension (if necessary) and emit an `ATTACH` statement with a sanitized alias.  
   - The alias is reused for rewriting queries and detaching later.

3. **Query execution**  
   - `runSqlNormalized()` (duckdb query runner) now checks for an external connection.  
   - If one exists it:
     - Executes the `INSTALL/LOAD/ATTACH` statements on the DuckDB connection.
     - Runs `rewriteSqlForAttachedDatabase(sql, alias)` to ensure tables reference `alias.schema.table`.
     - Executes the rewritten SQL and normalizes the returned rows.
     - Always detaches the database afterward (`DETACH DATABASE IF EXISTS <alias>`).
   - Non-extension identifiers continue to hit DuckDB as before.

4. **Metadata helpers**  
   - `getSchemas()`, `getTablesForSchema()`, and `getTables()` detect external connections and run analogous `information_schema` queries through the attached alias.  
   - These functions also install/load and detach the extension for metadata queries so the UI can inspect attached tables transparently.

5. **Router routing**  
   - `src/lib/db/router.ts` now delegates everything to the DuckDB adapter. The old Postgres adapter (`src/lib/postgres/`) is unused but kept for reference.

## Adding new connectors

To support an additional backend (MySQL, Google Sheets, etc.), follow these steps:

1. **Detect the identifier**  
   - Extend `detectPostgresConnection()` in `@/lib/duckdb/path.ts` (or rename it to `detectExternalConnection`) to recognize the new URI scheme/classic identifier (e.g. `mysql://`, `my:`, `sheets://`).
   - Return a `SourceConnectionConfig` with:
     - `type` matching a key in `ATTACH_TYPE_BY_SOURCE`.
     - `identifier` pointing to the URI or DSN.
     - `duckdbExtension` set to the DuckDB extension name (`mysql`, `google_sheets`, etc.).
     - Optional `readOnly` if the source should be protected.

2. **Register the extension**  
   - Update `ATTACH_TYPE_BY_SOURCE` and `DEFAULT_EXTENSION_BY_SOURCE` in `@/lib/duckdb/duckdb-attachments.ts` to describe the new backend.
   - The materializer and metadata helpers already rely on those maps to issue `ATTACH` statements.

3. **Descriptions & metadata**  
   - When storing connected tables, ensure the connection entry includes `type`, `identifier`, and `duckdbExtension`.  
   - Browser mode currently persists connected-source metadata in local storage rather than syncing it into YAML.

4. **Query rewriting**  
   - The current `rewriteSqlForAttachedDatabase()` will prepend `alias.schema.table` heuristically. This works for most cases; adjust the regex if your source uses different naming conventions.

5. **Tests & documentation**  
   - Update the relevant docs under `docs-site/guide/` to mention the new extension and any required env vars.  
   - Add integration tests or manual runs using a PostgreSQL/MySQL/Google Sheets source to verify the attach/query/detach lifecycle completes cleanly.

## Example: PostgreSQL

1. User selects or provides `postgres://...` or `pg:analytics`.
2. The router calls `runSqlNormalized()`.
3. DuckDB:
   - Installs & loads the `postgres` extension.
   - Runs `ATTACH '...' AS postgres_alias (TYPE postgres, READ_ONLY);`.
   - Rewrites `SELECT * FROM users` -> `SELECT * FROM postgres_alias.public.users`.
   - Executes the query and returns normalized rows.
   - Detaches the alias after completion.

## Notes

- DuckDB handles caching of extensions, so repeated queries reuse the loaded module.
- To prevent credential leakage, avoid embedding passwords in the identifier; use `pg:` aliases backed by env vars (`PG_DEFAULT_URL`, etc.).
- If you need write access, remove `readOnly: true` from the `SourceConnectionConfig` and drop the `READ_ONLY` flag from the `ATTACH` clause.

With this approach you can eventually support any DuckDB extension by teaching the detection logic about the identifier format and registering the extension once.
