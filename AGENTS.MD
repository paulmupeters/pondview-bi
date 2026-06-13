# AGENTS.MD

Guidance for AI coding agents working in this repository.

## Project overview

Pondview is a Vite + React + TypeScript single-page BI app powered by DuckDB. It supports AI-assisted analysis, manual SQL workflows, connected data sources, charts, dashboards, and a Bun-based Pondview bridge CLI/local runtime.

Key technologies:

- Runtime/package manager: Bun
- UI: React 19, React Router, Radix UI, Tailwind CSS
- Build: Vite
- Language: TypeScript with `strict` enabled
- Formatting/linting: Biome
- Data/runtime: DuckDB WASM, DuckDB HTTP, Pondview bridge runtime, DuckDB Node API
- AI: AI SDK providers and browser-configured AI settings
- CLI/workspaces: `pondview` bin, `packages/bridge`, `packages/bridge-protocol`

## Important commands

Use Bun unless there is a strong reason not to.

```bash
bun install
bun dev
bun run build
bun run typecheck
bun run lint
bun run test
bun run format
```

Bridge CLI/runtime commands:

```bash
bun run bridge -- help
bun run bridge -- start
bun run bridge -- start --no-ui
bun run bridge:build-ui
bun run bridge:typecheck
bun run bridge-protocol:typecheck
```

Docs site commands:

```bash
bun run docs:dev
bun run docs:build
bun run docs:preview
```

Before considering a task complete, run the narrowest useful checks first. For broad changes, prefer:

```bash
bun run typecheck
bun run lint
bun run test
```

## Repository structure

- Root `package.json` defines a Bun workspace monorepo with `packages/*`.
- The current web app intentionally remains at the repository root in `src/`; do not move it to `apps/web` until package boundaries are stable enough to justify the migration.
- Move code into packages when there are multiple real consumers. Keep web-only code in `src/`, bridge-only code in `packages/bridge/`, and shared bridge contracts in `packages/bridge-protocol/`.
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

## Coding conventions

- Keep TypeScript strict and avoid `any` unless the boundary is genuinely dynamic.
- Prefer explicit types for public functions, exported helpers, component props, and non-obvious return values.
- Use the `@/` import alias for imports from `src`.
- Keep imports organized; Biome handles formatting and import organization.
- Match existing file naming conventions: many components are kebab-case files exporting PascalCase components.
- Keep components focused. Move reusable logic into hooks or `src/lib/` helpers.
- Prefer deterministic, testable pure functions for SQL/query transformations and runtime adaptation logic.
- Avoid large rewrites unless the task explicitly requires them.
- Preserve existing public behavior unless changing it is part of the request.

## React/UI guidance

- Use function components and hooks.
- Keep browser UI code separate from Bun/Node-only bridge package code.
- Follow existing design language and shared components before adding new primitives.
- Prefer accessible Radix UI primitives and semantic HTML.
- Biome a11y rules are warnings; still address accessibility issues when touching related UI.
- Keep client/browser-only APIs behind guards such as `typeof window !== "undefined"` when needed.
- Do not introduce server-only assumptions; this is a browser-first Vite app.

## DuckDB and SQL runtime guidance

Pondview supports multiple SQL backends:

- `duckdb-wasm` for browser-local execution
- `duckdb-http` for remote DuckDB HTTP execution
- `bridge` for the Pondview bridge runtime and CLI-served local app

When changing SQL execution, dashboard execution, source attachment, or materialization code:

- Check behavior across all relevant backends.
- Avoid backend-specific SQL unless guarded or adapted in the appropriate runtime layer.
- Preserve DuckDB WASM as the local fallback path.
- Add or update tests for SQL transformation, materialization, runtime selection, and backend-specific behavior.
- Consult existing docs in `docs-site/guide/` when behavior changes.

## Bridge CLI/runtime guidance

The repository includes a Bun CLI exposed as the `pondview` bin and developed via `bun run bridge -- ...`.

Current commands include:

- `pondview start` — start the bridge API server, serve the built Pondview UI from `packages/bridge/dist`, and open the browser unless `--no-open` is passed.
- `pondview start --no-ui` — start the bridge API server without serving the UI.
- `pondview attach <file.duckdb|s3://...> --as <alias>` — attach a DuckDB database source.
- `pondview list-sources`, `pondview detach <source-id-or-alias>`, and `pondview query <sql>` — client commands against a running bridge.

