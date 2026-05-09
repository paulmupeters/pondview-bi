# Pondview CLI Brainstorm

## Context

Pondview has a hosted Cloudflare deployment intended to remain a free,
client-side app. That hosted app should stay safe and browser-local by default:
DuckDB WASM, local browser storage, and no server-side secrets.

For users who want local files, existing DuckDB databases, exported project
execution, secrets, or stronger runtime capabilities, Pondview can offer an
optional local CLI/bridge. The bridge becomes the explicit "local power tools"
path while the hosted app remains lightweight and low-risk.

## Product Boundary

- Hosted Cloudflare app: browser-only, fun/free, no raw S3/R2 credentials.
- DuckDB WASM: best path for local CSV/Parquet upload in the browser.
- Local bridge CLI: owns filesystem access, secrets, native DuckDB access, and
  project execution.
- Object storage for hosted mode should use Cloudflare Worker/R2-managed
  credentials or presigned URLs, not browser-entered permanent keys.

## Preferred Bridge Shape

Build a TypeScript CLI/local service before considering a DuckDB extension.

A DuckDB extension is interesting later for narrow DuckDB-specific features,
but it is a harder first step because of native builds, distribution, version
compatibility, debugging, and lifecycle concerns. A local CLI can expose the
same practical surface through localhost HTTP/WebSocket endpoints with much
less friction.

Suggested shape:

```text
Cloudflare-hosted Pondview UI
  -> DuckDB WASM for browser-local use
  -> optional localhost bridge when the user runs pondview

pondview CLI/bridge
  -> exposes local HTTP/WebSocket API
  -> owns secrets and filesystem access
  -> executes DuckDB/native/HTTP queries
  -> stages uploads, snapshots, object storage, remote DB connections
  -> serves exported Pondview projects
```

## Core CLI Commands

```bash
pondview bridge
pondview serve
pondview serve --port 17817
pondview serve --workspace ./pondview-workspace
pondview serve ./my-project.pondview.zip

pondview attach ./stations.duckdb --as stations
pondview attach ~/data/sales.duckdb --as sales --readonly
pondview attach s3://bucket/path/file.duckdb --as remote_sales --readonly
pondview attach https://blobs.duckdb.org/databases/stations.duckdb
pondview list-sources
pondview detach analytics

pondview project inspect ./project.pondview.zip
pondview project run ./project.pondview.zip
pondview project serve ./project.pondview.zip
pondview project restore-runtime ./project.pondview.zip --to ./runtime.duckdb

pondview upload ./customers.csv --schema uploads
pondview upload ./events.parquet --schema uploads
pondview import ./customers.csv --table uploads.customers
```

## Server Mode

Server mode should be the core of the bridge. The CLI, TUI, and browser app can
all talk to the same local runtime surface.

Default behavior should bind to `127.0.0.1` only.

Useful variants:

```bash
pondview serve
pondview serve ./project.pondview.zip
pondview serve --api-only
pondview serve --readonly
pondview serve --host 0.0.0.0 --token-env PONDVIEW_TOKEN
```

Potential endpoints:

```text
GET    /health
GET    /capabilities
GET    /catalog
POST   /query
POST   /sources/attach
GET    /sources
DELETE /sources/:id
POST   /files/import
POST   /projects/open
GET    /projects/current
POST   /projects/:id/run
GET    /logs
```

Browser flow:

```text
Cloudflare Pondview app
  -> probes http://127.0.0.1:17817/health
  -> asks user to trust/connect
  -> fetches /capabilities and /catalog
  -> sends SQL to /query
```

## Existing DuckDB Files

Connecting existing `.duckdb` files should be a first-class bridge feature.
Native/local DuckDB can attach real files without browser file handles, OPFS,
or upload/import steps.

Example:

```bash
pondview attach ./warehouse.duckdb --as warehouse
```

Bridge SQL:

```sql
ATTACH '/absolute/path/warehouse.duckdb' AS warehouse;
```

Then the Pondview UI can query tables like:

```sql
SELECT * FROM warehouse.main.orders;
```

Remote DuckDB files can also be supported as read-only attachments:

```sql
ATTACH 's3://bucket/path/file.duckdb' AS remote_sales (READ_ONLY);
```

## Exported Project Files

