# Pondview

Pondview is a DuckDB-powered BI app for chatting with data, writing SQL, and building dashboards.

It combines AI-assisted analysis, manual SQL workflows, charting, and dashboards in a single DuckDB-backed workspace.

## overview

- Connects to your local or remote DuckDB instance, a DuckDB WASM instance or Motherduck.
- Browser-first UI with DuckDB WASM always available as a local fallback
- AI-assisted analysis and direct SQL editing in the same workspace
- Connected sources including Postgres, MySQL, and MotherDuck
- Persistent charts and dashboards stored in DuckDB
- Works great with all DuckDB features and extensions

This README is the short technical summary. For fuller documentation, use the published docs:

- User docs: [docs-site/user/index.md](./docs-site/user/index.md)

## why pondview

Pondview is built for teams and individuals who want the speed of conversational analysis without giving up direct control over SQL, data modeling, and dashboards.

- Keeps AI-assisted exploration and manual SQL in the same workspace
- Uses DuckDB as the core engine, so you can stay close to the data and its ecosystem
- Supports local-first usage with DuckDB WASM, while still allowing remote runtimes when needed
- Lets charts and dashboards persist in DuckDB instead of being scattered across disconnected tools

## how it works

### The workspace

- The UI is a SPA that interacts with a selected DuckDB instance.
- AI settings, runtime preferences, connected source metadata, and much of the workspace state live in browser storage.
- Dashboard metadata is stored in the connected DuckDB instance.
- DuckDB WASM is always available as the local fallback runtime.

### SQL runtime backends

Queries can run on three backends:

- `duckdb wasm`: browser-local execution
- `duckdb-http`: remote DuckDB `httpserver` using the community extension
- `bridge`: remote Pondview bridge runtime through a DuckDB extension

Backend selection is user-configurable in Settings and resolved at query time.

See [docs-site/introduction/sql-runtime-backends.md](./docs-site/introduction/sql-runtime-backends.md).

### Connected data sources

The connect flow trough ui currently supports:

- `Postgres`
- `MySQL`
- `SQLite`
- `MotherDuck`

External source attachment and schema introspection require a remote runtime (`bridge` or `duckdb-http`). Because Pondview runs on top of DuckDB, you can make use of the ecosystem and install any (community) extension. This makes it possible to connect to a wide variety of sources. Alternatively its possible to use any ETL process that writes to a duckdb file, and use the data in this duckdb file as the source data of your pondview instance.

Source metadata is stored locally in the browser and reused across chat and manual SQL workflows.

See [docs-site/introduction/connected-data-sources.md](./docs-site/introduction/connected-data-sources.md).

### AI providers

- In most local setups, you configure an AI provider in the app’s Settings instead of through server environment variables.
- Supported providers include OpenAI, Anthropic, xAI, Vercel AI Gateway and the Open Responses API.

See [docs-site/introduction/ai-provider-configuration.md](./docs-site/introduction/ai-provider-configuration.md).

### Dashboard persistence

Saved charts and measures store SQL plus source metadata. At execution time, the dashboard runtime adapts queries for the active backend and can materialize external data when needed for joins, filters, and dashboard execution.

See:

- [docs-site/guide/dashboards.md](./docs-site/guide/dashboards.md)
- [docs-site/introduction/semantic-layer-materialization.md](./docs-site/introduction/semantic-layer-materialization.md)
- [docs-site/introduction/duckdb-usage-overview.md](./docs-site/introduction/duckdb-usage-overview.md)

## getting started

### Prerequisites

- Bun recommended, or Node.js 18+
- An API key for at least one supported AI provider

### Install and run

```bash
git clone https://github.com/paulmupeters/pondview-ui.git
cd pondview-ui
bun install
cp env.local.example .env.local
bun dev
```

Open http://localhost:5173, then configure an AI provider in the app.

DuckDB WASM works as the default local runtime. Remote runtime settings are only needed for remote DuckDB execution or external source attachment.

### Runtime configuration

Use .env.local only for the integrations you need:

```bash
# Persist a local DuckDB runtime database
DUCKDB_PERSIST_PATH=./data/materialized.duckdb

# Remote DuckDB over HTTP
DUCKDB_HTTP_HOST=0.0.0.0
DUCKDB_HTTP_PORT=9999
DUCKDB_HTTP_AUTH=secret

# Legacy/server-side OpenAI flows
OPENAI_API_KEY=
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

for rnotebook debugging run:

```js
localStorage.setItem("pondview:debug:notebook-controller", "1");
```

### MotherDuck

MotherDuck authentication is completed by the remote DuckDB runtime. To persist auth across restarts, set motherduck_token in the environment used to launch DuckDB.

### Commands

```bash
# App
bun dev
bun build
bun preview

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

`pondview serve` runs the local Pondview UI and bridge API together.
`pondview bridge` runs the API-only bridge for hosted UI connections or
background CLI use.

Bridge-backed commands such as `pondview attach`, `pondview list-sources`,
`pondview detach`, and `pondview query` use the same local bridge runtime.
If a client command auto-starts the bridge in the background, stop it with
`pondview stop`. See [Pondview CLI](./docs-site/guide/cli.md) for commands,
flags, bundled UI assets built into `packages/bridge/dist`, autostart behavior,
and future TODOs.

## contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contribution workflow and local checks.

## security

See [SECURITY.md](./SECURITY.md) for how to report vulnerabilities privately.

## license

This project is licensed under the Apache License 2.0. See [LICENSE](./LICENSE).
