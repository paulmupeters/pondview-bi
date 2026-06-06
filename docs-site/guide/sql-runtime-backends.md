# SQL Runtime Backends

Pondview runs SQL on two backends:

- `duckdb-wasm` for browser-local DuckDB execution
- `bridge` for Pondview Bridge execution

Choose the runtime in **Settings -> Query Runtime**.

## Backend overview

| Backend       | Where execution happens | Typical use                                                            |
| ------------- | ----------------------- | ---------------------------------------------------------------------- |
| `duckdb-wasm` | Browser                 | Local uploads and browser-local exploration. |
| `bridge`      | Pondview Bridge         | Remote/external data, extension attachment flows, bridge-managed auth. |

Remote and extension-backed sources are attached data sources, not separate
query runtimes. The Connect Data dialog exposes these remote attachment
options:

- HTTPFS file attachment for HTTP(S) and object-store files (`s3://`, `r2://`, `gcs://`, `gs://`, `http://`, `https://`)
- Quack endpoint attachment for DuckDB servers exposed through Quack

HTTPFS can run in DuckDB WASM when the browser can fetch the target URL. Bridge
is still recommended for server-side credentials or sources that do not allow
browser CORS access.

## Selection rules

Pondview combines your saved preference with runtime availability:

1. Settings lets you save `duckdb-wasm` or `bridge`.
2. If preference is `bridge` but Bridge is not query-ready, query execution falls
   back to `duckdb-wasm` until Bridge becomes available.
3. If preference is `auto`, Pondview picks `bridge` when query-ready, otherwise
   `duckdb-wasm`.

The Settings page distinguishes the selected runtime preference from the active
runtime. For example, you may see `Bridge` in the selector while the active
runtime shows DuckDB WASM; after bridge health/config/auth become ready, the
same saved preference resolves to Bridge automatically.

## Bridge

Use Bridge when you need Pondview to run SQL outside the browser. Bridge is the
right choice for local database files, attached external sources, server-side
credentials, and DuckDB extensions that are not practical in browser-only mode.

Bridge is query-ready when Pondview can reach it, read its DuckDB configuration,
and satisfy any required authentication.

- Endpoint: defaults to the current app origin. When running only the frontend
  app against a separately started bridge, set the Bridge endpoint in Settings
  to the bridge URL, for example `http://127.0.0.1:17817`.
- Secret: if Bridge requires authentication, enter the session secret in
  Settings.
- Server-side secrets: Bridge stores data-source, AI provider, and S3 backup
  credentials in `${XDG_CONFIG_HOME:-~/.config}/pondview/secrets.json`, or
  `PONDVIEW_SECRETS_PATH` when set.

## DuckDB WASM

Use DuckDB WASM for browser-local analysis. It is always available as the local
fallback and works well for uploaded CSV and Parquet files.

DuckDB WASM runs in the browser, so it does not provide a server-side secret
boundary. Use Bridge for credential-backed external sources or database files
that should stay outside browser storage.

## Choosing a runtime

| Need | Recommended runtime |
| ---- | ------------------- |
| Query uploaded CSV or Parquet files | DuckDB WASM |
| Explore data without starting Bridge | DuckDB WASM |
| Use local `.duckdb` files through the CLI/runtime | Bridge |
| Attach Postgres, MySQL, SQLite, Snowflake, Quack, or other external sources | Bridge |
| Keep credentials out of browser storage | Bridge |
| Use browser-accessible HTTP(S) or object-store files without private credentials | DuckDB WASM or Bridge |

## Troubleshooting checklist

- Query unexpectedly ran in WASM: check selected backend availability and
  fallback conditions. A saved Bridge preference can still execute on WASM while
  Bridge is not query-ready.
- Bridge selected but unavailable in a frontend-only dev server: set the Bridge
  endpoint in Settings to the separately running bridge origin.
- Bridge selected but offline: verify the endpoint, session secret, and Bridge
  process.
- Remote identifier error in WASM: switch runtime to Bridge.