Pondview project exports already include a useful archive structure:

```text
.pondview/project.json
.pondview/export-manifest.json
runtime/pondview-runtime.duckdb
project artifact files
```

The CLI should understand this directly.

`project inspect` should show:

- project name
- dashboards
- saved queries
- notebooks
- source refs
- whether a runtime snapshot is included
- which source bindings are missing

`project run` should:

- unpack the archive to a temp or local workspace
- attach included `runtime/pondview-runtime.duckdb` when present
- hydrate source bindings
- validate saved SQL/dashboard queries
- optionally materialize views
- print a small report

`project serve` should open the exported project through the local bridge so the
hosted Pondview UI can use native DuckDB/runtime features.

## Source Bindings

Projects can reference logical source IDs. The bridge should support local
bindings for those sources.

```bash
pondview bind-source analytics --duckdb ./analytics.duckdb --as analytics
pondview bind-source warehouse --postgres "$DATABASE_URL"
pondview project run ./project.pondview.zip --binding pondview.bindings.json
```

Example binding file:

```json
{
  "schemaVersion": 1,
  "bindings": {
    "analytics": {
      "runtimeBackend": "bridge",
      "dbIdentifier": "/Users/me/data/analytics.duckdb",
      "catalogContext": "analytics.main"
    }
  }
}
```

## File Upload And Staging

For WASM, browser upload can import CSV/Parquet into `uploads.<table_name>`.

For HTTP/Bridge, file staging should live in the bridge:

- import local CSV/Parquet files directly from disk
- optionally copy/stage them into a managed workspace
- optionally upload to object storage with bridge-owned credentials
- expose imported tables through the catalog

For CSV:

```sql
CREATE TABLE uploads.customers AS
SELECT * FROM read_csv_auto('/absolute/path/customers.csv');
```

For Parquet:

```sql
CREATE TABLE uploads.events AS
SELECT * FROM read_parquet('/absolute/path/events.parquet');
```

## Object Storage And Backups

The old S3-compatible backup idea is viable for self-hosted or advanced local
use, but should not be activated in the public Cloudflare app as a raw
browser-credential flow.

Safer options:

- Bridge-managed credentials stored in local env/config/keychain.
- Cloudflare Worker/R2-managed credentials for hosted mode.
- Short-lived presigned upload/read URLs.
- Session-only user credentials only for advanced self-hosted mode with clear
  warnings and scoped temporary keys.

Avoid persisted browser credentials.

Backups and upload storage can share low-level object-storage helpers, but the
product concepts should remain distinct:

- backups: full runtime snapshots
- upload storage: staged data files for runtimes

## TUI

A TUI would be useful, but should be secondary to the scriptable CLI/server
interface.

The TUI should act as a local runtime control panel, not a full SQL workbench.
Pondview itself remains the visual workbench.

Useful TUI surfaces:

- bridge status, port, and connected browser origin
- attached DuckDB files and external sources
- attach/detach flows
- exported project inspection
- source binding selection
- recent queries/errors
- start/stop bridge
- open hosted Pondview with bridge connection prefilled
- local config management

Possible implementation:

- `commander` or `clipanion` for CLI commands
- `hono` or Bun server APIs for HTTP
- `ink` for React-style TUI
- local JSON config for non-secret settings
- OS keychain or env/session-only storage for secrets later

## Security Defaults

- Bind server mode to `127.0.0.1` by default.
- Require an auth token printed in the terminal or opened through a trusted
  deep link.
- Restrict CORS to known origins, configurable with `--allow-origin`.
- Never expose arbitrary filesystem reads by browser-provided path.
- Attach files only through explicit CLI/TUI action or user-approved API
  request.
- Keep secrets outside the frontend.
- Show connected browser sessions.
- Make `--host 0.0.0.0` an explicit advanced/self-hosted choice.
- Offer `--readonly` mode for catalog/query-only access.

## Suggested Build Order

1. `pondview serve`: localhost query/catalog API.
2. `pondview attach <file.duckdb> --as <alias>`.
3. `pondview project inspect <project.zip>`.
4. `pondview project serve <project.zip>`.
5. UI support for connecting to a local Pondview bridge.
6. File import/staging for CSV and Parquet.
7. Source bindings.
8. Optional TUI.
9. Optional object storage integration.
