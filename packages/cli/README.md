# Pondview CLI

Pondview CLI runs the local DuckDB bridge and serves the bundled Pondview app.

## Install

Run it without installing globally:

```bash
npm install -g @pondview/cli
pondview
```

Or run it without installing globally:

```bash
npx @pondview/cli
```

The published package runs on Node.js 20 or newer.

## Common Commands

```bash
pondview start
pondview start --database ./analytics.duckdb
pondview start --project-dir ./my-pondview-project
pondview start --no-ui
pondview attach ./analytics.duckdb --as analytics
pondview list-sources
pondview query "SELECT 42 AS answer"
pondview doctor
pondview stop
```

`pondview start` serves the Pondview UI from bundled files in this package.
Those assets are built during packaging with `bun run bridge:build-ui`.

It also serves Pondview's primary Streamable HTTP MCP interface:

```bash
codex mcp add pondview --url http://127.0.0.1:17817/mcp
claude mcp add --transport http pondview http://127.0.0.1:17817/mcp
```

`pondview mcp` remains available as a compatibility stdio transport.

## Development

From the repository root:

```bash
bun run bridge:build-ui
bun run bridge:build-cli
bun run pondview start
bun run cli:pack:dry-run
```

## Release

1. Bump the version in both `packages/bridge-protocol/package.json` and
   `packages/cli/package.json`, and update the `@pondview/bridge-protocol`
   dependency range in `packages/cli/package.json`.
2. Commit the version bump and push a matching tag, for example `v0.1.1`.
3. GitHub Actions publishes `@pondview/bridge-protocol` first, then `@pondview/cli`.

The workflow expects an `NPM_TOKEN` repository secret with permission to publish
both packages.
