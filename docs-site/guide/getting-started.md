# Getting Started

This guide gets you from a fresh install to your first useful result.

## The shortest path

For most local use, start here:

```bash
npm install -g @pondview/cli
pondview start
```

Or run it without installing globally:

```bash
npx @pondview/cli start
```

The published CLI runs on Node.js 20 or newer. `pondview start` serves the local app and Bridge API at `http://127.0.0.1:17817`, then opens Pondview in your browser.

Once the app opens:

1. Add an AI key in **Settings** if you want to use chat
2. Import data, connect a source, or open an existing DuckDB file
3. Ask a question in chat, or write SQL manually
4. Refine the result
5. Save useful results to a dashboard

### Already have a DuckDB file?

If your tables already live in a `.duckdb` file, that is usually the fastest way in:

```bash
cd path/to/folder-with-your-duckdb-file
pondview start
```

On first launch, Pondview detects `.duckdb` files in that folder and offers to open yours. When there is exactly one `.duckdb` file in the folder, Pondview selects it automatically. If you have several, pick the one you want on the startup screen.

You can also point at a specific file:

```bash
pondview start --database ./analytics.duckdb
```

Only files in the project folder root are detected (not nested subfolders). After the database is open, you can query existing tables immediately without importing CSVs or connecting another source.

### Starting without a DuckDB file

1. Run `pondview start`
2. Add an AI key in **Settings** if you want chat-assisted analysis
3. Import data or connect a source
4. Ask a question in chat, or start from SQL
5. Refine the result manually if needed
6. Save the result to a dashboard

## Before you start

You will need:

- Access to the Pondview app
- Some data to work with
- An API key for the AI provider you want to use, if you want chat-assisted analysis

## What works without AI?

AI is only required for the chat workflow. Without an AI key, you can still:

- Start Pondview locally
- Import CSV or Parquet files into DuckDB WASM
- Open an existing DuckDB file through the CLI
- Run and edit SQL manually
- Review tables, charts, and cards created from SQL workflows
- Save useful results to dashboards

Add an AI key when you want Pondview to generate analyses from natural-language prompts.

## Run Pondview locally

When you run `pondview start` from a folder, Pondview scans that folder for `.duckdb` files and uses them as your data source on first launch. You can also pass flags explicitly:

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

### Option C: Use an existing DuckDB file (fastest with the CLI)

If you already have a `.duckdb` file with your tables, use the [DuckDB file quick start](#already-have-a-duckdb-file) above: run `pondview start` from that folder and open the detected database.

This uses the Pondview Bridge runtime, so queries run against your file directly. You do not need to re-import the same data as CSV or Parquet.

For browser-only work without the CLI, you can still use the DuckDB/WASM runtime, but opening an existing file on disk is simplest through `pondview start`.

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

## 4. Edit the SQL when you want more control

Chat is usually the fastest way to get a first result, but it does not have to be the final version.

Every analysis cell includes a **SQL panel** where you can view and edit the query. You can also edit the **chart config** when you want to:

- Inspect the generated analysis more directly
- Adjust the query or result
- Choose a clearer visual before saving

A reliable pattern is:

1. Start in chat
2. Review the first answer
3. Edit the SQL in the SQL panel
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
2. Edit the SQL or tweak the visual if needed
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
