# Git-Backed Project Artifacts

This document defines a repository-backed artifact format for Pondview projects
and the target persistence architecture it supports.

The goal is to make reusable BI assets reviewable in Git without storing data,
cached query results, or environment-specific runtime state in the repository.

## Summary

Git-backed project artifacts are intended for authored project state:

- reusable dashboards
- shared SQL queries
- shared SQL views, represented under `queries/` in v1
- published analysis notebooks

Git-backed project artifacts are not intended for:

- raw data
- DuckDB database files
- query result rows
- transient notebook execution output
- chat transcripts
- API keys, connection secrets, or local runtime settings

The target architecture is:

- Project representation is the canonical source of truth for authored assets.
- DuckDB is a runtime store, cache, execution surface, and snapshot container.
- Snapshot artifacts are separate portable runtime exports, not Git-tracked
  project source.

During the transition, live editing still happens in the current workspace
model:

- dashboards live in DuckDB metadata
- notebooks, chats, and preferences live in browser storage
- data lives in DuckDB and other connected sources

In v1, authored dashboards, queries, views, and notebooks should be treated as
project assets by default. During the transition, the runtime and browser
workspace models may still be the immediate write surface, but the product
should not make users choose whether an authored asset is part of the project.
Over time, project artifacts should become the canonical authored
representation that the runtime model can hydrate from or rebuild.

See also:

- [Git-Backed Project Artifacts Checklist](/introduction/git-backed-project-artifacts-checklist)

## Goals

- Store reusable analytics definitions as text files that diff cleanly.
- Separate logical source references from environment-specific bindings.
- Treat authored dashboards, queries, views, and notebooks as project assets by
  default.
- Make dashboards, shared queries, and curated notebooks portable across
  environments.
- Keep the format close to the existing runtime model where practical.
- Establish project files as the target canonical source for authored assets.
- Keep DuckDB useful as a rebuildable runtime and portable snapshot container.

## Non-goals

- Version raw data in Git.
- Replace the live DuckDB or browser-backed workspace state in the first
  implementation slice.
- Preserve full chat or tool-call transcripts in Git.
- Store execution metadata such as runtime aliases, cache ids, snapshot ids, or
  result rows in Git.

## Three-Layer Persistence Model

Pondview should move toward a three-layer persistence model.

### Project model

The project model is the canonical, Git-friendly, editable source for authored
work.

It includes:

- dashboards
- charts and tables
- metric cards
- measures
- joins
- slicers
- shared queries
- shared views under `queries/`
- published notebooks
- metadata and layout

It excludes data rows, execution caches, runtime aliases, transient notebook
payloads, and local connection details.

### Runtime model

The runtime model is the live DuckDB/browser-backed state used for interaction
and execution.

It can contain:

- DuckDB metadata tables used by the current app
- execution aliases such as `pondview_exec.*`
- dashboard cache tables
- dashboard source-cache metadata
- materialized intermediate state
- local browser workspace state

Runtime state should be treated as disposable and rebuildable from the project
model plus local source bindings whenever possible.

### Snapshot artifact

A snapshot artifact is a portable `.duckdb` runtime export for exact
reproducibility, offline handoff, or debugging.

Snapshot artifacts are useful because they can preserve a frozen runtime state
in one file. They are not a replacement for project artifacts because they are
binary, hard to diff, hard to merge, and can mix authored state with materialized
runtime state.

Snapshot artifacts are not stored in Git by default.

## Terminology

### Artifact

A Git-backed file or directory that represents a reusable project asset such as
a dashboard, query, or notebook.

### Project root

The `pondview/` directory that contains all Git-backed project artifacts.

### Source reference

A stable logical identifier such as `analytics` or `warehouse`. Artifacts store
`sourceRef` values instead of raw `dbIdentifier` values.

### Local binding

A gitignored mapping from a `sourceRef` to an actual local runtime target such
as a backend, `dbIdentifier`, and optional `catalogContext`.

## Repository Layout

The v1 repository layout is:

```text
pondview/
  project.json
  sources/
    registry.json
  dashboards/
    <dashboard-id>/
      dashboard.json
      joins.json
      measures/
        <measure-id>.sql
        <measure-id>.measure.json
      visuals/
        <visual-id>.sql
        <visual-id>.visual.json
  queries/
    <group>/
      <query-id>.sql
      <query-id>.query.json
  notebooks/
    <notebook-id>/
      notebook.json
      cells/
        <cell-id>.md
        <cell-id>.sql
        <cell-id>.visual.json

pondview.sources.local.json
```

