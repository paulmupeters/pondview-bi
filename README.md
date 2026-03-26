# Pondview

Pondview is a browser-first analysis and BI app built on top of duckdb. It combines AI-assisted analysis, direct/manual SQL workflows, charting, and dashboard persistence in one duckdb instance.

## How it works

### 1. The app is browser-first

- The UI is a SPA that interacts with a duckdb instance.
- AI settings, runtime preferences, connected source metadata, and much of the workspace state live in browser storage.
- Dashboard metadata is stored in the connected duckdb instance.
- DuckDB-WASM is always available as the local fallback runtime.

### 2. SQL can run on three backends

- `duckdb-wasm`: browser-local execution
- `bridge`: remote Pondview bridge runtime trough duckdb extension (coming soon)
- `duckdb-http`: remote DuckDB `httpserver` using the community extension.

Backend selection is user-configurable in Settings and is resolved at query time. The main reference is [docs-site/introduction/sql-runtime-backends.md](./docs-site/introduction/sql-runtime-backends.md).

### 3. Connected sources are runtime-aware

- The connect flow currently exposes `Postgres`, `MySQL`, `SQLite`, and `MotherDuck`.
- External source attachment and schema introspection require a remote runtime (`bridge` or `duckdb-http`).
- Source metadata is stored locally in the browser and reused by chat/manual SQL flows.

See [docs-site/introduction/connected-data-sources.md](./docs-site/introduction/connected-data-sources.md).

### 4. AI configuration is browser-first

- The main chat flow reads provider, model, and API key from browser storage.
- Most local development starts by opening Settings and configuring an AI provider rather than setting server env vars.
- Supported providers include Gateway, OpenAI, Anthropic, xAI, and Open Responses.

See [docs-site/introduction/ai-provider-configuration.md](./docs-site/introduction/ai-provider-configuration.md).

### 5. Dashboards persist canonical SQL, not rewritten runtime SQL

- Saved charts and measures keep canonical SQL plus a `DashboardSourceDescriptor`.
- At execution time, the browser-side dashboard runtime plans bindings for the active backend.
- When needed, referenced tables are exposed through runtime-local `pondview_exec.*` aliases.
- External sources may be refreshed into execution tables so joins and filters can run in one runtime.

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

## Quick Start

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

Open [http://localhost:5173](http://localhost:5173), then configure AI provider settings in the app.

## Important Runtime Configuration

Use `.env.local` only for the integrations you need:

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

The template lives at [env.local.example](./env.local.example).

### MotherDuck note

MotherDuck auth is completed by the remote DuckDB runtime. If you want auth to persist across restarts, set `motherduck_token` in the environment used to launch DuckDB.

## Repository Map

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
