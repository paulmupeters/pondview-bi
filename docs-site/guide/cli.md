# Pondview CLI

The Pondview CLI runs a local DuckDB bridge and, when requested, serves the
Pondview UI from bundled static assets.

Use the CLI when you want local files, native DuckDB database attachments, or a
local app that does not depend on the hosted Pondview deployment.

## Quick start

From this repository during development:

```bash
bun run bridge:build-ui
bun run bridge -- serve
```

`pondview serve` starts one localhost server for both the UI and bridge API. By
default it listens on `127.0.0.1:17817` and opens the local app in your browser.

Use `--no-open` when running from scripts or terminals where opening a browser
would be noisy:

```bash
bun run bridge -- serve --no-open
```

## Commands

### `pondview serve`

Runs the local Pondview app and bridge API together.

```bash
pondview serve
pondview serve --port 17818
pondview serve --host 127.0.0.1 --port 17817 --no-open
pondview serve --database ./analytics.duckdb
pondview serve --readonly
```

This is the default user-facing local mode. API routes win over static UI
routes, bundled files are served from the CLI package, and unknown `GET` routes
fall back to `index.html` for React Router.

### `pondview bridge`

Runs the bridge API only.

```bash
pondview bridge
pondview bridge --port 17817
pondview bridge --database ./analytics.duckdb
pondview bridge --readonly
```

Use this when the hosted Pondview app should connect to a local bridge, or when
CLI client commands need a background API runtime without opening the UI.

By default, `serve` and `bridge` use an in-memory DuckDB database as the primary
catalog. Pass `--database <file.duckdb>` to open a DuckDB file as the primary
database instead, so unqualified queries such as `SELECT * FROM my_table` run
against that file. This is different from `pondview attach`, which keeps the
primary database in memory and exposes the file as an attached catalog that you
query with its alias, for example `analytics.main.my_table`.

### Client commands

These commands talk to the bridge API:

```bash
pondview attach ./analytics.duckdb --as analytics
pondview list-sources
pondview query "SELECT 42 AS answer"
pondview query --file ./dashboard-metadata.sql --database ./analytics.duckdb
pondview dashboard validate --database ./analytics.duckdb
pondview detach analytics
pondview doctor
pondview stop
```

If no bridge is running, client commands automatically start `pondview bridge`,
wait for it to become healthy, then retry the original request.

Use `--no-autostart` to fail instead of starting a local bridge:

```bash
pondview query "SELECT 42 AS answer" --no-autostart
```

Passing `--url` disables autostart because the CLI should not guess how to start
a custom or remote endpoint:

```bash
pondview query "SELECT 42 AS answer" --url http://127.0.0.1:17818
```

Use `query --file` for longer SQL scripts, including dashboard metadata authoring
scripts:

```bash
pondview query --file ./dashboard-metadata.sql --database ./analytics.duckdb
```

### Dashboard maintenance

Dashboard commands inspect and maintain dashboard metadata stored in the
`pondview` schema of the active bridge database.

```bash
pondview dashboard list --database ./analytics.duckdb
pondview dashboard show dashboard_123 --database ./analytics.duckdb
pondview dashboard validate --database ./analytics.duckdb
pondview dashboard validate dashboard_123 --database ./analytics.duckdb
pondview dashboard rename dashboard_123 --title "Executive Revenue" --database ./analytics.duckdb
pondview dashboard delete dashboard_123 --yes --database ./analytics.duckdb
pondview dashboard open dashboard_123 --database ./analytics.duckdb
```

`dashboard validate` checks that dashboard metadata is structurally readable,
that chart configs and source descriptors parse as JSON, that child runtime
metadata is consistent, and that stored chart and measure SQL can run as a small
preview query.

`dashboard open` starts the bundled local app in dashboard mode and opens either
the dashboard list or a specific dashboard view.

`pondview doctor` checks the configured bridge URL and prints a machine-readable
JSON diagnostic report. It does not autostart a bridge, so it is safe to use in
scripts and diagnostics:

