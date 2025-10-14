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

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **UI Components**: Radix UI, Tailwind CSS
- **Charts**: Recharts for data visualization
- **AI**: Vercel AI SDK with OpenAI GPT-5 Nano
- **Database**: DuckDB, SQLite, MotherDuck
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
# Create .env.local file
OPENAI_API_KEY=your_openai_api_key
MOTHERDUCK_TOKEN=your_motherduck_token  # Optional, for MotherDuck integration
DATABASE_PATH=./sqlite.db  # Optional, custom SQLite path
```

4. Run the development server:
```bash
# Using Bun
bun dev

# Or using npm
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

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
- **Custom Schemas**: Connect to specific database schemas

## Project Structure

```
bi-chat/
├── ai/                    # AI-related functionality
│   ├── agents/           # AI agents
│   ├── artifacts/        # Interactive artifacts (SQL execution)
│   ├── tools/            # AI tools (SQL execution, schema analysis)
│   └── prompts.ts        # AI prompts and instructions
├── app/                  # Next.js app directory
│   ├── api/             # API routes
│   ├── [chatId]/        # Dynamic chat pages
│   └── view-data/       # Data viewing pages
├── components/           # React components
│   ├── ui/              # Reusable UI components
│   ├── chat.tsx         # Main chat interface
│   ├── dynamic-chart.tsx # Chart visualization
│   └── sql-*.tsx        # SQL-related components
├── lib/                  # Utility libraries
│   ├── db/              # Database configuration
│   ├── duckdb/          # DuckDB integration
│   └── utils.ts         # Utility functions
└── hooks/               # Custom React hooks
```

## Development

### Available Scripts

```bash
# Development
bun dev          # Start development server
bun build        # Build for production
bun start        # Start production server

# Code Quality
bun run lint     # Run Biome linter
bun run format   # Format code with Biome

# Database
bun run drizzle:generate  # Generate database migrations
bun run drizzle:push     # Push schema changes
```

### Key Components

- **Chat Interface** (`components/chat.tsx`): Main conversational interface
- **SQL Execution** (`ai/tools/execute-sql-tool.ts`): AI tool for running SQL queries
- **Chart Generation** (`ai/tools/generate-chart-config-tool.ts`): AI-powered chart configuration
- **Dynamic Charts** (`components/dynamic-chart.tsx`): Interactive chart rendering
- **Database Integration** (`lib/duckdb/`): DuckDB and database utilities

## Configuration

### Environment Variables

- `OPENAI_API_KEY`: Required for AI functionality
- `MOTHERDUCK_TOKEN`: Optional, for MotherDuck cloud integration
- `DATABASE_PATH`: Optional, custom SQLite database path

### AI Configuration

The AI system uses specialized prompts and tools:

- **Analysis Prompt**: Configured for data analysis and SQL generation
- **SQL Execution Tool**: Handles query execution with error handling
- **Schema Analysis Tool**: Analyzes table structures for better query generation
- **Chart Generation Tool**: Creates appropriate chart configurations

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Acknowledgments

- Built with [Next.js](https://nextjs.org)
- AI powered by [Vercel AI SDK](https://sdk.vercel.ai)
- Charts rendered with [Recharts](https://recharts.org)
- UI components from [Radix UI](https://radix-ui.com)
- Database integration with [DuckDB](https://duckdb.org)