`pondview.sources.local.json` is not committed. It is a local binding file and
must be gitignored.

## Common Rules

These rules apply to every Git-backed artifact in v1.

### Encoding and formatting

- Text files must be UTF-8 with LF line endings.
- JSON files must use two-space indentation and a trailing newline.
- SQL files must be stored as plain `.sql` text.
- Markdown notebook text files must be stored as plain `.md` text.

### IDs

- Artifact ids must be stable, lowercase, kebab-case strings.
- Generated runtime ids such as `nanoid()` values must not be exported to Git.
- Renaming an artifact display title must not require changing its id.

### Deterministic serialization

- Export must omit timestamps and storage metadata.
- Export must sort object keys consistently.
- Export must preserve user-meaningful order only where order matters:
  dashboard visuals, notebook cells, and slicers.
- Arrays that are logically sets should be sorted during export to reduce diff
  noise.

### Versioning

- Every manifest JSON file must include `"schemaVersion": 1`.
- Future breaking changes must increment `schemaVersion`.

### Environment independence

- Git-backed artifacts must not store secrets.
- Git-backed artifacts must not store raw `dbIdentifier` values.
- Git-backed artifacts should prefer `sourceRef` over backend-specific routing
  details.

## Project Manifest

`pondview/project.json` declares project-level metadata.

### File

`pondview/project.json`

### Shape

```json
{
  "schemaVersion": 1,
  "name": "Revenue Analytics",
  "defaultSourceRef": "analytics",
  "description": "Shared BI assets for the revenue team"
}
```

### Fields

- `schemaVersion`: required integer, must be `1`
- `name`: required string
- `defaultSourceRef`: optional string, defaults to no project default
- `description`: optional string

## Source Registry

The source registry defines logical source ids that artifacts can reference.

### Tracked source registry

File:

`pondview/sources/registry.json`

Example:

```json
{
  "schemaVersion": 1,
  "sources": [
    {
      "id": "analytics",
      "kind": "runtime",
      "description": "Primary analytics runtime"
    },
    {
      "id": "warehouse",
      "kind": "external",
      "externalType": "postgres",
      "description": "Primary warehouse source"
    }
  ]
}
```

Fields:

- `id`: required stable source reference
- `kind`: required, one of `runtime`, `motherduck`, `external`
- `externalType`: required when `kind` is `external`; one of `postgres`,
  `mysql`, `sqlite`
- `description`: optional string

### Local source bindings

File:

`pondview.sources.local.json`

This file is local-only and must not be committed.

Example:

```json
{
  "schemaVersion": 1,
  "bindings": {
    "analytics": {
      "runtimeBackend": "duckdb-http",
      "dbIdentifier": null,
      "catalogContext": "main"
    },
    "warehouse": {
      "runtimeBackend": "duckdb-http",
      "dbIdentifier": "postgres://analytics@warehouse/app",
      "catalogContext": "public"
    }
  }
}
```

Fields:

- `runtimeBackend`: one of `duckdb-wasm`, `duckdb-http`, `bridge`
- `dbIdentifier`: nullable string
- `catalogContext`: nullable string

Import into a live workspace requires local bindings for every referenced
`sourceRef`. Missing bindings are a runtime import error, not a Git artifact
validation error.

## Dashboard Artifact Spec

Dashboards are the highest-value Git-backed artifact type and should be treated
as the primary reviewable BI asset.

### Dashboard directory layout

```text
pondview/dashboards/<dashboard-id>/
  dashboard.json
  joins.json
  measures/
    <measure-id>.sql
    <measure-id>.measure.json
  visuals/
    <visual-id>.sql
    <visual-id>.visual.json
```

### Dashboard manifest

File:

`pondview/dashboards/<dashboard-id>/dashboard.json`

Example:

```json
{
  "schemaVersion": 1,
  "id": "revenue-overview",
  "title": "Revenue Overview",
  "description": "Executive revenue dashboard",
  "columns": 3,
  "autoFitRows": false,
  "sourceRef": "analytics",
  "joinsFile": "joins.json",
  "slicers": [
    {
      "id": "order-date",
      "field": "order_date",
      "title": "Order Date",
      "limit": 50
    }
  ],
  "measures": [
    {
      "id": "total-revenue",
      "metadataFile": "measures/total-revenue.measure.json",
      "sqlFile": "measures/total-revenue.sql"
    }
  ],
  "visuals": [
    {
      "id": "monthly-revenue",
      "metadataFile": "visuals/monthly-revenue.visual.json",
      "sqlFile": "visuals/monthly-revenue.sql"
    }
  ]
}
```

