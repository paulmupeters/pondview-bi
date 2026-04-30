# Getting Started

This guide covers the fastest path to your first useful result in Pondview.

## The shortest path

1. Add an AI key in **Settings**
2. Import data or connect a source
3. Ask a question in chat
4. Refine the result in manual mode if needed
5. Save the result to a dashboard

## Before you start

You will need:

- Access to the Pondview app
- An API key for the AI provider you want to use
- Some data to work with

## 1. Set up your AI key

Open **Settings** and configure:

- Your AI provider
- A model
- Your API key

If AI is not configured, chat cannot generate analyses for you.

If you are not sure where to do this, see the technical note on [AI Provider Configuration](/guide/ai-provider-configuration).

## 2. Add data

You can start with whatever is easiest.

### Option A: Import a file

Good for quick starts and local analysis.

Supported uploads include:

- CSV
- Parquet
- XLSX
- XLS

### Option B: Connect a source

The current Connect Data flow supports:

- Postgres
- MySQL
- SQLite
- MotherDuck

### Option C: Use data that already exists in DuckDB

If your workflow already uses a DuckDB database, Pondview can work with DuckDB-backed runtimes as well.

In practice this usually means one of these setups:

- You are using the local DuckDB/WASM runtime for browser-local work
- You are using a remote DuckDB runtime or Bridge that already has access to your DuckDB data

That makes it possible to work with data that already lives in DuckDB instead of re-importing everything as files.

If you need the lower-level runtime details, see [SQL Runtime Backends](/guide/sql-runtime-backends) and [DuckDB Usage Overview](/guide/duckdb-usage-overview).

## 3. Ask your first question

Once your AI settings and data are ready, open chat and try a simple question such as:

- "Show revenue by month"
- "What are my top 10 customers?"
- "Which products are growing fastest?"

Start simple. You can follow up and refine the result from there.

## 4. Switch to manual mode when you want more control

Chat is usually the fastest way to get a first result, but it does not have to be the final result.

Use **manual mode** when you want to:

- Inspect the generated analysis more directly
- Adjust the query or result
- Choose a clearer visual before saving

A reliable pattern is:

1. Start in AI/chat mode
2. Review the first answer
3. Switch to manual mode
4. Refine the output until it looks right

## 5. Save useful results to a dashboard

When you have something worth keeping, save it to a dashboard.

This is the easiest way to turn one-off exploration into something you can revisit and share.

For the full workflow, continue with [Main Workflows](/user/workflows).
