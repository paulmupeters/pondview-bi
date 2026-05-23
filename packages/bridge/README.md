# Pondview CLI

Pondview CLI runs the local DuckDB bridge and serves the bundled Pondview app.

## Install

Run it without installing globally:

```bash
npm install -g pondview
pondview
```

Or run it without installing globally:

```bash
npx pondview
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

## Development

From the repository root:

```bash
bun run bridge:build-ui
bun run bridge:build-cli
bun run bridge -- start
bun run cli:pack:dry-run
```