### Dashboard manifest fields

- `schemaVersion`: required integer, must be `1`
- `id`: required dashboard id
- `title`: required string
- `description`: optional string
- `columns`: optional integer, defaults to `3`
- `autoFitRows`: optional boolean, defaults to `false`
- `sourceRef`: optional string; used as the default source for child artifacts
- `joinsFile`: optional string, typically `joins.json`
- `slicers`: ordered array of dashboard slicers
- `measures`: ordered array of measure references
- `visuals`: ordered array of visual references

### Dashboard slicer shape

Each entry in `dashboard.json.slicers` has the shape:

```json
{
  "id": "order-date",
  "field": "order_date",
  "title": "Order Date",
  "limit": 50
}
```

Fields:

- `id`: optional stable slicer id
- `field`: required field name
- `title`: optional display title
- `limit`: optional integer, defaults to `50`

### Dashboard joins

File:

`pondview/dashboards/<dashboard-id>/joins.json`

Shape:

```json
{
  "schemaVersion": 1,
  "joins": [
    {
      "leftTable": "orders",
      "leftColumn": "customer_id",
      "rightTable": "customers",
      "rightColumn": "id",
      "type": "left"
    }
  ]
}
```

The join item shape matches the current runtime `JoinDefinition` model.

Export must sort joins by:

1. `leftTable`
2. `leftColumn`
3. `rightTable`
4. `rightColumn`
5. `type`

### Dashboard measures

Measures support reusable metric cards and shared KPI definitions.

Metadata file:

`pondview/dashboards/<dashboard-id>/measures/<measure-id>.measure.json`

SQL file:

`pondview/dashboards/<dashboard-id>/measures/<measure-id>.sql`

Metadata example:

```json
{
  "schemaVersion": 1,
  "id": "total-revenue",
  "key": "total_revenue",
  "label": "Total Revenue",
  "description": "Reusable total revenue KPI",
  "sourceRef": "analytics",
  "catalogContext": "main"
}
```

Measure metadata fields:

- `schemaVersion`: required integer, must be `1`
- `id`: required stable measure id
- `key`: required stable token-like key
- `label`: required display label
- `description`: optional string
- `sourceRef`: optional string, falls back to dashboard `sourceRef`
- `catalogContext`: optional string

The SQL file contains canonical measure SQL only.

Measure exports must not include:

- `createdAt`
- `updatedAt`
- `snapshotId`
- `dbIdentifier`
- `sqlBackend`
- runtime cache or storage metadata

### Dashboard visuals

Visuals represent ordered chart, table, or metric-card items on the dashboard.

Metadata file:

`pondview/dashboards/<dashboard-id>/visuals/<visual-id>.visual.json`

SQL file:

`pondview/dashboards/<dashboard-id>/visuals/<visual-id>.sql`

Metadata example for a chart:

```json
{
  "schemaVersion": 1,
  "id": "monthly-revenue",
  "sourceRef": "analytics",
  "catalogContext": "main",
  "config": {
    "visualType": "chart",
    "type": "line",
    "title": "Monthly Revenue",
    "description": "Revenue trend by month",
    "xKey": "month",
    "yKeys": ["revenue"],
    "legend": false,
    "multipleLines": false
  }
}
```

Metadata example for a metric card:

```json
{
  "schemaVersion": 1,
  "id": "total-revenue-card",
  "sourceRef": "analytics",
  "config": {
    "configType": "card",
    "measureId": "total-revenue",
    "title": "Total Revenue",
    "description": "Current total revenue"
  }
}
```

Visual metadata fields:

- `schemaVersion`: required integer, must be `1`
- `id`: required stable visual id
- `sourceRef`: optional string, falls back to dashboard `sourceRef`
- `catalogContext`: optional string
- `config`: required visualization config object

`config` must be one of:

- chart config
- table config
- card config

The structure of `config` is intentionally aligned with the current app config
objects:

- chart config mirrors the current chart `Config`
- table config mirrors the current `TableConfig`
- card config mirrors the current `CardConfig`

The SQL file contains canonical source SQL only.

Card visuals may reference a reusable measure via `config.measureId`.

Visual exports must not include:

- `position`
- `createdAt`
- `updatedAt`
- `snapshotId`
- `dbIdentifier`
- `sqlBackend`
- `semanticQueryJson`
- `exploreName`
- runtime execution state

Visual order is defined by the `dashboard.json.visuals` array, not by a field
inside each visual file.

### Dashboard export rules

When exporting a live dashboard to Git:

