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

## Run Pondview locally

For most local use, install the Pondview CLI and let it start both the local UI and Bridge runtime:

```bash
npm install -g @pondview/cli
pondview start
```

Or run it without installing globally:

```bash
npx @pondview/cli start
```

The published CLI runs on Node.js 20 or newer. By default, `pondview start` serves the bundled app and bridge API at `http://127.0.0.1:17817`, then opens it in your browser.

Use a DuckDB file or project directory when you want Pondview to work against local files:

```bash
pondview start --database ./analytics.duckdb
pondview start --project-dir ./my-pondview-project
pondview attach ./warehouse.duckdb --as warehouse
pondview query "SELECT 42 AS answer"
```

See [Pondview CLI](/guide/cli) for commands, flags, and local project behavior.

## 1. Set up your AI key

Open **Settings** and configure:

- Your AI provider
- A model
- Your API key

If AI is not configured, chat cannot generate analyses for you.

Read more in [AI Provider Configuration](/guide/ai-provider-configuration).

## 2. Add data

You can start with whatever is easiest.

### Option A: Import a file

Good for quick starts and local analysis.

Supported uploads include:

- CSV
- Parquet
- XLSX
- XLS

Read more in [Uploads and Browser Storage](/guide/uploads-and-browser-storage).

### Option B: Connect a source

The current Connect Data flow supports:

- Postgres
- MySQL
- SQLite
- MotherDuck
- HTTPFS remote files such as S3, R2, GCS, and HTTPS URLs
- Quack remote DuckDB endpoints

Read more in [Connected Data Sources](/guide/connected-data-sources).

### Option C: Use data that already exists in DuckDB

If your workflow already uses a DuckDB database, Pondview can work with DuckDB-backed runtimes as well.

In practice this usually means one of these setups:

- You are using the local DuckDB/WASM runtime for browser-local work
- You are using the Pondview Bridge runtime with access to your DuckDB data

That makes it possible to work with data that already lives in DuckDB instead of re-importing everything as files.

## 3. Ask your first question

Once your AI settings and data are ready, open chat and try a simple question such as:

- "Show revenue by month"
- "What are my top 10 customers?"
- "Which products are growing fastest?"

Start simple. You can follow up and refine the result from there.

A good first workflow is:

1. Ask a business question in chat
2. Review the returned table, chart, or card
3. Check whether the result answers your question
4. Keep iterating with follow-up questions until it does

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

## 5. Tweak the visual

After you have a useful result, you can change how it is displayed.

Depending on the result, you can usually work with it as a:

- Table
- Chart
- Card

Use this step to make the output easier to read and share. For example, you might switch from a table to a chart, or simplify a single-value result into a card.

## 6. Save useful results to a dashboard

When you have something worth keeping, save it to a dashboard.

A typical flow is:

1. Create an analysis in chat
2. Refine it in manual mode if needed
3. Choose the visual you want
4. Add that visual to a dashboard
5. Open the dashboard and continue organizing your views

Read more in [Dashboards](/guide/dashboards).

## If something is not working

Common issues include:

- Missing or invalid AI provider settings
- Data source connected but tables are not available as expected
- Results are not running against the backend you expected

Helpful guides:

- [FAQ](/guide/faq)
- [Troubleshooting](/guide/troubleshooting)
- [AI Provider Configuration](/guide/ai-provider-configuration)
- [Connected Data Sources](/guide/connected-data-sources)

## Next steps

Once you have completed your first analysis, continue with:

- [Main Workflows](/guide/workflows)
- [Dashboards](/guide/dashboards)
- [Workspace Persistence](/guide/workspace-persistence)
