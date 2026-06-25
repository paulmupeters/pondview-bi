# MCP for Local Agents

Pondview includes a Model Context Protocol (MCP) server so local agents such as
Claude Code, Codex CLI, or MCP Inspector can inspect your DuckDB data, run safe
queries, and create or update Pondview dashboards.

Use MCP when you want an agent to work with the same local Bridge runtime and
project metadata as the Pondview app.

## Quick start

For the best local workflow, start Pondview first so the app and the MCP server
share one bridge process:

```bash
pondview start --project-dir ./example
```

Then register MCP with your agent:

```bash
claude mcp add pondview -- pondview mcp --url http://127.0.0.1:17817
```

For Codex CLI:

```bash
codex mcp add pondview -- pondview mcp --url http://127.0.0.1:17817
```

This keeps the bridge as the only process opening the DuckDB file. The MCP
server talks to it over HTTP, just like other Pondview CLI client commands.

## Project autostart

You can also let MCP start a headless bridge for a project:

```bash
pondview mcp --project-dir ./example
```

This starts `pondview start --no-ui` when no bridge is reachable. It does not
open a browser or serve the full UI automatically. Tools that return dashboard
or analysis links still return local Pondview URLs.

If you want the UI available for those links, start Pondview separately with
`pondview start --project-dir ./example`, then run MCP with `--url`.

## Inspect with MCP Inspector

MCP Inspector is useful for checking the tool list and trying calls manually:

```bash
npx @modelcontextprotocol/inspector \
  pondview mcp --project-dir ./example
```

During development from the repository, run the CLI source directly:

```bash
npx @modelcontextprotocol/inspector \
  bun run packages/cli/src/cli.ts mcp --project-dir ./example
```

## Available tools

The MCP server exposes tools for data exploration, dashboard creation, and local
navigation:

| Tool | Purpose |
| --- | --- |
| `list_tables` | List queryable tables and table references. |
| `get_table_schema` | Inspect columns and sample rows for a table. |
| `run_preview` | Return a small preview from a table. |
| `execute_sql` | Run read-only SQL by default. |
| `list_dashboards` | List existing dashboards with counts and URLs. |
| `get_dashboard` | Inspect a dashboard, including charts and related metadata. |
| `create_dashboard` | Create or update a dashboard metadata row. |
| `create_visual` | Add a dashboard visual from SQL. |
| `open_ui` | Return URLs for the app, dashboards, analyses, or a specific item. |
| `open_dashboard` | Return a dashboard URL. |

Dashboard tools write Pondview metadata through the bridge so the web app can
see changes live.

## Write access

`execute_sql` is read-only by default. Start MCP with `--allow-write-sql` only
for trusted local workflows:

```bash
pondview mcp --project-dir ./example --allow-write-sql
```

Dashboard creation tools still write Pondview metadata because creating
dashboards and visuals is their purpose.

## URLs and UI links

By default, URLs point at `http://127.0.0.1:17817`. If your Pondview UI is served
elsewhere, pass `--app-url`:

```bash
pondview mcp --project-dir ./example --app-url http://127.0.0.1:17818
```

Use `open_ui` when an agent needs to return a link to the app, dashboards list,
one dashboard, the analyses list, or one analysis. The tool returns the URL; it
does not open a browser.

## Standalone DuckDB files

For standalone use against a private DuckDB file, you can run MCP in embedded
mode:

```bash
pondview mcp --database ./analytics.duckdb
```

When a Pondview app is already using the same file, prefer the bridge-client
workflow with `pondview start` plus `pondview mcp --url ...` to avoid DuckDB file
lock conflicts.

## Authentication

If the bridge is token-protected, pass the same token configuration to MCP:

```bash
pondview mcp --url http://127.0.0.1:17817 --token-env PONDVIEW_TOKEN
```

Bridge tokens only authenticate the MCP process to the bridge. They do not
configure AI provider credentials.

## Related guides

- [Pondview CLI](/guide/cli)
- [Dashboards](/guide/dashboards)
- [SQL Runtime Backends](/guide/sql-runtime-backends)