- convert runtime-specific source descriptor data into `sourceRef`
- keep canonical SQL only
- omit runtime aliases, snapshot schema names, and storage status
- keep user-authored visualization config
- write measures and visuals as separate files for cleaner diffs

### Dashboard import rules

When importing a dashboard from Git into the live workspace:

- resolve `sourceRef` through local bindings
- create or update dashboard, measures, slicers, joins, and visuals
- preserve dashboard visual order from `dashboard.json`
- preserve canonical SQL and visualization config
- clear stale dashboard cache and `pondview.dashboard_snapshots` rows for the
  imported dashboard so runtime snapshots remain rebuildable metadata

## Shared Query And View Artifact Spec

Shared queries are the Git-backed form of reusable saved SQL queries.

Shared views also live under `queries/` in v1. A view is represented as a query
artifact whose SQL is intended to create or define a reusable relation.

Queries and views are intended for reusable project assets. One-off scratch SQL
may stay inside the SQL editor session, but saved/named queries should be
project assets by default.

### Query directory layout

```text
pondview/queries/<group>/
  <query-id>.sql
  <query-id>.query.json
```

### Query metadata

Metadata file:

`pondview/queries/<group>/<query-id>.query.json`

SQL file:

`pondview/queries/<group>/<query-id>.sql`

Example:

```json
{
  "schemaVersion": 1,
  "id": "monthly-revenue",
  "name": "Monthly Revenue",
  "kind": "query",
  "description": "Reusable monthly revenue rollup",
  "sourceRef": "analytics",
  "catalogContext": "main",
  "tags": ["finance", "revenue", "monthly"]
}
```

Fields:

- `schemaVersion`: required integer, must be `1`
- `id`: required stable query id
- `name`: required display name
- `kind`: optional, one of `query`, `view`; defaults to `query`
- `description`: optional string
- `sourceRef`: optional string, falls back to project default if present
- `catalogContext`: optional string
- `tags`: optional string array

Query and view exports must not include:

- `createdAt`
- `updatedAt`
- generated saved-query ids from local workspace storage

### Query and view import/export rules

- Exported SQL must be trimmed canonical SQL.
- Queries imported from existing saved-query storage should receive a stable
  slug-based `id`.
- Views should initially use the same metadata shape and directory layout as
  queries, with `kind: "view"`.
- Import should create or update the project query or view entry with stable
  project metadata such as `kind`, `sourceRef`, `catalogContext`, tags, and the
  original project path.

## Published Notebook Artifact Spec

Git-backed notebooks are curated analysis recipes, not full execution logs.

They exist to capture reusable analysis structure:

- narrative context
- prompts
- SQL
- optional preferred visual config

They do not capture live transcript or result payload state.

### Notebook directory layout

```text
pondview/notebooks/<notebook-id>/
  notebook.json
  cells/
    <cell-id>.md
    <cell-id>.sql
    <cell-id>.visual.json
```

### Notebook manifest

File:

`pondview/notebooks/<notebook-id>/notebook.json`

Example:

```json
{
  "schemaVersion": 1,
  "id": "pricing-review",
  "title": "Pricing Review",
  "description": "Published notebook for recurring pricing analysis",
  "cells": [
    {
      "id": "context",
      "kind": "text",
      "file": "cells/context.md"
    },
    {
      "id": "question",
      "kind": "ai",
      "file": "cells/question.md",
      "sourceRef": "analytics"
    },
    {
      "id": "revenue-check",
      "kind": "sql",
      "file": "cells/revenue-check.sql",
      "visualFile": "cells/revenue-check.visual.json",
      "sourceRef": "analytics",
      "catalogContext": "main"
    }
  ]
}
```

Notebook manifest fields:

- `schemaVersion`: required integer, must be `1`
- `id`: required stable notebook id
- `title`: required string
- `description`: optional string
- `cells`: required ordered array

Cell entry fields:

- `id`: required stable cell id
- `kind`: required, one of `text`, `ai`, `sql`
- `file`: required path to the primary cell content file
- `visualFile`: optional path to a visualization config file, valid only for
  `sql` cells in v1
- `sourceRef`: optional string
- `catalogContext`: optional string

### Notebook cell files

`text` and `ai` cells store their authored content as Markdown in `.md` files.

`sql` cells store canonical SQL in `.sql` files.

Optional SQL cell visual files store a single visualization config object:

- chart config
- table config
- card config

### Notebook export rules

Exporting a live notebook to Git must keep authored intent and omit cached
execution state.

Notebook exports must keep:

