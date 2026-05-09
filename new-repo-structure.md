# Pondview Repo Structure Brainstorm

## Recommendation

Use a monorepo, but migrate gradually.

Pondview already has the web app, docs, project artifact format, DuckDB runtime
concepts, and soon a bridge protocol. Keeping those in one repository should
make it easier to evolve the frontend, CLI bridge, project export format, and
shared API contracts together.

The important part is avoiding unnecessary churn. The current Vite app does not
need to move immediately.

## Target Shape

Longer term, the repo could look like this:

```text
pondview-ui/
  apps/
    web/                  # current Vite React app
    docs/                 # current docs-site
    bridge/               # CLI + local bridge server
  packages/
    project-format/       # parse/export/validate Pondview project artifacts
    bridge-protocol/      # shared request/response schemas + client
    duckdb-runtime/       # shared DuckDB attach/catalog/query helpers
    config/               # shared TS/Biome/Vite/build config if useful
  scripts/
  public/
  package.json
  bun.lock
  biome.json
  tsconfig.json
```

This is a clean final architecture, but moving the frontend into `apps/web`
right away would create a lot of import/build churn before the bridge is proven.

## Recommended First Step

Start with a light monorepo structure while keeping the current web app in
place:

```text
pondview-ui/
  src/                    # current web app stays here for now
  docs-site/
  packages/
    bridge/               # new CLI package
    bridge-protocol/      # shared API types/schemas
  scripts/
  package.json
  bun.lock
```

Suggested initial bridge package:

```text
packages/
  bridge/
    src/
      cli.ts
      server.ts
      routes/
      runtime/
      sources/
      projects/
      config/
    package.json
    tsconfig.json

  bridge-protocol/
    src/
      schemas.ts
      client.ts
      types.ts
    package.json
    tsconfig.json
```

## Later Extractions

Extract project archive/artifact logic after the bridge actually needs it:

```text
packages/
  project-format/
    src/
      archive.ts
      artifacts.ts
      bindings.ts
      schemas.ts
```

Candidate source files for future extraction include the existing project
transfer and artifact parse/hydrate/import/export logic.

Avoid extracting too early. Let the bridge use local imports or a narrow shared
protocol package first, then promote stable logic into `project-format`.

## Why Monorepo

- Keeps bridge protocol types synchronized with the web app.
- Keeps exported project format changes coordinated across app and CLI.
- Makes local development easier with one Bun workspace and lockfile.
- Lets shared validation schemas live in one place.
- Reduces version drift between frontend, bridge, docs, and project tooling.

## Migration Order

1. Add Bun workspaces for `packages/*`.
2. Add `packages/bridge-protocol` with shared schemas/types.
3. Add `packages/bridge` with CLI/server skeleton.
4. Connect the existing web app to `bridge-protocol`.
5. Add project inspection/serving to the bridge.
6. Extract `project-format` once project logic is stable.
7. Move `docs-site` to `apps/docs` only if it becomes helpful.
8. Move the current app to `apps/web` only when the repo naturally wants that
   final shape.

## Principle

Make the repo a monorepo now, but do not make a big-bang restructure. Add the
bridge packages first, keep the current app stable, and let the final `apps/`
layout emerge once there is enough code to justify it.

