# Pondview

Browser-first, DuckDB-powered BI app for chatting with data, writing SQL, and building persistent dashboards.

Pondview combines AI-assisted analysis, manual SQL workflows, charting, and dashboard persistence in a single DuckDB-backed workspace.

## Features

- Browser-first UI with DuckDB-WASM always available as a local fallback
- AI-assisted analysis and direct SQL editing in the same workspace
- Configurable SQL execution across local and remote DuckDB runtimes
- Connected sources including Postgres, MySQL, SQLite, and MotherDuck
- Persistent charts and dashboards stored in DuckDB

## How it works

### Browser-first workspace

- The UI is a SPA that interacts with a DuckDB instance.
- AI settings, runtime preferences, connected source metadata, and much of the workspace state live in browser storage.
- Dashboard metadata is stored in the connected DuckDB instance.
- DuckDB-WASM is always available as the local fallback runtime.

### SQL runtime backends

Queries can run on three backends:

- `duckdb-wasm`: browser-local execution
- `bridge`: remote Pondview bridge runtime through a DuckDB extension (coming soon)
- `duckdb-http`: remote DuckDB `httpserver` using the community extension

Backend selection is user-configurable in Settings and resolved at query time.

See [docs-site/introduction/sql-runtime-backends.md](./docs-site/introduction/sql-runtime-backends.md).

### Connected data sources

The connect flow currently supports:

- `Postgres`
- `MySQL`
- `SQLite`
- `MotherDuck`

External source attachment and schema introspection require a remote runtime (`bridge` or `duckdb-http`).

Source metadata is stored locally in the browser and reused across chat and manual SQL workflows.

See [docs-site/introduction/connected-data-sources.md](./docs-site/introduction/connected-data-sources.md).

### AI provider configuration

AI configuration is browser-first.

- The main chat flow reads provider, model, and API key from browser storage.
- In most local setups, you configure an AI provider in the app’s Settings instead of through server environment variables.
- Supported providers include Gateway, OpenAI, Anthropic, xAI, and Open Responses.

See [docs-site/introduction/ai-provider-configuration.md](./docs-site/introduction/ai-provider-configuration.md).

### Dashboard persistence

Saved charts and measures store canonical SQL plus source metadata. At execution time, the dashboard runtime adapts queries for the active backend and can materialize external data when needed for joins, filters, and dashboard execution.

See:

- [docs-site/guide/dashboards.md](./docs-site/guide/dashboards.md)
- [docs-site/introduction/semantic-layer-materialization.md](./docs-site/introduction/semantic-layer-materialization.md)
- [docs-site/introduction/duckdb-usage-overview.md](./docs-site/introduction/duckdb-usage-overview.md)

## Stack

- Vite 8
- React 19
- TypeScript
- React Router DOM v7
- Tailwind CSS v4
- Radix UI
- Recharts
- CodeMirror 6
- AI SDK v6
- DuckDB WASM + DuckDB Node/API integrations

## Quick start

### Prerequisites

- Bun recommended, or Node.js 18+
- An API key for at least one supported AI provider

### Install and run

```bash
git clone <repository-url>
cd bi-chat
bun install
cp env.local.example .env.local
bun dev
```

Open http://localhost:5173
, then configure an AI provider in the app.

DuckDB-WASM works as the default local runtime. Remote runtime settings are only needed for remote DuckDB execution or external source attachment.

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

The template lives at env.local.example
.

### MotherDuck

MotherDuck authentication is completed by the remote DuckDB runtime. To persist auth across restarts, set motherduck_token in the environment used to launch DuckDB.

### Repository structure

```text
bi-chat/
├── docs-site/               # VitePress docs app
├── docs/                    # Supporting notes and datasource context
├── public/                  # Static assets
├── src/
│   ├── ai/                  # Agent config, prompts, providers, client helpers
│   ├── app/                 # Routes and app-level pages
│   ├── components/          # UI components and interaction flows
│   ├── hooks/               # React hooks
│   ├── lib/                 # SQL runtime, DuckDB, workspace, dashboards
│   ├── themes/              # Built-in themes
│   └── vite/                # Vite shell integration
├── env.local.example
└── vite.config.ts
```

## Commands

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

## Contributing

1. Create a branch.
2. Make the code change.
3. Run the relevant checks.
4. Update docs when behavior changes.
5. Open a pull request.

## License

This project is licensed under the Apache License 2.0. See [LICENSE](./LICENSE).

This README is the short technical summary. For fuller documentation, use the published docs:

- User docs: [docs-site/user/index.md](./docs-site/user/index.md)