- title
- ordered cells
- cell kind
- `promptText`
- `sqlDraft`
- optional chosen visual config
- logical `sourceRef`

Notebook exports must omit:

- `status`
- `lastRunAt`
- `resultPayloadJson`
- query result rows and columns
- execution time
- raw `partsJson`
- assistant transcripts
- tool-call history
- generated runtime ids and timestamps

### Notebook import rules

Importing a notebook from Git into the live workspace creates a published
notebook scaffold:

- text cells hydrate `promptText`
- ai cells hydrate `promptText`
- sql cells hydrate `sqlDraft`
- optional SQL cell visual config becomes the preferred starting config

Running the notebook after import creates live result state in the existing
workspace persistence layer, not in Git.

## What Must Not Be Stored In Git

The following state is explicitly excluded from Git-backed artifacts:

- raw data rows
- DuckDB database files
- uploaded file blobs
- chat history
- assistant messages
- tool-call transcripts
- dashboard execution aliases
- dashboard snapshot ids and `dashboard_snapshots` runtime metadata
- dashboard source-cache metadata
- `createdAt` and `updatedAt` timestamps
- local storage keys
- API keys and secrets
- exact runtime connection identifiers

## Snapshot Artifact Workflow

Snapshot artifacts are non-Git `.duckdb` exports for reproducibility and
handoff.

The intended snapshot workflow is:

1. Hydrate or build live runtime state from project artifacts and local source
   bindings.
2. Execute or materialize the state needed for a reproducible handoff.
3. Export a `.duckdb` snapshot as a portable runtime artifact.
4. Import the snapshot later when exact frozen state matters more than clean
   Git history.

Snapshot artifacts may include runtime metadata, materialized tables, caches,
and frozen execution state. They should not become the canonical source for
authored dashboard, query, view, or notebook definitions.

`pondview.dashboard_snapshots` should be treated as runtime/snapshot metadata,
not project source. A project artifact may reference the idea of a snapshot in a
future feature, but it must not store snapshot ids or snapshot-specific runtime
schemas in Git.

## Automatic Project Asset Workflow

The v1 product workflow is:

1. Create or edit dashboards, saved queries, views, and notebooks in the normal
   product surfaces.
2. Treat those authored assets as project assets automatically.
3. Persist project files through the active project backing store when project
   file writing is available.
4. Use runtime/browser storage only as the live editing and execution cache
   during the transition.
5. Import project assets into another workspace using local source bindings.

The v1 UI should avoid manual promotion controls. Users should not need to
decide whether a notebook, dashboard, saved query, or view is a project asset.
Project artifact terminology should mostly remain in project settings,
validation, import/export, and developer-facing docs.

The target product workflow is:

1. Open a project from Git-backed project artifacts.
2. Hydrate the runtime model from the project model and local source bindings.
3. Save authored changes back to the project model.
4. Use DuckDB as runtime/cache state during execution.
5. Export or import snapshots only when frozen runtime state is needed.

This workflow intentionally separates:

- scratch exploration state
- authored project definitions
- runtime/snapshot state
- data and backup storage

## Validation Rules

A v1 artifact set is valid when all of the following are true:

- every manifest has `schemaVersion: 1`
- every referenced file exists
- every id is unique within its artifact namespace
- every referenced `measureId` in a card visual exists in the same dashboard
- every `sourceRef` exists in `sources/registry.json`
- every SQL file is non-empty after trimming
- notebook cells appear in a stable explicit order in `notebook.json`

Validation should not require local source bindings.

Runtime import validation adds one more requirement:

- every referenced `sourceRef` used during import resolves in
  `pondview.sources.local.json`

## Migration Guidance

The existing app already persists most of the raw ingredients needed for this
format:

- dashboards with canonical SQL and config
- reusable dashboard measures
- saved SQL queries
- reusable SQL views once they are modeled under `queries/`
- notebook prompt text and SQL drafts

The main migration work is normalization:

- replace runtime-specific source descriptors with logical `sourceRef` values
- strip timestamps and storage metadata
- strip notebook result payloads and transcripts
- assign stable slug ids where local storage uses generated ids
- classify `pondview.dashboard_snapshots` as runtime/snapshot metadata
- hydrate runtime DuckDB state from project artifacts during import/open

## Deferred Items

These items are intentionally out of scope for v1:

- Git-backed chat transcripts
- backend-specific SQL dialect metadata
- full round-trip export of every personal workspace artifact
- branch-aware merge tooling inside the app
- treating project files as the only write path for live editing
- first-class view directories separate from `queries/`

v1 should optimize for a small, reviewable, durable artifact surface first.
