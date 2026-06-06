# Workspace Persistence

Pondview stores user state in a few different places depending on what kind of data is being persisted.

## Storage Architecture

### IndexedDB workspace database

The browser workspace database stores app-local state such as chat history, preferences, and uploaded file blobs.

- DB name: `pondview-workspace`
- Current version: see `WORKSPACE_DB_VERSION` in `src/lib/workspace/workspace-db.ts`
- Stores:
  - `chats`
  - `messages`
  - `preferences`
  - `uploadedFileBlobs`

Dashboards, charts, measures, and slicers are no longer stored as IndexedDB object stores.

Access is centralized in `src/lib/workspace/workspace-db.ts`.

### DuckDB metadata schema

Dashboard metadata now lives in the DuckDB metadata schema `pondview`.

That schema stores:

- dashboards
- dashboard charts
- dashboard measures
- dashboard slicers
- chart slicers
- dashboard join definitions
- dashboard source-cache metadata
- dashboard snapshot metadata

Access is centralized in `src/lib/dashboard/dashboard-storage-service.ts`.

### Local/session storage

Examples of browser storage keys outside IndexedDB:

- AI settings (`AI_PROVIDER`, `AI_MODEL`, provider API key keys)
- SQL backend preference (`bi.sql.backend.preference`)
- Connected sources (`connectedTables`)
- Uploaded file metadata (`uploadedFiles`)
- Dashboard join defs (`bi.dashboard.joinDefs.v1`)

When Bridge is the active runtime, data-source credentials, AI provider keys, and S3 backup access keys are stored outside browser storage in the Bridge secret store at `${XDG_CONFIG_HOME:-~/.config}/pondview/secrets.json` unless `PONDVIEW_SECRETS_PATH` overrides it. Browser storage keeps only non-secret metadata and opaque references.

Bridge also provides a filesystem-backed project store. By default it writes raw Pondview artifact files under the directory where the bridge was launched, or under `--project-dir <dir>` when that flag is provided. Existing disk artifacts are loaded into the app first; later dashboard, saved-query, and published-notebook changes update files such as `pondview/...` directly on disk. The project metadata file is `.pondview/project.json`; DuckDB runtime data remains separate in the bridge database or explicit runtime snapshot exports.

## Dashboard Persistence Model

Saved charts and measures persist:

- canonical `source_sql`
- `source_descriptor_json`
- optional `snapshot_id`
- visualization config JSON

They do not persist runtime-rewritten SQL, alias names, or save-time snapshot SQL.

Dashboard execution metadata such as runtime aliases belongs to execution-time planning rather than to the stored dashboard records.

## Repository Split

There are two main browser-side persistence layers involved in normal app usage:

- `src/lib/workspace/*` for IndexedDB-backed workspace state
- `src/lib/dashboard/*` for DuckDB-backed dashboard metadata and execution planning

The dashboard repository (`src/lib/workspace/dashboard-repo.ts`) is now a thin browser-side facade over the DuckDB metadata service.

## Export / Import / Reset Behavior

Settings page offers:

- **Export Workspace**
- **Import Workspace**
- **Reset Workspace**

The workspace export format includes dashboard entities alongside chat state, but storage is not symmetrical under the hood:

- chat-like state comes from IndexedDB
- dashboard-like state comes from the DuckDB metadata schema

### What export includes

- chats/messages
- dashboards/charts/measures
- dashboard/chart slicers
- preferences

### What export does not include

- `uploadedFileBlobs` binary payloads
- local storage/session storage feature keys

After import/reset, the app reloads to rehydrate state.

## Compatibility Notes

- Dashboard metadata is intentionally treated as a clean-start schema.
- The current dashboard runtime expects canonical source descriptors on saved charts and measures.
- If the persistence model changes again, update:
  - `src/lib/workspace/workspace-db.ts`
  - `src/lib/workspace/export-import.ts`
  - `src/lib/dashboard/dashboard-storage-service.ts`
  - this document