```bash
pondview doctor
pondview doctor --url http://127.0.0.1:17818
```

### `pondview stop`

Stops a locally running bridge by finding the process listening on the configured
port and sending it `SIGTERM`.

```bash
pondview stop
pondview stop --port 17818
```

Use this after a client command auto-starts the bridge in the background, or
when you need to stop a bridge that was started outside the current terminal.
By default, it checks port `17817`. If no process is listening on the port, the
command prints a message and exits successfully. To avoid stopping unrelated
local services, `stop` verifies that the port responds like a Pondview bridge;
pass `--force` only when you intentionally want to stop whatever is listening on
that port.

## Flags

| Flag | Applies to | Description |
| --- | --- | --- |
| `--host <host>` | `serve`, `bridge`, client commands | Host for the local bridge. Defaults to `127.0.0.1`. |
| `--port <port>` | `serve`, `bridge`, `stop`, client commands | Port for the local bridge. Defaults to `17817`. |
| `--database <file>` | `serve`, `bridge`, client autostart | Opens a DuckDB file as the bridge's primary database instead of using an in-memory database. |
| `--readonly` | `serve`, `bridge`, `attach` | Starts readonly bridge mode, or attaches a DuckDB source readonly. |
| `--token <token>` | all bridge/client commands | Requires or sends a bridge auth token. |
| `--token-env <name>` | all bridge/client commands | Reads the bridge auth token from an environment variable. |
| `--url <url>` | client commands | Uses an explicit bridge URL and disables autostart. |
| `--file <path>` | `query` | Reads SQL from a UTF-8 file instead of inline command arguments. |
| `--title <title>` | `dashboard rename` | Sets the dashboard title. |
| `--yes` | `dashboard delete` | Confirms dashboard deletion. |
| `--no-autostart` | client commands | Fails when no bridge is reachable instead of starting one. |
| `--no-open` | `serve` | Does not open the browser after starting the local app. |
| `--force` | `stop` | Stops whatever is listening on the configured port without checking whether it is a Pondview bridge. |

## Bundled UI assets

`pondview serve` serves the UI from `packages/bridge/dist`. Build those assets
before using local serve from a fresh checkout:

```bash
bun run bridge:build-ui
```

The CLI does not fetch UI assets from Cloudflare. Keeping assets bundled makes
the local app work offline and keeps the UI version aligned with the bridge
code in the same repository.

Generated assets are excluded from Biome checks because they are minified build
output.

## Bridge API compatibility

The local server exposes both the newer bridge protocol routes and the browser
app compatibility routes:

- `/health`
- `/capabilities`
- `/catalog`
- `/query`
- `/sources`
- `/sources/attach`
- `/secrets/status`
- `/secrets/source/:id`
- `/secrets/ai`
- `/secrets/s3-backup`
- `/ai/chat`
- `/s3-backup/test`
- `/s3-backup/list`
- `/s3-backup/upload`
- `/s3-backup/download`
- `/ping`
- `/api/duckdb/config`

When auth is enabled, the bridge accepts both `Authorization: Bearer <token>`
and `X-API-Key: <token>` so CLI clients and the browser app can use the same
runtime.

Bridge-managed secrets are stored in `${XDG_CONFIG_HOME:-~/.config}/pondview/secrets.json` with restrictive filesystem permissions. Use `PONDVIEW_SECRETS_PATH` to override the file path.

## TODO: future improvements

- TODO: Publish a packaged `pondview` binary so users do not need `bun run bridge -- ...`.
- TODO: Add `pondview ui update` or a similar opt-in command if hosted asset
  syncing becomes useful later.
- TODO: Add project commands such as `pondview project inspect`,
  `pondview project run`, and `pondview project serve`.
- TODO: Add file import commands for CSV and Parquet staging, for example
  `pondview import ./customers.csv --table uploads.customers`.
- TODO: Add persistent local source binding files for project handoff.
