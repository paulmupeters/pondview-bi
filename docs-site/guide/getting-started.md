# Getting Started

Use this page for a fast first run of BI Chat, then jump to deeper guides as needed.

## Prerequisites

- Node.js 18+ or Bun
- An API key for your preferred AI provider

## 1) Install and run locally

```bash
# from the repository root
bun install
bun dev
```

Or with npm:

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## 2) Configure AI settings

1. Open **Settings** in the app.
2. Select your provider.
3. Enter a model ID.
4. Add your provider API key.
5. Save and return to chat.

See [AI Provider Configuration](/guide/ai-provider-configuration) for details and caveats.

## 3) Add your first data

Use one of these paths:

- Connect a source (DuckDB, MotherDuck, Postgres, MySQL, SQLite)
- Upload a file (CSV, Parquet, XLSX, XLS)

See [Connected Data Sources](/guide/connected-data-sources) and [Uploads and Browser Storage](/guide/uploads-and-browser-storage).

## 4) Run your first analysis

1. Ask a question in chat, or switch to SQL mode.
2. Review the generated SQL and result table.
3. Create a chart from useful results.
4. Save the chart to a dashboard.
5. Add a text card and reference metric aliases like `{{highest_category}}`.

For runtime behavior and query execution paths, see [DuckDB Usage Overview](/guide/duckdb-usage-overview) and [SQL Runtime Backends](/guide/sql-runtime-backends).

## 5) Understand persistence and backup

- Workspace state is browser-local by default.
- Export/import is available for backup or transfer.

See [Workspace Persistence](/guide/workspace-persistence).

## Common first-run issues

- Missing API key or invalid model ID in Settings
- Connected source appears but tables are not discoverable
- Query runs against the wrong runtime/backend

Use these guides to debug:

- [AI Provider Configuration](/guide/ai-provider-configuration)
- [Connected Data Sources](/guide/connected-data-sources)
- [SQL Runtime Backends](/guide/sql-runtime-backends)
- [Extension Server and API Routes](/guide/extension-server-and-api-routes)

## Next steps

- Read the [Docs Map](/guide/) for the full documentation set.
- Explore [Semantic Layer Materialization](/guide/semantic-layer-materialization) after your first dashboard flow works.
