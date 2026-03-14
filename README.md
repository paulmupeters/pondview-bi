# BI Chat - AI Business Intelligence Assistant

BI Chat is an AI-assisted analytics app for exploring connected data sources with natural language, SQL, charts, and dashboards.

## Features

### AI analysis

- Ask questions in natural language and turn them into SQL
- Stream model responses and SQL tool output in the chat UI
- Configure the AI provider, model, and API key from Settings
- Keep chat history and interactive SQL artifacts in the workspace

### Charts and dashboards

- Render line, area, bar, and pie charts from query results
- Adjust chart settings inline or through config dialogs
- Save visuals to dashboards with tables, metric cards, and text blocks
- Filter dashboards in the browser with shared slicers and join definitions

### Data connectivity

- Connect to DuckDB and MotherDuck databases
- Attach Postgres, MySQL, and SQLite sources through DuckDB
- Upload CSV, Parquet, XLSX, and XLS files from the UI
- Inspect schemas and tables before querying

### Runtime options

- Run locally with DuckDB WASM in the browser
- Switch to Bridge or DuckDB over HTTP from Settings
- Persist browser workspace state and export/import it
- Optionally persist materialized DuckDB tables across restarts

## Tech Stack

- Frontend: Vite 8, React 19, TypeScript
- Routing: React Router DOM v7
- UI Components: Radix UI, Tailwind CSS v4
- Charts: Recharts
- Code Editor: CodeMirror 6
- AI: AI SDK v6 with Gateway, OpenAI, Anthropic, xAI, and Open Responses support
- Database: DuckDB (WASM + Node API), MotherDuck, Postgres, MySQL, SQLite
- Persistence: browser localStorage + IndexedDB, sidecar JSON files
- Runtime: Bun (recommended) or Node.js

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- An API key for whichever AI provider you want to use

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd bi-chat
```

2. Install dependencies:

```bash
# Using Bun (recommended)
bun install

# Or using npm
npm install
```

3. Create local environment overrides if you need them:

```bash
cp env.local.example .env.local
```

4. Start the dev server:

```bash
# Using Bun
bun dev

# Or using npm
npm run dev
```

5. Open [http://localhost:5173](http://localhost:5173).

6. Open Settings in the app and configure:
   - AI provider
   - model ID
   - provider API key

### Optional Environment Variables

Use `.env.local` only for the integrations you need:

```bash
# Optional: MotherDuck connections
MOTHERDUCK_TOKEN=

# Optional: persist local DuckDB materializations
DUCKDB_PERSIST_PATH=./data/materialized.duckdb

# Optional: DuckDB over HTTP runtime
DUCKDB_HTTP_HOST=0.0.0.0
DUCKDB_HTTP_PORT=9999
DUCKDB_HTTP_AUTH=secret

# Optional: legacy/server-side OpenAI flows
OPENAI_API_KEY=
```

The checked-in template lives at [env.local.example](/Users/paulpeters/Developer/bi-chat/env.local.example).

## Usage

### Basic workflow

1. Connect a data source or upload a file
2. Ask a question in chat or write SQL directly
3. Review the generated SQL and results
4. Turn useful results into charts or dashboard cards
5. Save the workspace locally or export it for backup/share

### Example prompts

- "How many unicorn companies are there?"
- "Show me the top 10 companies by valuation"
- "What's the average valuation by country?"
- "Create a bar chart showing company distribution by industry"

### Supported data sources

- DuckDB files
- MotherDuck databases
- Postgres
- MySQL
- SQLite
- Browser uploads: CSV, Parquet, XLSX, XLS

## Project Structure

```text
bi-chat/
├── docs/                    # Architecture notes, docs index, and datasource context
├── public/                  # Static assets
├── src/
│   ├── ai/                  # Model config, prompts, tools, client helpers
│   ├── app/                 # Pages and API routes
│   ├── components/          # React components and UI primitives
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Runtime, DuckDB, workspace, and dashboard logic
│   ├── themes/              # Built-in visual themes
│   └── vite/                # Vite-specific app shell and router adapters
├── env.local.example        # Example environment variables
├── index.html               # Vite entry HTML
└── vite.config.ts           # Vite configuration
```

See [docs/README.md](/Users/paulpeters/Developer/bi-chat/docs/README.md) for the docs map.

## Development

### Available scripts

```bash
# Development
bun dev
bun build
bun preview
bun run serve:extension

# Code Quality
bun run lint
bun run format
bun run typecheck
```

### Key areas

- Chat UI: [src/components/chat.tsx](/Users/paulpeters/Developer/bi-chat/src/components/chat.tsx)
- AI settings and provider selection: [src/app/settings/page.tsx](/Users/paulpeters/Developer/bi-chat/src/app/settings/page.tsx)
- Connected data sources: [src/components/connect-data-dialog.tsx](/Users/paulpeters/Developer/bi-chat/src/components/connect-data-dialog.tsx)
- Dashboard runtime and filtering: [src/lib/dashboard/browser-filter-engine.ts](/Users/paulpeters/Developer/bi-chat/src/lib/dashboard/browser-filter-engine.ts)
- DuckDB integrations: [src/lib/duckdb](/Users/paulpeters/Developer/bi-chat/src/lib/duckdb)
- Workspace persistence: [src/lib/workspace](/Users/paulpeters/Developer/bi-chat/src/lib/workspace)

## Configuration Notes

### AI configuration

The primary chat experience reads AI settings from browser storage. In practice that means most local development starts with the Settings page rather than environment variables.

Current built-in provider options include Gateway, OpenAI, Anthropic, xAI, and Open Responses.

### Dashboard filtering

Dashboard filtering is browser-first:

- join definitions are edited in Settings and stored in `localStorage` under `bi.dashboard.joinDefs.v1`
- chart SQL is rewritten in the browser when slicers are active
- referenced tables are exposed through runtime-local `mat.*` aliases
- simple references become views when possible; harder cases can fall back to copied tables

### Datasource context

Optional datasource-specific AI context lives in [docs/datasource-context](/Users/paulpeters/Developer/bi-chat/docs/datasource-context) and is exposed through the datasource context route/tooling.

## Docs

The `docs/` folder currently contains:

- DuckDB/runtime notes
- dashboard materialization notes
- datasource-specific AI context
- placeholder docs for uncovered topics that still need fuller documentation

## Contributing

1. Create a branch
2. Make your changes
3. Run linting and type-checks
4. Update docs when behavior changes
5. Open a pull request

## License

No license file is currently checked into this repository.
