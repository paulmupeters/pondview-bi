# Pondview

DuckDB-powered BI for AI-assisted analysis, SQL, charts, and dashboards in one workspace.

This README is for repository development. For product setup and usage, see the [Pondview Guide](./docs-site/guide/index.md).

## Repository development

### Prerequisites

- Bun for local development
- Node.js 20+ for published CLI compatibility and packaging checks
- Optional API keys for the AI providers or data sources you want to test

### Setup

```bash
git clone https://github.com/paulmupeters/pondview-ui.git
cd pondview-ui
bun install
cp env.local.example .env.local
bun dev
```

Open http://localhost:5173 for the development app.

DuckDB WASM works as the default browser-local runtime. Start Bridge when you need the local CLI/runtime, filesystem project artifacts, server-side secrets, or extension-backed source attachment.

## Development commands

```bash
# App
bun dev
bun run build
bun run preview

# Docs
bun run docs:dev
bun run docs:build
bun run docs:preview

# Bridge CLI/runtime
bun run bridge -- help
bun run bridge -- start
bun run bridge -- start --no-ui
bun run bridge:build-ui
bun run bridge:typecheck
bun run bridge-protocol:typecheck

# Quality
bun run typecheck
bun run lint
bun run test
bun run format
```

For broad checks, prefer:

```bash
bun run typecheck
bun run lint
bun run test
```

## Local runtime configuration

Use `.env.local` only for the integrations you need. The template lives at [`env.local.example`](./env.local.example).

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

MotherDuck authentication is completed by the active DuckDB runtime. To persist auth across Bridge restarts, set `MOTHERDUCK_TOKEN` in the environment used to launch Bridge.

## Bridge development

Run the development bridge CLI with:

```bash
bun run bridge -- start
bun run bridge -- start --no-ui
bun run bridge -- query "SELECT 42 AS answer"
```

Build the app into the bridge package when testing UI-serving behavior:

```bash
bun run bridge:build-ui
```

See the user-facing [Pondview CLI guide](./docs-site/guide/cli.md) for command behavior, flags, project directories, bundled UI assets, and autostart behavior.

## Workspace debug logging

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

## Repository structure

- `src/app/` — route/page-level React code
- `src/components/` — reusable UI and feature components
- `src/components/ui/` — shared low-level UI primitives
- `src/ai/` — AI settings, models, prompts, tools, and AI clients
- `src/hooks/` — shared React hooks
- `src/lib/` — application logic, DuckDB/runtime code, project/workspace stores, SQL helpers
- `src/features/` — feature-specific modules
- `src/themes/` — theme definitions
- `packages/bridge/` — Bun CLI and local Pondview bridge server backed by DuckDB Node API
- `packages/bridge-protocol/` — shared bridge client, schemas, and protocol types
- `docs-site/` — VitePress documentation
- `scripts/` — repository maintenance scripts
- `public/` — static assets

## Documentation

User instructions and product reference live in [`docs-site/guide`](./docs-site/guide/index.md).

When changing setup, user-visible behavior, supported runtimes, connected sources, dashboards, or AI configuration, update the docs and run:

```bash
bun run docs:build
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contribution workflow and local checks.

## Security

See [SECURITY.md](./SECURITY.md) for how to report vulnerabilities privately.

## License

This project is licensed under the Apache License 2.0. See [LICENSE](./LICENSE).
