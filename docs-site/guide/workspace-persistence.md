# Workspace Persistence

BI Chat stores most user state locally in the browser. The core workspace database is IndexedDB, while feature-specific settings also use local storage/session storage.

## Storage architecture

### IndexedDB workspace database

- DB name: `pondview-workspace`
- Version: `2`
- Stores:
  - `chats`
  - `messages`
  - `dashboards`
  - `charts`
  - `dashboardSlicers`
  - `chartSlicers`
  - `preferences`
  - `uploadedFileBlobs`

Access is centralized in `src/lib/workspace/workspace-db.ts`.

### Local/session storage (feature settings)

Examples of browser storage keys outside IndexedDB:

- AI settings (`AI_PROVIDER`, `AI_MODEL`, provider API key keys)
- SQL backend preference (`bi.sql.backend.preference`)
- DuckDB HTTP config (`bi.duckdb.http.config`)
- Connected sources (`connectedTables`)
- Uploaded file metadata (`uploadedFiles`)
- Dashboard join defs (`bi.dashboard.joinDefs.v1`)

## Repository split: browser vs server

There are two persistence layers in the codebase:

- Browser repositories (`src/lib/workspace/*-repo.ts`) for app-local state.
- Server repositories (`src/lib/repositories/*.ts`) used by the remaining server-side dashboard/chart APIs.

Server repositories store JSON sidecar files on disk; browser repositories store in IndexedDB.

## Export / import / reset behavior

Settings page offers:

- **Export Workspace** -> builds `WorkspaceExportV1` JSON (`pondview-workspace-v1.json`)
- **Import Workspace** -> validates and restores `WorkspaceExportV1`
- **Reset Workspace** -> clears workspace DB stores

### What export includes

- chats/messages
- dashboards/charts
- dashboard/chart slicers
- preferences

### What export does not include

- `uploadedFileBlobs` binary payloads
- local storage/session storage feature keys

After import/reset, the app reloads to rehydrate state.

## Import format and compatibility

- `validateWorkspaceImport(...)` requires `version === 1`
- Import expects top-level arrays for each exported collection
- Unsupported versions are rejected

If schema evolves, update both `WorkspaceExportV1` and validation/migration logic together.
