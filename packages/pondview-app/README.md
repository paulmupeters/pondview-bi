# @pondview/app

The main Pondview web application: a Vite + React workspace for browser-local DuckDB analysis, AI-assisted SQL, charts, and dashboards.

Most product behavior is documented in [`../pondview-docs`](../pondview-docs/index.md); keep this README focused on package development.

## Run

From the repository root:

```bash
bun dev
bun run build
bun run preview
```

Or from this package:

```bash
bun run --cwd packages/pondview-app dev
```

## Check

```bash
bun run typecheck
bun run lint
bun run test
```

For focused tests, run `bun test` with the specific `*.test.ts` or `*.test.tsx` file.

## Notes

- Source lives in `src/`.
- Shared UI primitives live in `src/components/ui/`.
- DuckDB/runtime code lives in `src/lib/`.
- AI configuration and tools live in `src/ai/`.
- Use `.env.local` only for integrations you need; start from [`../../env.local.example`](../../env.local.example).
