# MCP Apps Query Workspace Specification

Status: implemented  
Owner: Pondview  
Target: `feature/mcp-app`

## Summary

Pondview extends its existing MCP server with an MCP App that renders SQL query
results as an interactive, inline table and chart workspace inside compatible
MCP hosts.
The feature is progressive enhancement: the existing `execute_sql` tool name,
input, runtime behavior, permissions, and text response remain valid for every
MCP client, while hosts that support `io.modelcontextprotocol/ui` may also
render the Pondview view.

The App intentionally does not embed the full Pondview single-page app. It
ships a small, self-contained view that receives bounded query data through MCP
tool results, exports the current client-side view through the host, and uses
existing MCP tools for explicit dashboard actions. It does not connect directly
to the Bridge HTTP API.

## Problem

Pondview's MCP tools can query DuckDB and create visual artifacts, but clients
currently receive JSON and local URLs. This is sufficient for automation and
text-only agents, but it interrupts conversational analysis when a user needs
to scan, sort, or filter a result. Opening the full Pondview app also requires a
separate browser surface and assumes that the MCP host can reach a local URL.

MCP Apps provide a standard way for the Pondview server to attach a sandboxed
HTML view to a tool result. This lets supported hosts show an interactive result
in the conversation while preserving ordinary MCP behavior elsewhere.

## Goals

- Render `execute_sql` results inline in MCP Apps-compatible hosts.
- Keep `execute_sql` read-only by default and preserve its existing row limits.
- Keep useful text and `structuredContent` fallbacks for non-App hosts.
- Bundle the view into one HTML resource included in the published CLI.
- Support client-side text filtering and column sorting without additional SQL.
- Suggest and render bar, line, area, and donut charts from compatible results.
- Export the current filtered and sorted result as CSV or JSON through the
  standard host-mediated download API.
- Add the current table or chart to a new or existing Pondview dashboard through
  the existing `create_visual` MCP tool.
- Match Pondview's compact, data-first visual language and support light and
  dark host themes.
- Establish a reusable server and build pattern for later table preview,
  visual, and dashboard Apps.

## Non-goals

- Embedding the complete Pondview browser application.
- Rendering complete saved dashboards inside the result App.
- Allowing the App to connect directly to `/query`, `/api`, or DuckDB.
- Adding write operations or changing `--mcp-allow-write-sql` behavior.
- Persisting App-local filters, sort state, or query results across chats.
- Guaranteeing UI support in MCP clients that do not implement MCP Apps.

## User experience

When a model calls `execute_sql`, a compatible host renders a Pondview result
view next to the tool call. The view includes:

- A compact result header with row and column counts.
- The query columns and returned rows in a scrollable table.
- A local text filter that searches all displayed cells.
- Clickable column headings that cycle ascending, descending, and unsorted.
- Clear empty, malformed-result, and tool-error states.
- A small indication when the returned result is bounded by the MCP row limit.
- A table/chart switch. Chart mode chooses an initial dimension and numeric
  value, then lets the user select bar, line, area, or donut rendering and remap
  both axes.
- CSV and JSON export buttons. Exports contain the current filtered and sorted
  rows, not hidden rows, and are handed to the host for confirmation/download.
- A dashboard panel for naming the visual, choosing a new dashboard title or an
  existing dashboard ID, adding the current view, and opening Pondview's
  dashboard index.

The App never hides the normal tool response. A text-only host continues to
receive the JSON representation currently returned by Pondview.

## Protocol design

### Extension

The server advertises the MCP Apps extension in server capabilities:

```json
{
  "extensions": {
    "io.modelcontextprotocol/ui": {
      "mimeTypes": ["text/html;profile=mcp-app"]
    }
  }
}
```

### Resource

The server registers one static resource:

```text
ui://pondview/query-results.html
```

Its MIME type is `text/html;profile=mcp-app`. The resource contains all
JavaScript and CSS required by the MVP, so it needs no network, media, camera,
microphone, or external resource permissions.

### Tool linkage

`execute_sql` is registered as an App tool with:

```json
{
  "_meta": {
    "ui": {
      "resourceUri": "ui://pondview/query-results.html"
    }
  }
}
```

The tool result continues to include a meaningful `content` array and provides
this structured payload to the view:

```ts
type QueryResultPayload = {
  sql?: string;
  columns: Array<{ name: string; type?: string }>;
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  rowsChanged?: number;
};
```

`sql` is included for new query results so a user-initiated dashboard action can
recreate the visual through `create_visual`. Older results without `sql` remain
fully renderable; only dashboard creation is disabled.

Unknown fields must be ignored so the payload can evolve compatibly.

## Architecture

### Server

`packages/cli/src/mcp.ts` remains the source of tool behavior. It will:

1. Advertise MCP Apps support.
2. Register the bundled HTML as an MCP resource.
3. Register `execute_sql` through the MCP Apps server helper.
4. Preserve the existing handler and `toToolResult` fallback.

