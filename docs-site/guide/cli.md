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
pondview bridge --readonly
```

Use this when the hosted Pondview app should connect to a local bridge, or when
CLI client commands need a background API runtime without opening the UI.

### Client commands

These commands talk to the bridge API:

```bash
pondview attach ./analytics.duckdb --as analytics
pondview list-sources
pondview query "SELECT 42 AS answer"
pondview detach analytics
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

## Flags

| Flag | Applies to | Description |
| --- | --- | --- |
| `--host <host>` | `serve`, `bridge`, client commands | Host for the local bridge. Defaults to `127.0.0.1`. |
| `--port <port>` | `serve`, `bridge`, client commands | Port for the local bridge. Defaults to `17817`. |
| `--readonly` | `serve`, `bridge`, `attach` | Starts readonly bridge mode, or attaches a DuckDB source readonly. |
| `--token <token>` | all bridge/client commands | Requires or sends a bridge auth token. |
| `--token-env <name>` | all bridge/client commands | Reads the bridge auth token from an environment variable. |
| `--url <url>` | client commands | Uses an explicit bridge URL and disables autostart. |
| `--no-autostart` | client commands | Fails when no bridge is reachable instead of starting one. |
| `--no-open` | `serve` | Does not open the browser after starting the local app. |

## Bundled UI assets

`pondview serve` serves the UI from `packages/bridge/static`. Build those assets
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
- `/ping`
- `/api/duckdb/config`

When auth is enabled, the bridge accepts both `Authorization: Bearer <token>`
and `X-API-Key: <token>` so CLI clients and the browser app can use the same
runtime.

## TODO: future improvements

- TODO: Publish a packaged `pondview` binary so users do not need `bun run bridge -- ...`.
- TODO: Add `pondview ui update` or a similar opt-in command if hosted asset
  syncing becomes useful later.
- TODO: Add project commands such as `pondview project inspect`,
  `pondview project run`, and `pondview project serve`.
- TODO: Add file import commands for CSV and Parquet staging, for example
  `pondview import ./customers.csv --table uploads.customers`.
- TODO: Add persistent local source binding files for project handoff.
- TODO: Add a machine-readable `pondview doctor` command for diagnostics.
