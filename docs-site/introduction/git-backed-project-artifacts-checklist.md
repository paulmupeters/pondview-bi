# Git-Backed Project Artifacts Checklist

This checklist translates the Git-backed project artifact spec into concrete
implementation phases.

## Phase 1: Core format and export foundations

- [x] Write the v1 repository-backed artifact spec
- [x] Define the v1 implementation checklist
- [x] Add TypeScript schemas for project manifests, source registries,
  dashboards, queries, and published notebooks
- [x] Add deterministic export helpers for dashboards
- [x] Add deterministic export helpers for shared SQL queries
- [x] Add deterministic export helpers for published notebooks
- [x] Add tests for serialization and exclusion rules

## Phase 2: Dashboard promotion flow

- [ ] Add a dashboard-to-project exporter that loads dashboard entities from the
  live workspace
- [ ] Resolve runtime source descriptors to logical `sourceRef` values during
  export
- [ ] Export dashboard visuals, measures, joins, and slicers into the project
  file layout
- [ ] Add validation errors for missing source mappings and invalid visual
  config JSON
- [ ] Add a UI action to promote a live dashboard into project artifacts

## Phase 3: Shared query promotion flow

- [ ] Add a query-to-project exporter for shared SQL query artifacts
- [ ] Add support for query grouping, tags, and optional descriptions
- [ ] Add a UI action to promote saved SQL queries into project artifacts
- [ ] Keep personal local saved queries separate from repo-backed shared queries

## Phase 4: Published notebook promotion flow

- [ ] Add a notebook-to-project exporter for curated notebook artifacts
- [ ] Strip notebook execution state from exports
- [ ] Export authored prompts, SQL drafts, and selected visual config only
- [ ] Add a UI action to promote a notebook into project artifacts

## Phase 5: Import path and source bindings

- [ ] Add parsers and validators for committed project artifact files
- [ ] Add support for local `pondview.sources.local.json` source bindings
- [ ] Add import flows for dashboards, shared queries, and published notebooks
- [ ] Create or update live workspace entities from imported artifacts

## Phase 6: Product integration

- [ ] Add a `Promote to Project` flow in the product UI
- [ ] Add an `Import from Project` flow in the product UI
- [ ] Add conflict handling for existing dashboards, queries, and notebooks
- [ ] Add docs for source binding setup and round-trip workflows
- [ ] Decide how project files are written from browser environments
