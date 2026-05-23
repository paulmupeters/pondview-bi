# Connected Data Sources

Connected sources are metadata entries stored in browser local storage and consumed by the SQL/chat UI. Source attachment and schema introspection run through Bridge when the source needs a server-side runtime or secret boundary.

## Supported source types in the dialog

Current Connect Data dialog options:

- Postgres
- MotherDuck
- MySQL
- SQLite
- Remote DuckDB (HTTPFS file or Quack endpoint)

The runtime can also represent additional source types in metadata, but the primary UI picker currently exposes the four options above.

## Runtime requirement

Source connection flow is disabled when active runtime is `duckdb-wasm`.

To connect sources:

1. Switch runtime in **Settings -> Query Runtime** to `Bridge`.
2. Open **Connect Data Source**.
3. Configure source fields and connect.

## How a connection is resolved

For Postgres/MySQL/SQLite/Quack, the dialog:

1. Builds a source identifier (e.g. `postgres://...`, `mysql://...`, `sqlite:/path`).
2. Creates an attachment plan with `buildAttachmentPlan(...)`.
3. Executes `INSTALL`/`LOAD`/`ATTACH` statements against the active remote runtime.
4. Reads schemas/tables from `information_schema`.
5. Runs a best-effort `DETACH DATABASE IF EXISTS ...`.

MotherDuck uses `dbIdentifier`-based querying (`md:...`) through `runQuery(...)` and reads metadata from `information_schema`.

Quack Remote DuckDB attaches a remote DuckDB server over the Quack protocol:

```sql
INSTALL quack FROM core_nightly;
LOAD quack;
ATTACH 'quack:host:9494' AS remote (TYPE quack, TOKEN '...');
```

Quack is a DuckDB beta feature that currently requires DuckDB v1.5.2 or newer in the active remote runtime. Use Bridge for Quack connections when possible so the Quack token is stored in the Bridge secret store instead of browser-visible state.

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
- Quack support depends on DuckDB's beta `quack` extension from `core_nightly`; protocol details may change before DuckDB v2.0.
- Schema table preview is intentionally limited (`LIMIT 20` in dialog metadata queries).
- Removing a source only does best-effort remote detach; persisted connection metadata is always removed locally.