Both the primary Streamable HTTP transport and compatibility stdio transport
use the same server factory, so the App metadata and resource are available on
both transports.

### View

The view is a separate Vite entry in `packages/pondview-app`. It uses React and
the MCP Apps client SDK, but it does not mount Pondview's router, project gate,
workspace database, AI settings, or Bridge client. It may reuse small styling
or data-formatting helpers only when they do not pull those systems into the
bundle.

The view connects to its host through the MCP Apps `App` client, listens for the
initial tool result, validates the payload at the browser boundary, and performs
filtering, sorting, chart shaping, and export serialization in memory. It
advertises inline and fullscreen display modes.

### App actions

App actions are capability-gated and always begin with an explicit user click:

- CSV/JSON uses `ui/download-file`; the host decides whether to confirm or deny
  the download.
- Dashboard creation uses `tools/call` for `create_visual`; the existing server
  validates SQL and persists the dashboard metadata.
- Dashboard navigation first calls `open_dashboard`, then uses `ui/open-link`
  when the host supports it. If link opening is unavailable or denied, the App
  keeps the URL visible as a fallback.

### Build and packaging

A dedicated Vite configuration produces a single HTML artifact and disables
Vite's public-directory copy step because the App has no external assets. The
Bridge UI build writes that artifact under `packages/cli/dist/mcp-app/`, which
is already inside the published CLI's `files` allowlist. Server code resolves
the same artifact from both source execution and the compiled
`packages/cli/lib` entry.

## Security and privacy

- SQL authorization remains server-side. The view cannot bypass
  `assertSqlAllowed` or increase the configured result limit.
- The view makes no direct network requests and receives no Bridge bearer
  token, source secret, AI key, database path, or connection string.
- Values are rendered as text; query data is never inserted as raw HTML.
- CSV fields beginning with spreadsheet formula markers are prefixed with an
  apostrophe to reduce formula-injection risk when opened in spreadsheet apps.
- Dashboard creation re-executes the original SQL through the server and cannot
  bypass the read-only policy.
- All App code runs in the host's sandboxed iframe.
- The resource declares no extra CSP domains or browser permissions.
- Tool errors remain visible to both the model and the App.

## Compatibility and degradation

- Hosts that support MCP Apps can fetch and render the `ui://` resource.
- Hosts that ignore UI metadata continue using `execute_sql` unchanged.
- Existing callers do not need to rename tools or change arguments.
- Existing dashboard URLs and the standalone Pondview UI remain available.
- If the bundled resource is missing, `resources/read` returns a descriptive
  server error; SQL execution itself remains unaffected.

## Testing

The MVP requires:

- Unit coverage that `execute_sql` exposes the expected UI metadata.
- Unit coverage that the UI resource has the MCP App MIME type and serves the
  generated HTML.
- Existing SQL read/write-policy tests to remain green.
- Browser-boundary tests for valid, empty, malformed, filtered, and sorted data.
- Unit tests for chart inference, numeric conversion, point limits, CSV escaping,
  spreadsheet-safe fields, and JSON column selection.
- A successful production bundle containing no external asset references.
- Manual verification with the official MCP Apps basic host.
- A fallback verification with a client that ignores App metadata.

### Manual host retest

In a signed-in MCP Apps-compatible host, ask the model to run a query with one
text column and one or more numeric columns. Confirm that the inline result can
filter and sort rows, render bar, line, area, and donut charts, export CSV and
JSON, and add a chart to either a new or existing Pondview dashboard. Approve
the host's download, tool-call, and link-opening prompts when checking those
actions; hosts may deny any of them by policy.

## Acceptance criteria

The MVP is complete when:

1. `pondview start` and `pondview mcp` expose the same App-enhanced
   `execute_sql` tool.
2. Reading `ui://pondview/query-results.html` returns a self-contained HTML
   resource with MIME type `text/html;profile=mcp-app`.
3. A compatible host renders query columns and rows inline.
4. Users can filter rows, sort columns, and switch to a configurable chart
   without another server call.
5. Empty and error results are understandable and accessible.
6. Non-App clients receive the current text and structured result behavior.
7. SQL writes remain blocked unless the existing write flag is enabled.
8. CLI packaging includes the App resource.
9. Focused MCP tests, app typecheck, CLI typecheck, lint, and relevant builds
   pass.
10. Hosts that advertise file downloads can export visible rows as CSV or JSON.
11. Hosts that advertise server-tool calls can add the current table or chart
    to a Pondview dashboard after host approval.

## Follow-up phases

After validating the transport, packaging, and host behavior:

1. Add inline rendering for `run_preview` and schema inspection.
2. Add `show_dashboard` with server-evaluated chart data.
3. Add App-only tools for refresh, pagination, and dashboard filtering.
4. Add image and Parquet export where host and data-size limits allow it.
5. Add multi-series chart mapping and chart-specific formatting controls.
