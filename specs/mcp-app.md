# Spec: Pondview as an MCP App (Claude-first, ChatGPT-ready)

Status: draft · 2026-10-30

## Goal

Pondview is used mainly from inside a chat host. Claude is the agent. Pondview supplies the DuckDB runtime, saved dashboards, and **interactive charts and dashboards rendered inline in the conversation** through [MCP Apps](https://github.com/modelcontextprotocol/ext-apps). Claude comes first. ChatGPT should work from the same codebase later.

Non-goals:
- Keeping Pondview's own AI chat, model/provider settings, or notebook workspace.
- Supporting every SQL backend (WASM / HTTP / bridge) in the new path.

## Research findings (as of 2026-10-30)

### MCP Apps SDK
- Package: `@modelcontextprotocol/ext-apps`. Latest is `2.0.4` (`2.1.0` is also published).
  - **2.x** has peer dependencies on the **split MCP SDK v2** packages (`@modelcontextprotocol/server`, `client`, `core` `^2.0.0`).
  - **1.7.5** has a peer dependency on `@modelcontextprotocol/sdk ^1.29.0`, which is what this repo uses today.
  - The wire protocol is the same in 1.x and 2.x, and views and hosts are cross-compatible.
- Server helpers (`/server`):
  - `registerAppTool(server, name, { _meta: { ui: { resourceUri } }, ... })`.
  - `registerAppResource(server, name, "ui://…", { _meta: { ui: { csp, domain, prefersBorder } } }, read)`.
  - `RESOURCE_MIME_TYPE` (`text/html;profile=mcp-app`).
- Tool `_meta.ui.visibility: ["model" | "app"]`. **App-only tools** can be called by the view but are hidden from the model. Use them for slicer changes and drill-downs.
- View API (`App` class, React hooks in `/react`):
  - Lifecycle: `connect()`, then `ontoolinput`, `ontoolresult` and `onhostcontextchanged` (theme, `displayMode`, `platform`, safe-area insets).
  - Calls back into the server: `callServerTool`, `readServerResource`.
  - Talks to the chat: `sendMessage` (posts into the chat) and `updateModelContext` (tells the model what the user did in the UI).
  - Host actions: `requestDisplayMode` (inline / fullscreen), `openLink`, `downloadFile`.
- `useHostStyles` maps the host's theme variables, so views match Claude and ChatGPT.
- Views run in a sandboxed iframe with a strict CSP. They have no network access unless the resource declares `csp.connectDomains` or `csp.resourceDomains`. Ship each view as **one self-contained HTML file**.

### Distribution on Claude
| Path | Where it works | UI renders? | Discoverable? |
|---|---|---|---|
| **Directory connector** (remote MCP server) | claude.ai web, desktop, mobile, Cowork, Claude Code | Yes (web, desktop, mobile) | Yes: listing plus in-chat Suggested Connectors |
| **Directory plugin** with a **remote** server in `.mcp.json` + skills | chat, Cowork, Claude Code | Yes | Yes |
| **Directory plugin** with a **local** (stdio) server | Claude Code and local Cowork only. **Chat ignores local servers.** | Not in Claude Code's terminal | Yes, but only in those surfaces |
| Custom connector (URL / install link) | Same as a directory connector | Yes | No (shown as "Custom") |
| Local server in `claude_desktop_config.json` | Claude Desktop | Yes | No (manual setup) |
| MCPB desktop extension | Desktop, sideloaded | Yes | **No. The directory no longer accepts MCPB.** |

Directory connector requirements:
- A public `https://` URL.
- OAuth 2.0 for user data, or no auth for public data.
- **Every tool has a `title` plus `readOnlyHint` or `destructiveHint`.**
- Privacy policy, documentation URL, support contact, icon, and a reviewer test account.
- For MCP Apps: **3–5 PNG carousel screenshots**, at least 1000 px wide, each paired with its prompt.
- For Claude, `ui.domain` is `sha256(serverUrl)[0:32] + ".claudemcpcontent.com"`.
- Submit at claude.ai/directory/manage.

**Implication: a directory listing that shows Pondview UI inside Claude chat requires a hosted, remote Pondview server.** The current local bridge can serve power users (Desktop config, Claude Code, local Cowork), but it can't be the main path for "used from within Claude".

### ChatGPT
- ChatGPT renders standard MCP Apps (`_meta.ui.resourceUri`, the `ui/*` postMessage bridge, the same mime type).
- `window.openai.*` APIs are ChatGPT-only extras, such as `widgetState`, file helpers and `requestModal`. Feature-detect them, and never branch on host name.
- `ui.domain` is host-specific: Claude expects a `…claudemcpcontent.com` hash domain, ChatGPT an `…oaiusercontent.com` form. The server must return the right value per host; see open questions.
- It also needs a public remote server. The listing goes through OpenAI's plugin/app review, which checks the declared CSP against what the UI actually does.
- **Building to the MCP Apps standard means ChatGPT is mostly a second deployment target, not a second codebase.**

## Architecture

```
┌──────────── Claude / ChatGPT / VS Code ────────────┐
│  model ── tools/call ──┐      iframe (ui://pondview/*)
│                        │       ▲  ontoolresult / callServerTool
└────────────────────────┼───────┼───────────────────┘
                         ▼       │
              ┌─ Pondview MCP server (one codebase) ─┐
              │ tools (model + app-only)             │
              │ ui:// resources (single-file HTML)   │
              │ Workspace: DuckDB runtime + store    │
              └──────┬────────────────────┬──────────┘
          local mode │                    │ hosted mode
   stdio/HTTP, files on disk     HTTPS + OAuth, per-user workspace,
   (Desktop, Code, Cowork)       remote sources (S3/R2, Postgres,
                                 MotherDuck, Sheets), uploads
```

### Packages (target)
- `packages/mcp-server`: MCP tools, UI resources, and transports (stdio, streamable HTTP). It is extracted from `packages/cli/src/mcp.ts`. Its `Workspace` interface has a filesystem implementation (today's `project-store.ts` + `duckdb-runtime.ts`) and later a hosted implementation.
- `packages/mcp-views`: a Vite + React build with **one single-file HTML output per view** (`vite-plugin-singlefile`). It reuses components moved out of `pondview-app`:
  - `dynamic-chart`, `sql-chart`, `metric-card`, `slicer` and `ui/chart`.
  - `lib/rechart-format` and `lib/filters/*`.
- `packages/cli`: a thin wrapper, `pondview mcp` (stdio) or `pondview serve` (HTTP), with the views embedded.
- `plugin/`: the Claude plugin (`.claude-plugin/plugin.json`, `.mcp.json`, and skills such as `analyze-data` and `build-dashboard`). The skills replace the system prompts in `pondview-app/src/ai`.

### Tool surface
Model-facing tools. All get `title` plus `readOnlyHint` or `destructiveHint`, and all return a useful text summary, because the model never sees the iframe.

| Tool | Hint | UI | Notes |
|---|---|---|---|
| `list_tables` | read-only | none | |
| `describe_table` | read-only | none | Merges `get_table_schema` + `run_preview` |
| `query` | read-only | `ui://pondview/table` (optional) | Results are capped. The text result has the first N rows. |
| `show_chart` | read-only | `ui://pondview/visual` | Renders SQL + visual config without saving. This is the main "answer with a chart" tool. |
| `save_visual` | write (non-destructive) | `ui://pondview/visual` | Adds to a dashboard. Replaces `create_visual`. |
| `create_dashboard` / `create_text_card` | write | — | |
| `show_dashboard` | read-only | `ui://pondview/dashboard` | Replaces the `open_*` URL tools |
| `list_dashboards` / `get_dashboard` | read-only | none | |
| `delete_visual` / `delete_dashboard` | destructive | none | Kept separate so review can classify them |
| `connect_source` (hosted) | write | none | Attaches S3/Postgres/MotherDuck/Sheets |

App-only tools (`visibility: ["app"]`):
- `run_visual`: re-run a visual with slicer values.
- `get_dashboard_data`: data for all of a dashboard's visuals plus its filter state.
- `update_visual_config`: change the chart type or axes from the UI.

### View behavior
- **Visual view.** Renders from `structuredContent` (spec plus rows) with no extra round-trip. It has a chart-type switcher and "save to dashboard" (`callServerTool`), and "ask Claude about this" (`sendMessage` with the selected point).
- **Dashboard view.**
  - Grid of cards and slicers, inline by default, with `requestDisplayMode("fullscreen")`.
  - Slicer changes call `get_dashboard_data`, then `updateModelContext` with the active filters.
- Theming through `useHostStyles`. Mobile layout follows `hostContext.platform` and the safe-area insets.
- No external network. All data goes through server tools. **No DuckDB-WASM in views.**
- Row caps: around 5k rows per visual in `structuredContent`. Aggregate on the server.

### Security (hosted mode)
- Each user (OAuth subject) gets an isolated workspace and a DuckDB instance or process.
- DuckDB is locked down:
  - `enable_external_access` limited to the user's configured sources, then `lock_configuration=true`.
  - Memory and thread limits, plus query timeouts.
- Read-only SQL by default. Writes go only through explicit tools.
- Source credentials are stored server-side (from `secrets.ts`) and never returned in tool results.
- Origin-header validation on the HTTP transport, which the directory checklist requires.

## Phases

**Phase 1: prototype, local (days)**
- Add `@modelcontextprotocol/ext-apps@1.7.5`, which works with the current SDK 1.29.
- Build `ui://pondview/visual` as a single-file view using the existing chart component.
- Wire it to `create_visual`, and add a new `show_chart`.
- Add `title` and annotations to all existing tools.
- *Exit:* a chart renders in Claude Desktop via `claude_desktop_config.json` → `pondview mcp`. The text fallback works in Claude Code.

**Phase 2: dashboard view + app-only tools**
- Dashboard view, slicers, fullscreen, `updateModelContext`, and the tool-surface changes above.
- Test in the ext-apps basic-host / MCPJam and in VS Code.
- *Exit:* build a dashboard end to end and filter it without leaving Claude.

### Phase 2 contract (server ↔ views)

Shared by the server work (`packages/cli`) and the view work (`packages/mcp-views`). Change it only by agreement.

- Dashboard view: `ui://pondview/dashboard`, built from `packages/mcp-views/dashboard.html` to `dist/dashboard.html` (and `packages/cli/views/dashboard.html` for the published CLI). The server loads it with `loadViewHtml("dashboard", viewsDir)`.
- `VisualPayload` is unchanged from Phase 1 (`packages/mcp-views/src/visual/visual-payload.ts`).
- Filters use the app's `Filter` shape: `{ field: "table.column", op: Op, values?: unknown[] }`, where `Op` is from `pondview-app/src/lib/types/filters.ts`. Slicers emit `op: "in"`.

```ts
type DashboardLayout = { x: number; y: number; w: number; h: number };
type DashboardCard =
  | { kind: "visual"; id: string; layout: DashboardLayout;
      visual: VisualPayload | null; error: string | null }
  | { kind: "text"; id: string; layout: DashboardLayout;
      title: string; content: string /* markdown */ };
type DashboardSlicer = {
  id: string; field: string; title: string | null;
  options: Array<string | number | boolean | null>; // distinct values, capped at the slicer's limit
};
type DashboardPayload = {
  id: string; title: string; columns: number;
  cards: DashboardCard[]; slicers: DashboardSlicer[];
  filters: Filter[];                                 // active filters applied to this payload
  skippedFilters: Array<{ visualId: string; field: string; reason: string }>;
};
```

| Tool | Visibility | Input | `structuredContent` |
|---|---|---|---|
| `show_dashboard` | model + app, read-only, UI `ui://pondview/dashboard` | `{ dashboardId, filters? }` | `{ dashboard: DashboardPayload }` |
| `get_dashboard_data` | app only, read-only | `{ dashboardId, filters }` | `{ dashboard: DashboardPayload }` |
| `run_visual` | app only, read-only | `{ visualId, filters? }` | `{ visual: VisualPayload }` (`saved` set) |
| `update_visual_config` | app only, write | `{ visualId, visualType?, xKey?, yKeys?, title? }` | `{ visual: VisualPayload }` |

A per-card failure sets `error` and leaves the rest of the dashboard intact. The text result for `show_dashboard` summarizes each card in a line or two; rows stay out of it.

**Phase 3: restructure and simplify**
- Upgrade to MCP SDK v2 (split packages) and `ext-apps` 2.x.
- Extract `packages/mcp-server` and `packages/mcp-views`.
- Ship `plugin/` with skills and the local server, and publish to our own marketplace repo.
- Delete:
  - `pondview-app/src/ai/*`, `cli/src/ai.ts`, and the `/ai/chat` and `/secrets/ai` routes.
  - The analysis/notebook features.
  - The WASM and DuckDB-HTTP runtimes, unless a standalone viewer still needs them.
- Decide whether `pondview-app` survives as a slim standalone dashboard viewer or is removed.
- *Exit:* `bun run check` passes, and the repo is substantially smaller.

**Phase 4: hosted connector (Claude directory)**
- Hosted `Workspace`, OAuth 2.0, per-user isolation, remote sources, HTTPS deployment, and Claude `ui.domain`.
- Privacy policy, docs, test account, and 3–5 screenshots.
- Submit both the **connector** and the **plugin** (with the remote URL in `.mcp.json`).
- *Exit:* the listing is published as a Community connector.

**Phase 5: ChatGPT**
- Per-host `ui.domain`, testing in ChatGPT developer mode, and feature-detected `window.openai` extras (e.g. `widgetState` for filter persistence).
- Submit to OpenAI's app review.

## Open questions
1. **Where does hosted users' data come from?** This decides the shape of the hosted product. Options: uploads (host file-handoff support varies), cloud sources (S3/R2, Postgres, MotherDuck, Sheets), or both. Who pays for compute and storage?
2. **Keep a standalone web app?** A shareable dashboard URL outside chat is useful for sharing, but each surface we keep costs maintenance.
3. **Per-host `ui.domain`.** Check whether `registerAppResource` can vary `_meta.ui.domain` by the connecting client (from `clientInfo` at initialize), or whether we need one deployment per host.
4. **Local Cowork.** Confirm whether it renders MCP Apps from a local plugin server. If it does, the local plugin becomes much more valuable.
5. **Naming and permanence.** The plugin `name` and the directory slug can't change after release.

## References
- MCP Apps SDK and spec: https://github.com/modelcontextprotocol/ext-apps
- Claude MCP Apps: https://claude.com/docs/connectors/building/mcp-apps/getting-started
- Connector submission: https://claude.com/docs/connectors/building/submission
- Directory vs custom: https://claude.com/docs/connectors/building/directory-vs-custom
- Plugin structure (surface support): https://claude.com/docs/plugins/build
- Plugin submission: https://claude.com/docs/plugins/submit
- MCP Apps in ChatGPT: https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt/
