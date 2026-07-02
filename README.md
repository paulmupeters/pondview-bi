<h1 align="center">Pondview</h1>

<p align="center">DuckDB-powered BI for AI-assisted analysis, SQL, charts, and dashboards.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@pondview/cli"><img alt="npm" src="https://img.shields.io/npm/v/%40pondview%2Fcli?style=flat-square" /></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/github/license/paulmupeters/pondview-bi?style=flat-square" /></a>
</p>

<p align="center">
  <a href="./packages/pondview-docs/index.md">Documentation</a> ·
  <a href="./packages/cli/README.md">CLI</a> ·
  <a href="./CONTRIBUTING.md">Contributing</a>
</p>

Preform AI assisted data analysis in the pondview analysis workspace: 

[![Pondview analysis workspace](packages/pondview-landing/public/analysis-workspace-preview.png)](./packages/pondview-docs/index.md)

An AI agent querying and charting data through Pondview's MCP server:

<video src="https://github.com/user-attachments/assets/bf72928d-14a3-41b4-bca8-7b5d3c2c67ed" controls width="600"></video>

---

## Installation

```bash
# Package managers
npm i -g @pondview/cli@latest
bun add -g @pondview/cli@latest
pnpm add -g @pondview/cli@latest

# Or run without installing
npx @pondview/cli@latest start
bunx @pondview/cli@latest start
```

## Usage

```bash
pondview start
pondview start --database ./analytics.duckdb
pondview start --project-dir ./my-pondview-project
pondview attach ./analytics.duckdb --as analytics
pondview query "SELECT 42 AS answer"
```

## Claude and Codex

Start Pondview, then register its MCP server with your agent:

```bash
pondview start --project-dir ./my-pondview-project

claude mcp add --transport http pondview http://127.0.0.1:17817/mcp
codex mcp add pondview --url http://127.0.0.1:17817/mcp
```

For a headless workflow, start the same bridge without its UI:

```bash
pondview start --no-ui --project-dir ./my-pondview-project
```

`pondview mcp` remains available as a compatibility stdio transport.

## Documentation

For setup, configuration, runtimes, connected sources, dashboards, and AI providers, see the [Pondview docs](./packages/pondview-docs/index.md).

## Development

```bash
bun install
bun dev

bun run pondview start
bun run pondview query "SELECT 42 AS answer"

bun run typecheck
bun run lint
bun run test
```


## Packages

- `packages/pondview-app` — React/Vite application
- `packages/cli` — local DuckDB bridge and packaged CLI
- `packages/bridge-protocol` — shared bridge protocol
- `packages/pondview-docs` — documentation site
- `packages/pondview-landing` — marketing site

## License

Apache-2.0. See [LICENSE](./LICENSE).
