# Sharing Projects and Dashboards

Pondview currently supports portable project files and a shared Bridge runtime.
It does not yet provide hosted public dashboard links, user invitations, roles,
access-control lists, or concurrent editing.

## Where dashboard state lives

Dashboard metadata is stored in the active DuckDB runtime and is also
synchronized to project artifact files.

| Setup | Dashboard metadata | Project artifacts | Who can see it |
| --- | --- | --- | --- |
| Hosted app or local app using DuckDB WASM | Browser-local DuckDB | Browser IndexedDB | Only that browser profile, unless the project is exported |
| Bridge-backed filesystem project | Bridge DuckDB runtime | Files under the Bridge project directory | Clients connected to the same Bridge and project |

Bridge dashboard storage is shared, but the rest of the browser workspace is
not. Chats, message history, local preferences, uploads, and browser project
sessions remain in IndexedDB for each browser profile. Bridge gives each project
its own browser workspace database name, but that database still lives in the
browser.

## Share a `.pondview` project

In **Settings**, use **Share Project...** to download a `.pondview` file. Send
that one file to the recipient. They can visit
[`app.pondview.app/open`](https://app.pondview.app/open), choose the file, review
its contents and warnings, and approve opening it locally. The recipient does
not need the Pondview CLI, a Bridge, or a deployment of their own.

A `.pondview` file is a ZIP-based package. Existing Pondview ZIP exports and
legacy JSON project bundles can also be opened.

Project artifacts include:

- Dashboard definitions, layouts, SQL, visual configuration, measures, slicers,
  and joins
- Saved SQL queries belonging to the shared project
- Published notebook prompts or text, SQL cells, and visual configuration
- Project and source-reference metadata needed to associate the artifacts

They do not include the complete browser workspace. In particular, the archive
does not transfer:

- Chat and AI response history
- Unsaved SQL editor drafts
- Browser uploads and their stored blobs
- Browser preferences and project-session state
- Browser AI settings, API keys, or the Bridge secret store
- The underlying source data, caches, or materialized state unless a runtime
  snapshot is included

Portable exports remove source connection configuration, Bridge bindings,
custom setup SQL, and credential-bearing connection fields. Project SQL still
comes from the file's author, so Pondview shows an explicit approval step before
it imports the package and runs dashboard queries. Do not put credentials
directly in SQL or project files.

### Share a self-contained project

When DuckDB WASM is the active runtime, **Share Project...** can include a
DuckDB snapshot. This makes the package self-contained: on approval, Pondview
imports the snapshot into browser storage, restores the artifacts, switches the
project to DuckDB WASM, and opens the selected entry dashboard.

Opening a package with a snapshot replaces the active local browser database.
The intake screen tells the recipient before this happens. The import stays in
that browser; the package and its data are not uploaded to Pondview.

Bridge-backed projects can still be shared as definitions-only packages, but
they cannot bundle the Bridge database through this flow. Recipients need to
load equivalent data themselves unless the project is first opened or copied
into DuckDB WASM and exported with a snapshot.

For reliability, Pondview rejects unsafe archive paths and applies limits to the
package size, expanded size, and file count before import. Large snapshots also
receive a browser-storage capacity check.

## Share a Bridge dashboard URL

People who can reach the same Bridge can open the same dashboard metadata. The
CLI can open the restricted dashboard interface:

```bash
pondview start --dashboard-mode
pondview dashboard open <dashboard-id>
```

The resulting URL uses `pondviewMode=dashboard`, for example:

```text
http://127.0.0.1:17817/dashboards/view?id=<dashboard-id>&pondviewMode=dashboard
```

Dashboard mode hides authoring navigation and makes dashboard layouts and cards
read-only. It is a user-interface mode, not an authorization boundary. Changing
or removing the query parameter does not grant or revoke API permissions.

By default Bridge binds to `127.0.0.1`, so its URLs only work on the same
machine. Sharing over a network requires an intentionally reachable `--host`
and appropriate network controls. Use Bridge token authentication whenever the
service is exposed beyond localhost. Bridge authentication is one shared token;
it does not provide per-user dashboard permissions.

## Choose a sharing method

- To hand off dashboard and analysis definitions without the CLI, export a
  `.pondview` file and have the recipient open it at `app.pondview.app/open`.
- To hand off definitions and data in one file, use DuckDB WASM and include the
  runtime snapshot.
- To let several clients use the same live dashboards and runtime, connect them
  to the same Bridge project.
- To share a Bridge-backed project without copying its data into DuckDB WASM,
  use a data source the recipients can access or transfer the data separately.

## Related guides

- [Dashboards](/guide/dashboards)
- [Pondview CLI](/guide/cli)
- [Uploads and Browser Storage](/guide/uploads-and-browser-storage)
- [SQL Runtime Backends](/guide/sql-runtime-backends)
