# Git-Backed Project Artifacts Checklist

This checklist translates the Git-backed project artifact spec into concrete
implementation phases.

## Phase 1: Core format and export foundations

- [x] Write the v1 repository-backed artifact spec
- [x] Define the v1 implementation checklist
- [x] Document the target three-layer persistence model
- [x] Add TypeScript schemas for project manifests, source registries,
      dashboards, queries, and published notebooks
- [x] Add deterministic export helpers for dashboards
- [x] Add deterministic export helpers for shared SQL queries
- [x] Add deterministic export helpers for published notebooks
- [x] Add tests for serialization and exclusion rules

## Phase 2: Project model export flow

- [x] Add a dashboard-to-project exporter that loads dashboard entities from the
      live workspace
- [x] Resolve runtime source descriptors to logical `sourceRef` values during
      export
- [x] Export dashboard visuals, measures, joins, and slicers into the project
      file layout
- [x] Add validation errors for missing source mappings and invalid visual
      config JSON
- [x] Treat dashboards as project assets by default in the product model

## Phase 3: Shared query and view project flow

- [x] Add a query-to-project exporter for shared SQL query artifacts
- [x] Add support for query grouping, tags, and optional descriptions
- [x] Represent reusable SQL views under `queries/` with `kind: "view"`
- [x] Treat saved/named SQL queries as project assets by default
- [x] Keep draft SQL editor sessions separate from saved project queries

## Phase 4: Published notebook project flow

- [x] Add a notebook-to-project exporter for curated notebook artifacts
- [x] Strip notebook execution state from exports
- [x] Export authored prompts, SQL drafts, and selected visual config only
- [x] Treat notebooks as project assets by default in the product model

## Phase 5: Import path and source bindings

- [x] Add parsers and validators for committed project artifact files
- [x] Add support for local `pondview.sources.local.json` source bindings
- [x] Add hydration mappers for dashboards, shared queries, and published
      notebooks
- [x] Add import flows for dashboards, shared queries, and published notebooks
- [x] Create or update live workspace entities from imported artifacts
- [~] Hydrate runtime DuckDB/browser state from project artifacts
      Project open/import now hydrates runtime source defaults and backend
      preference from `defaultSourceRef` plus local bindings, while cache,
      snapshot, and materialized DuckDB state remain separate runtime concerns.
- [x] Ensure `pondview.dashboard_snapshots` is treated as runtime/snapshot
      metadata, not project source

## Phase 6: Snapshot artifact flow

- [x] Define a non-Git `.duckdb` snapshot export/import model
- [~] Decide which runtime schemas and metadata belong in snapshots
      The v1 browser flow snapshots the whole local DuckDB WASM database file,
      including runtime metadata and materialized state. Remote Bridge and
      Bridge runtime snapshot scoping remains future work.
- [x] Add `Export Snapshot` and `Import Snapshot` product flows
- [x] Document that snapshots are portable runtime artifacts, not canonical
      authored project source
- [x] Keep snapshot files out of Git by default

## Phase 7: Canonical project integration

- [~] Add an `Import from Project` flow in the product UI
- [~] Add `Open Project` and `Save Project` semantics
      Browser-local project archives now round-trip as `.zip` exports with the
      tracked `pondview/...` file tree plus hidden project metadata, while
      live conflict reconciliation and real filesystem/Git integration remain
      future phases.
- [x] Add automatic project file writes for authored assets when a project is
      open
- [x] Add conflict handling for existing dashboards, queries, and notebooks
- [x] Add docs for source binding setup and round-trip workflows
- [x] Decide how project files are written from browser environments
- [ ] Move toward project files as the canonical write path for authored assets
