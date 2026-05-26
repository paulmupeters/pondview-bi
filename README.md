# Pondview

DuckDB-powered BI for AI-assisted analysis, SQL, charts, and dashboards in one workspace.

- Browser-first UI with DuckDB WASM as the local fallback; Bridge, MotherDuck, HTTPFS, and Quack-backed sources supported
- AI chat and manual SQL share the same workspace and connected sources
- Charts and dashboard metadata persist in DuckDB

Docs: [docs-site/user/index.md](./docs-site/user/index.md)

## CLI quick start

For most local use, install the Pondview CLI and let it start both the local UI
and Bridge runtime:

```bash
npm install -g @pondview/cli
pondview start
```

Or run it without installing globally:

```bash
npx @pondview/cli start
```

The published CLI runs on Node.js 20 or newer. By default, `pondview start`
serves the bundled app and bridge API at `http://127.0.0.1:17817`, then opens it
in your browser. Use a DuckDB file or project directory when you want Pondview to
work against local files:

```bash
pondview start --database ./analytics.duckdb
pondview start --project-dir ./my-pondview-project
pondview attach ./warehouse.duckdb --as warehouse
pondview query "SELECT 42 AS answer"
```

See [docs-site/guide/cli.md](./docs-site/guide/cli.md) for commands, flags, and
local project behavior.

## How it works

### SQL runtime backends

Queries can run on two backends:

- `duckdb-wasm`: browser-local execution
- `bridge`: local Pondview Bridge execution through DuckDB's Node API

Backend selection is user-configurable in Settings and resolved at query time.
Remote and extension-backed databases are connected sources, not separate query
runtimes.

See [docs-site/guide/sql-runtime-backends.md](./docs-site/guide/sql-runtime-backends.md).

### Connected data sources

The Connect Data dialog currently supports:

- `Postgres`
- `MotherDuck`
- `MySQL`
- `SQLite`
- `HTTPFS` remote files (`s3://`, `r2://`, `gcs://`, `gs://`, `http://`, `https://`)
- `Quack` remote DuckDB endpoints

Most external source attachment and schema introspection require Bridge, because
Bridge provides the server-side DuckDB runtime and secret boundary. HTTPFS can
also run in DuckDB WASM when the browser can fetch the target URL, but Bridge is
recommended for private object stores, authenticated HTTPS files, and sources
that do not allow browser CORS access.

Quack attaches remote DuckDB servers through DuckDB's beta `quack` extension and
uses URIs such as `quack:localhost:9494`. Because Pondview runs on top of
DuckDB, CLI-defined custom sources can also use other attach-compatible DuckDB
extensions when the active runtime can install and load them. Alternatively, any
ETL process that writes to a DuckDB file can provide the source data for a
Pondview project.

Source metadata is stored locally in the browser and reused across chat and manual SQL workflows.

See [docs-site/guide/connected-data-sources.md](./docs-site/guide/connected-data-sources.md).

### AI providers

- In most local setups, you configure an AI provider in the app’s Settings instead of through server environment variables.
- Supported providers include Vercel AI Gateway, OpenAI, Anthropic, xAI, Ollama, and OpenAI-compatible endpoints.

See [docs-site/guide/ai-provider-configuration.md](./docs-site/guide/ai-provider-configuration.md).

### Dashboard persistence

Saved charts and measures store SQL plus source metadata. At execution time, the dashboard runtime adapts queries for the active backend and can materialize external data when needed for joins, filters, and dashboard execution.

See:

- [docs-site/guide/dashboards.md](./docs-site/guide/dashboards.md)
- [docs-site/guide/semantic-layer-materialization.md](./docs-site/guide/semantic-layer-materialization.md)
- [docs-site/guide/duckdb-usage-overview.md](./docs-site/guide/duckdb-usage-overview.md)

## Getting started

### Prerequisites

- Node.js 20+ for the published CLI
- Bun recommended for repository development, or Node.js 18+
- An API key for at least one supported AI provider

### Repository development

```bash
git clone https://github.com/paulmupeters/pondview-ui.git
cd pondview-ui
bun install
cp env.local.example .env.local
bun dev
```

Open http://localhost:5173, then configure an AI provider in the app.

DuckDB WASM works as the default local runtime. Start Bridge when you want the
local CLI/runtime, filesystem project artifacts, server-side secrets, or
extension-backed source attachment.

### Runtime configuration

Use `.env.local` only for the integrations you need:

```bash
# Persist a local DuckDB runtime database
DUCKDB_PERSIST_PATH=./data/materialized.duckdb

# Optional server-side provider defaults
AI_GATEWAY_API_KEY=
OPENAI_API_KEY=
MOTHERDUCK_TOKEN=

# Override Bridge's local secret store path
PONDVIEW_SECRETS_PATH=
```

The template lives at `env.local.example`.

### Workspace DB debug logging

Workspace IndexedDB debug logs are off by default.

To turn them on in your browser console:

```js
localStorage.setItem("WORKSPACE_DB_DEBUG", "true");
```

To turn them off again:

```js
localStorage.removeItem("WORKSPACE_DB_DEBUG");
```

Or:

```js
localStorage.setItem("WORKSPACE_DB_DEBUG", "false");
```

For notebook controller debugging, run:

```js
localStorage.setItem("pondview:debug:notebook-controller", "1");
```

### MotherDuck

MotherDuck authentication is completed by the active DuckDB runtime. To persist
auth across Bridge restarts, set `MOTHERDUCK_TOKEN` in the environment used to
launch Bridge.

### Commands

```bash
# App
bun dev
bun run build
bun run preview

# Docs
bun run docs:dev
bun run docs:build
bun run docs:preview

# Quality
bun run lint
bun run format
bun run typecheck
bun run test
```

### Pondview bridge CLI

`pondview start` runs the local Pondview UI and bridge API together.
`pondview start --no-ui` runs the API-only bridge for hosted UI connections or
background CLI use.

Bridge-backed commands such as `pondview attach`, `pondview list-sources`,
`pondview detach`, and `pondview query` use the same local bridge runtime.
If a client command auto-starts the bridge in the background, stop it with
`pondview stop`. Bridge mode writes project artifacts directly to a filesystem
project rooted at the launch directory, or `--project-dir <dir>` when provided.
When starting the local app in an empty folder, Pondview asks whether to
initialize local project files or keep using browser storage for that folder.
See [Pondview CLI](./docs-site/guide/cli.md) for commands, flags, bundled UI
assets built into `packages/bridge/dist`, autostart behavior, and future TODOs.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contribution workflow and local checks.

## Security

See [SECURITY.md](./SECURITY.md) for how to report vulnerabilities privately.

## License

This project is licensed under the Apache License 2.0. See [LICENSE](./LICENSE).
