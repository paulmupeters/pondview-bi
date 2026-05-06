# AGENTS.MD

Guidance for AI coding agents working in this repository.

## Project overview

Pondview is a Vite + React + TypeScript single-page BI app powered by DuckDB. It supports AI-assisted analysis, manual SQL workflows, connected data sources, charts, and dashboards.

Key technologies:

- Runtime/package manager: Bun
- UI: React 19, React Router, Radix UI, Tailwind CSS
- Build: Vite
- Language: TypeScript with `strict` enabled
- Formatting/linting: Biome
- Data/runtime: DuckDB WASM, DuckDB HTTP, Pondview bridge runtime
- AI: AI SDK providers and browser-configured AI settings

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

- `src/app/` — route/page-level React code
- `src/components/` — reusable UI and feature components
- `src/components/ui/` — shared low-level UI primitives
- `src/ai/` — AI settings, models, prompts, tools, and AI clients
- `src/hooks/` — shared React hooks
- `src/lib/` — application logic, DuckDB/runtime code, project/workspace stores, SQL helpers
- `src/features/` — feature-specific modules
- `src/themes/` — theme definitions
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
- Follow existing design language and shared components before adding new primitives.
- Prefer accessible Radix UI primitives and semantic HTML.
- Biome a11y rules are warnings; still address accessibility issues when touching related UI.
- Keep client/browser-only APIs behind guards such as `typeof window !== "undefined"` when needed.
- Do not introduce server-only assumptions; this is a browser-first Vite app.

## DuckDB and SQL runtime guidance

Pondview supports multiple SQL backends:

- `duckdb-wasm` for browser-local execution
- `duckdb-http` for remote DuckDB HTTP execution
- `bridge` for the Pondview bridge runtime

When changing SQL execution, dashboard execution, source attachment, or materialization code:

- Check behavior across all relevant backends.
- Avoid backend-specific SQL unless guarded or adapted in the appropriate runtime layer.
- Preserve DuckDB WASM as the local fallback path.
- Add or update tests for SQL transformation, materialization, runtime selection, and backend-specific behavior.
- Consult existing docs in `docs-site/introduction/` and `docs-site/guide/` when behavior changes.

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
- `docs-site/introduction/sql-runtime-backends.md`
- `docs-site/introduction/connected-data-sources.md`
- `docs-site/introduction/ai-provider-configuration.md`
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

## Pull request hygiene

When preparing a change:

1. Keep the diff focused on the requested task.
2. Update or add tests for changed behavior.
3. Update docs if user-facing behavior changes.
4. Run the relevant checks.
5. Summarize what changed, how it was tested, and any follow-up risks.
