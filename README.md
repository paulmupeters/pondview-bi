# BI Chat - AI Business Intelligence Assistant

An intelligent chat application that enables natural language interaction with your data through AI-powered SQL generation, execution, and visualization.

## Features

### 🤖 AI-Powered Data Analysis
- **Natural Language Queries**: Ask questions about your data in plain English
- **Intelligent SQL Generation**: AI automatically generates SQL queries based on your questions
- **Schema Understanding**: AI analyzes table structures to write accurate queries
- **Smart Insights**: Get automated insights and summaries from your data

### 📊 Interactive Visualizations
- **Dynamic Charts**: Automatically generates charts (line, area, pie) based on query results
- **Customizable Visualizations**: Configure chart types, colors, and display options
- **Real-time Updates**: Charts update as you modify queries and explore data
- **Multiple Chart Types**: Support for line charts, area charts, and pie charts

### 💾 Multi-Database Support
- **DuckDB Integration**: Native support for DuckDB databases
- **MotherDuck Cloud**: Connect to MotherDuck cloud databases
- **SQLite Support**: Local SQLite database for chat history
- **Flexible Data Sources**: Easy connection to various data sources

### 💬 Conversational Interface
- **Chat History**: Persistent conversation history with SQL queries and results
- **Context Awareness**: AI remembers previous queries and results
- **Streaming Responses**: Real-time streaming of AI responses and query execution
- **Artifact System**: Interactive SQL execution artifacts with loading states

### 📋 Dashboards
- **Dashboard Builder**: Compose charts, tables, metric cards, and text blocks into shareable dashboards
- **Slicer / Filter Bar**: Cross-panel filtering driven by a global join graph
- **Drag-and-Drop Layout**: Reorder and resize dashboard panels interactively

## Tech Stack

- **Frontend**: Vite 7, React 19, TypeScript
- **Routing**: React Router DOM v7
- **UI Components**: Radix UI, Tailwind CSS v4
- **Charts**: Recharts for data visualization
- **Code Editor**: CodeMirror 6 with SQL language support
- **AI**: Vercel AI SDK v5 with OpenAI
- **Database**: DuckDB (WASM + Node API), SQLite, MotherDuck
- **ORM**: Drizzle ORM
- **Runtime**: Bun (recommended) or Node.js

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- OpenAI API key (for AI functionality)

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

3. Set up environment variables:
```bash
# Create a .env.local file
OPENAI_API_KEY=your_openai_api_key
MOTHERDUCK_TOKEN=your_motherduck_token  # Optional, for MotherDuck integration
DATABASE_PATH=./sqlite.db              # Optional, custom SQLite path
```

4. Run the development server:
```bash
# Using Bun
bun dev

# Or using npm
npm run dev
```

