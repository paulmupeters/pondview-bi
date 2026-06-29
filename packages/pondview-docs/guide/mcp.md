# MCP for Local Agents

Pondview includes a Model Context Protocol (MCP) server so local agents such as
Claude Code, Codex CLI, or MCP Inspector can inspect your DuckDB data, run safe
queries, and create or update Pondview dashboards.

Use MCP when you want an agent to work with the same local Bridge runtime and
project metadata as the Pondview app.

## Quick start

Start Pondview. The cli serves the app, DuckDB runtime, and primary
Streamable HTTP MCP endpoint from one process:

```bash
pondview start --project-dir ./example
```

Then register the bridge MCP endpoint with your agent:

```bash
claude mcp add --transport http pondview http://127.0.0.1:17817/mcp
```

For Codex CLI:

```bash
codex mcp add pondview --url http://127.0.0.1:17817/mcp
```

The cli remains the only process opening the DuckDB file. MCP tools execute
directly against that shared runtime.

## Headless use

Run the same endpoint without serving the Pondview UI:

```bash
pondview start --no-ui --project-dir ./example
```

Dashboard and analysis tools can still return URLs, but those pages require a
cli started without `--no-ui`.

## Inspect with MCP Inspector

MCP Inspector is useful for checking the tool list and trying calls manually:

```bash
npx @modelcontextprotocol/inspector
```

In the Inspector connection pane, select **Streamable HTTP** and enter
`http://127.0.0.1:17817/mcp`. Start the development cli first:

```bash
bun run bridge -- start --project-dir ./example
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

`execute_sql` is read-only by default. Enable write SQL only for trusted local
workflows:

```bash
pondview start --project-dir ./example --mcp-allow-write-sql
```

Dashboard creation tools still write Pondview metadata because creating
dashboards and visuals is their purpose.

## URLs and UI links

Use `open_ui` when an agent needs to return a link to the app, dashboards list,
one dashboard, the analyses list, or one analysis. The tool returns the URL; it
does not open a browser.

## Stdio compatibility

`pondview mcp` remains available for clients that only support stdio and for
standalone embedded DuckDB use:

```bash
pondview mcp --database ./analytics.duckdb
```

Do not point embedded stdio MCP and `pondview start` at the same DuckDB file.
Prefer the primary `/mcp` endpoint whenever the bridge is running.

## Authentication

If the bridge is token-protected, pass the same token configuration to MCP:

```bash
pondview start --project-dir ./example --token-env PONDVIEW_TOKEN
codex mcp add pondview \
  --url http://127.0.0.1:17817/mcp \
  --bearer-token-env-var PONDVIEW_TOKEN
claude mcp add --transport http pondview http://127.0.0.1:17817/mcp \
  --header "Authorization: Bearer $PONDVIEW_TOKEN"
```

Bridge tokens do not configure AI provider credentials.

## Related guides

- [Pondview CLI](/guide/cli)
- [Dashboards](/guide/dashboards)
- [SQL Runtime Backends](/guide/sql-runtime-backends)
