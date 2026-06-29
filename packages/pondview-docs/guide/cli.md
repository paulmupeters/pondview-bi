# Pondview CLI

The Pondview CLI runs a local DuckDB bridge and serves the Pondview UI from
bundled static assets by default.

Use the CLI when you want local files, native DuckDB database attachments, or a
local app that does not depend on the hosted Pondview deployment.

## Quick start

Install the published CLI with npm:

```bash
npm install -g @pondview/cli
pondview start
```

Or run it without installing globally:

```bash
npx @pondview/cli start
```

`pondview start` starts one localhost server for both the UI and bridge API. By
default it listens on `127.0.0.1:17817` and opens the local app in your browser.

Use `--no-open` when running from scripts or terminals where opening a browser
would be noisy:

```bash
pondview start --no-open
```

## Commands

### `pondview start`

Runs the local Pondview app and bridge API together.

```bash
pondview start
pondview start --port 17818
pondview start --host 127.0.0.1 --port 17817 --no-open
pondview start --database ./analytics.duckdb
pondview start --project-dir ./my-pondview-project
pondview start --no-ui
```

This is the default user-facing local mode. API routes win over static UI
routes, bundled files are served from the CLI package, and unknown `GET` routes
fall back to `index.html` for React Router.

Pass `--no-ui` to run only the bridge API without serving or opening the local
UI. Use this when the hosted Pondview app should connect to a local bridge, or
when CLI client commands need a background API runtime.

By default, the local app uses the project default DuckDB source when the folder
already has Pondview project metadata. For a new folder, initialization creates
and uses `runtime/pondview-runtime.duckdb` in the project folder as the primary
catalog, and records that default source in `pondview/project.json`. Pass
`--database <file.duckdb>` to open a specific DuckDB file as the
primary database, so unqualified queries such as `SELECT * FROM my_table` run
against that file. This is different from `pondview attach`, which exposes a
file as an attached catalog that you query with its alias, for example
`analytics.main.my_table`.

Bridge mode also exposes a filesystem-backed Pondview project. By default the
project root is the directory where the bridge was launched; pass
`--project-dir <dir>` to use a different folder. Dashboards, saved queries,
published notebooks, and source metadata are written as raw project artifact
files such as `pondview/...`; bridge metadata lives in `.pondview/project.json`.

When `pondview start` opens a folder for the first time, the local app checks
for `.duckdb` files in that folder's root. If exactly one is found, you get a
quick-start screen to open it as your primary database. If you pass
`--database <file.duckdb>`, that file is used instead. With no DuckDB file
present, the app asks whether to initialize local project files or keep working
from browser storage. Initializing creates `pondview/project.json`, bridge
metadata, and the local DuckDB runtime file. Browser mode leaves the folder
untouched and uses the existing browser IndexedDB workflow for that project
folder.

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

If no bridge is running, client commands automatically start
`pondview start --no-ui`, wait for it to become healthy, then retry the original
request.

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

### MCP server

`pondview start` serves the primary Streamable HTTP MCP endpoint alongside the
Bridge DuckDB runtime and Pondview UI:

```bash
pondview start --project-dir ./example
claude mcp add --transport http pondview http://127.0.0.1:17817/mcp
codex mcp add pondview --url http://127.0.0.1:17817/mcp
```

For a headless bridge:

```bash
pondview start --no-ui --project-dir ./example
```

`pondview mcp` is retained as a compatibility stdio server and supports
standalone embedded use:

```bash
pondview mcp --database ./data.duckdb
```

The MCP server exposes table listing, schema inspection, row previews, and SQL
execution. It can also create Pondview dashboards and visuals from SQL. Visual
creation returns a local dashboard URL that agents can open in a browser:

```text
Using Pondview, create a monthly revenue line chart and return the dashboard URL.
```

SQL execution is read-only by default. For trusted local HTTP workflows:

```bash
pondview start --mcp-allow-write-sql
```

Dashboard creation tools write Pondview dashboard metadata through the bridge.
The `execute_sql` tool still requires `--mcp-allow-write-sql` for user-supplied
write statements over HTTP. The compatibility stdio command uses
`--allow-write-sql`.

The MCP server also exposes dashboard discovery and navigation helpers:
`list_dashboards`, `get_dashboard`, `open_dashboard`, and `open_ui`. These tools
return local Pondview URLs for the agent to share.

This MCP mode uses the Bridge runtime and Bridge secret store. It does not read
browser-only AI provider settings and does not expose provider API keys to MCP
clients.

### Local source bindings

New projects store their default DuckDB source in `pondview/project.json`, so a
cloned project can start against the same relative `.duckdb` path after that
file has been created. `pondview.sources.local.json` is still supported as a
legacy local override for machine-specific source bindings. If present, it is
private to the local project checkout and should not be committed.

```bash
pondview source add google-sheet \
  --sql "INSTALL gsheets FROM community; LOAD gsheets; CREATE OR REPLACE VIEW sheet_sales AS SELECT * FROM read_gsheet('https://docs.google.com/spreadsheets/d/.../edit', sheet = 'Sheet1', range = 'A:Z');"

pondview source add snowflake \
  --sql "INSTALL snowflake FROM community; LOAD snowflake; ATTACH '' AS sf (TYPE snowflake, SECRET my_snowflake, READ_ONLY);"

pondview source list
pondview source remove google-sheet
```

Custom sources are SQL-backed. The CLI stores raw setup SQL, and Pondview runs it
before using the source. The setup SQL can prepare views, tables, secrets, table
functions, or attached catalogs.

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
| `--host <host>` | `start`, client commands | Host for the local bridge. Defaults to `127.0.0.1`. |
| `--port <port>` | `start`, `stop`, client commands | Port for the local bridge. Defaults to `17817`. |
| `--database <file>` | `start`, client autostart | Opens a DuckDB file as the bridge's primary database instead of the project default or in-memory database. |
| `--project-dir <dir>` | `start`, client autostart | Filesystem project root for raw Pondview artifacts. Defaults to the launch directory. |
| `--readonly` | `attach` | Attaches a source with DuckDB `READ_ONLY`. |
| `--token <token>` | all bridge/client commands | Requires or sends a bridge auth token. |
| `--token-env <name>` | all bridge/client commands | Reads the bridge auth token from an environment variable. |
| `--url <url>` | client commands | Uses an explicit bridge URL and disables autostart. |
| `--file <path>` | `query` | Reads SQL from a UTF-8 file instead of inline command arguments. |
| `--title <title>` | `dashboard rename` | Sets the dashboard title. |
| `--yes` | `dashboard delete` | Confirms dashboard deletion. |
| `--no-autostart` | client commands | Fails when no bridge is reachable instead of starting one. |
| `--no-open` | `start`, `dashboard open` | Does not open the browser after starting the local app. |
| `--no-ui` | `start` | Starts the bridge API only. |
| `--force` | `stop` | Stops whatever is listening on the configured port without checking whether it is a Pondview bridge. |

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