5. Open [http://localhost:5173](http://localhost:5173) in your browser.

6. *(Optional)* To persist materialized tables across restarts, set `DUCKDB_PERSIST_PATH=./data/materialized.duckdb` in `.env.local`.

7. *(Optional)* To use the DuckDB HTTP adapter for ad-hoc queries, run a DuckDB instance with the `httpserver` extension and set `DUCKDB_HTTP_HOST` / `DUCKDB_HTTP_PORT` in `.env.local`.

## Usage

### Basic Workflow

1. **Ask Questions**: Type natural language questions about your data
2. **AI Processing**: The AI analyzes your question and generates appropriate SQL
3. **Query Execution**: SQL is executed against your connected databases
4. **Results Display**: Results are shown in both table and chart formats
5. **Further Exploration**: Continue the conversation to dive deeper into your data

### Example Queries

- "How many unicorn companies are there?"
- "Show me the top 10 companies by valuation"
- "What's the average valuation by country?"
- "Create a chart showing company distribution by industry"

### Connecting Data Sources

The application supports connecting to various data sources through the connected tables system:

- **DuckDB Files**: Local DuckDB database files
- **MotherDuck**: Cloud-based DuckDB databases
- **File Uploads**: Upload CSV or Parquet files directly in the UI
- **Custom Schemas**: Connect to specific database schemas

## Project Structure

```
bi-chat/
├── src/
│   ├── ai/                    # AI-related functionality
│   │   ├── agents/           # AI agents
│   │   ├── artifacts/        # Interactive artifacts (SQL execution)
│   │   ├── tools/            # AI tools (SQL execution, schema analysis)
│   │   ├── models.ts         # Model configuration
│   │   ├── prompts.ts        # AI prompts and instructions
│   │   └── context.ts        # AI context helpers
│   ├── app/                  # Application pages & API routes
│   │   ├── api/             # Server-side API handlers
│   │   ├── chat/            # Chat pages
│   │   ├── dashboards/      # Dashboard pages
│   │   ├── data/            # Data viewing pages
│   │   └── settings/        # Settings pages
│   ├── components/           # React components
│   │   ├── ui/              # Reusable UI primitives
│   │   ├── chat/            # Chat-specific components
│   │   ├── dashboard/       # Dashboard components
│   │   ├── chat.tsx         # Main chat interface
│   │   ├── dynamic-chart.tsx # Chart visualization
│   │   └── sql-*.tsx        # SQL-related components
│   ├── lib/                  # Utility libraries
│   │   ├── db/              # Database configuration (Drizzle)
│   │   ├── duckdb/          # DuckDB integration
│   │   ├── filters/         # Cross-panel filter logic
│   │   ├── joins/           # Join graph utilities
│   │   └── utils.ts         # Shared utility functions
│   ├── hooks/               # Custom React hooks
│   └── types/               # Shared TypeScript types
├── semantic-layer/           # Semantic model configuration
│   ├── context/             # Business/domain context for AI
│   ├── models/              # Source-to-table mappings
│   └── joins.yml            # Global join graph
├── public/                  # Static assets
├── index.html               # Vite entry HTML
└── vite.config.ts           # Vite configuration
```

## Development

### Available Scripts

```bash
# Development
bun dev                    # Start Vite development server
bun build                  # Build for production
bun preview                # Preview production build locally
bun run serve:extension    # Start the extension sidecar server

# Code Quality
bun run lint               # Run Biome linter
bun run format             # Format code with Biome
bun run typecheck          # Type-check with tsc

# Database
bun run drizzle:generate   # Generate database migrations
bun run drizzle:push       # Apply schema migrations
bun run migrate            # Run migration script
```

### Key Components

- **Chat Interface** (`src/components/chat.tsx`): Main conversational interface
- **SQL Execution** (`src/ai/tools/`): AI tools for running SQL queries
- **Chart Generation** (`src/ai/tools/`): AI-powered chart configuration
- **Dynamic Charts** (`src/components/dynamic-chart.tsx`): Interactive chart rendering
- **Dashboard Builder** (`src/components/dashboard-builder-panel.tsx`): Drag-and-drop dashboard composition
- **Database Integration** (`src/lib/duckdb/`): DuckDB and database utilities

## Configuration

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | ✅ | API key for AI functionality |
| `MOTHERDUCK_TOKEN` | Optional | Token for MotherDuck cloud integration |
| `DATABASE_PATH` | Optional | Custom SQLite database path (default: `./sqlite.db`) |
| `DUCKDB_PERSIST_PATH` | Optional | Path for persisting materialized DuckDB tables |
| `DUCKDB_HTTP_HOST` | Optional | Host for the DuckDB HTTP adapter |
| `DUCKDB_HTTP_PORT` | Optional | Port for the DuckDB HTTP adapter |

### Semantic Layer

The `semantic-layer/` directory holds lightweight configuration consumed by the AI and query engine:

- **`context/context.md`**: Business/domain context injected into AI prompts
- **`joins.yml`**: Global join graph for cross-table filter injection
- **`models/sources.yml`**: Source-to-physical-table mappings and connection metadata

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run linting and type-checks
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Acknowledgments

- Bundled with [Vite](https://vitejs.dev)
- AI powered by [Vercel AI SDK](https://sdk.vercel.ai)
- Charts rendered with [Recharts](https://recharts.org)
- UI components from [Radix UI](https://radix-ui.com)
- Database integration with [DuckDB](https://duckdb.org)