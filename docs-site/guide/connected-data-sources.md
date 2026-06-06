# Connected Data Sources

Connected sources are metadata entries stored in browser local storage and consumed by the SQL/chat UI. Source attachment and schema introspection run through Bridge when the source needs a server-side runtime or secret boundary.

## Supported source types in the dialog

Current Connect Data dialog options:

- Postgres
- MotherDuck
- MySQL
- SQLite
- HTTPFS remote files (`s3://`, `r2://`, `gcs://`, `gs://`, `http://`, `https://`)
- Quack remote DuckDB endpoints

The CLI can also write typed custom DuckDB attachment bindings to
`pondview.sources.local.json` for sources that are attach-compatible but not
exposed in the primary UI picker.

## Runtime requirement

Most source connection flows are disabled when active runtime is
`duckdb-wasm`. HTTPFS is available in DuckDB WASM for browser-accessible remote
files, subject to browser CORS and credential exposure constraints.

To connect sources:

1. Switch runtime in **Settings -> Query Runtime** to `Bridge`.
2. Open **Connect Data Source**.
3. Configure source fields and connect.

## How a connection is resolved

For Postgres/MySQL/SQLite/HTTPFS/Quack, the dialog:

1. Builds a source identifier (e.g. `postgres://...`, `mysql://...`, `sqlite:/path`).
2. Creates an attachment plan with `buildAttachmentPlan(...)`.
3. Executes `INSTALL`/`LOAD`/`ATTACH` statements against the active remote runtime.
4. Reads schemas/tables from `information_schema`.
5. Runs a best-effort `DETACH DATABASE IF EXISTS ...`.

MotherDuck uses `dbIdentifier`-based querying (`md:...`) through `runQuery(...)` and reads metadata from `information_schema`.

Quack Remote DuckDB attaches a remote DuckDB server over the Quack protocol:

```sql
INSTALL quack;
LOAD quack;
ATTACH 'quack:host:9494' AS remote (TYPE quack, TOKEN '...');
```

Quack currently requires DuckDB v1.5.2 or newer in the active remote runtime. Use Bridge for Quack connections when possible so the Quack token is stored in the Bridge secret store instead of browser-visible state.

## Custom CLI sources

Custom sources are configured locally with `pondview source add` or by editing
`pondview.sources.local.json`. They are SQL-backed: Pondview runs the configured
setup SQL before using the source. That SQL can create views, tables, secrets, or
attached catalogs.

Google Sheets example:

```bash
pondview source add google-sheet \
  --sql "INSTALL gsheets FROM community; LOAD gsheets; CREATE OR REPLACE VIEW sheet_sales AS SELECT * FROM read_gsheet('https://docs.google.com/spreadsheets/d/.../edit', sheet = 'Sheet1', range = 'A:Z');"
```

Attach-compatible extensions can use the same SQL-backed shape. Snowflake
example:

```bash
pondview source add snowflake \
  --sql "INSTALL snowflake FROM community; LOAD snowflake; ATTACH '' AS sf (TYPE snowflake, SECRET my_snowflake, READ_ONLY);"
```

The active DuckDB runtime must support any extension, secret, table function, or
attachment used by the setup SQL.

## What gets stored locally

Connected-source entries are stored under local storage key:

- `connectedTables`

Each entry can include:

- `type`
- `connectionId` (preferred new identifier for server-stored credentials)
- `databasePath` (legacy/raw identifier)
- `databaseName`
- `schema`
- `tables`
- `description`
- `attachAs`
- `readOnly`
- `duckdbExtension`
- `duckdbExtensionRepository`

Writes dispatch `connectedTablesUpdated` so UI consumers refresh.

## Identifier precedence in the UI

When selecting a source, the app resolves DB identifier in this order:

1. `connectionId`
2. `databasePath`
3. `attachAs`

This allows migration from legacy `databasePath` entries to opaque `connectionId` references.

## Credentials and `connectionId`

`connectionId` maps to credentials stored server-side by the Pondview Bridge. By default Bridge writes those credentials to `${XDG_CONFIG_HOME:-~/.config}/pondview/secrets.json`; set `PONDVIEW_SECRETS_PATH` to override the location for tests or local experiments.

When the active runtime is Bridge, the Connect Data flow saves the raw source identifier in the Bridge secret store and persists only the opaque `connectionId`, schema/table selections, attach alias, and other non-secret metadata in browser storage. Later `ATTACH` statements use the same `connectionId`; Bridge resolves it to the real identifier before DuckDB sees the statement.

DuckDB WASM does not have this server-side boundary. Do not use WASM for credential-backed external sources.

## Known limitations

- Source connection discovery requires a remote runtime; it cannot run in pure WASM mode.
- Quack support depends on the DuckDB `quack` extension being available in the active runtime.
- Schema table preview is intentionally limited in the dialog, but the persisted schema stores the full table list.
- Removing a source only does best-effort remote detach; persisted connection metadata is always removed locally.