When changing the bridge CLI/server/protocol:

- Keep shared request/response contracts in `packages/bridge-protocol` and validate with Zod schemas.
- Update both server tests and browser bridge client tests when auth, config discovery, or query response shapes change.
- Treat `--token`, `--token-env`, `PONDVIEW_TOKEN`, connection strings, and source identifiers as sensitive in logs and docs.
- Run focused checks such as `bun test packages/bridge/src/*.test.ts`, `bun test packages/bridge/src/runtime/*.test.ts`, `bun run bridge:typecheck`, and `bun run bridge-protocol:typecheck`.
- If `pondview start` UI-serving behavior changes, rebuild or document the bundled UI with `bun run bridge:build-ui`.

## AI feature guidance

- Most AI provider configuration is stored in browser/app settings, not server environment variables.
- Do not expose API keys or persist secrets in code, docs, tests, or snapshots.
- Keep provider-specific behavior isolated in `src/ai/` where possible.
- When changing AI prompts, tool calls, model selection, or streaming behavior, update focused tests and user-facing docs if behavior changes.

## Testing expectations

- Place tests near the code they exercise using the existing `*.test.ts` / `*.test.tsx` pattern.
- Prefer small unit tests for helpers in `src/lib/`, `src/hooks/`, and feature modules.
- For UI behavior, test the smallest component or hook surface that proves the change.
- Run targeted tests during development, then broader checks for cross-cutting changes.

Example targeted test command:

```bash
bun test src/path/to/file.test.ts
```

## Documentation expectations

Update documentation when changes affect setup, user-visible behavior, supported runtimes, connected sources, dashboards, or AI configuration.

Useful docs entry points:

- `README.md`
- `CONTRIBUTING.md`
- `docs-site/user/index.md`
- `docs-site/guide/sql-runtime-backends.md`
- `docs-site/guide/connected-data-sources.md`
- `docs-site/guide/ai-provider-configuration.md`
- `docs-site/guide/dashboards.md`

## Environment and secrets

- Use `env.local.example` as the template for local environment variables.
- Do not commit `.env.local` or real credentials.
- Treat AI provider keys, database credentials, access tokens, and remote runtime credentials as secrets.
- Avoid logging secrets or connection strings.

## Dependency guidance

- Prefer existing dependencies before adding new ones.
- If adding a dependency, make sure it is necessary, maintained, and compatible with Bun/Vite/browser usage.
- Be careful with duplicate CodeMirror packages; `vite.config.ts` intentionally dedupes CodeMirror modules.

## Cursor Cloud specific instructions

Standard commands and structure are documented above and in `README.md`; this section only captures non-obvious caveats for cloud agents. Dependencies are already installed by the startup update script, so do not reinstall unless something is broken.

- Package manager is Bun (installed at `~/.bun/bin/bun`, also on PATH via `~/.bashrc`). Node 22 is preinstalled.
- Install with the isolated linker: `bun install --linker isolated`. This repo commits `.bun`-style isolated symlinks inside the workspace sub-packages' `node_modules` (`packages/bridge`, `packages/bridge-protocol`). A plain hoisted `bun install` leaves those symlinks broken, which makes `bun test` fail with `ENOENT reading ".../node_modules/<dep>"` (e.g. `@duckdb/node-api`, `zod`). The isolated linker creates `node_modules/.bun/` and resolves them.
- Run `bun test` from the repo root (`/workspace`); the Bun test runner discovers tests relative to the current directory, so running it inside a sub-package only runs that package's tests.
- App run/build/lint/test commands are in `README.md` / `package.json`. Dev server is `bun dev` on `http://localhost:5173`.
- The product is browser-first: DuckDB WASM executes SQL in-browser, so no backend/database is needed to run and exercise the core BI workflows. The Pondview bridge CLI (`bun run pondview start`) is only needed for server-side runtimes, local `.duckdb` files, or external sources.

## Pull request hygiene

When preparing a change:

1. Keep the diff focused on the requested task.
2. Update or add tests for changed behavior.
3. Update docs if user-facing behavior changes.
4. Run the relevant checks.
5. Summarize what changed, how it was tested, and any follow-up risks.
