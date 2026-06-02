# What Pondview Is

Pondview is an AI-assisted analytics workspace for exploring data and creating visuals.

It is designed to help you go from a business question to something useful quickly. So you can easily:

- Ask a question in natural language
- Review the result as a table, chart, or card
- Refine the data/visual
- Save the result to a dashboard

## What Pondview helps you do

You can use Pondview to:

- Explore business data without starting from scratch in SQL
- Import files such as CSV, Parquet, XLSX, and XLS
- Connect supported sources such as Postgres, MySQL, SQLite, and MotherDuck
- Work locally with browser-based DuckDB or with the standard DuckDB runtime
- Build dashboards from the analyses that matter

## Built on DuckDB

Pondview is built on top of [DuckDB](https://duckdb.org/), the fast in-process analytical database. That means you do not need a data warehouse or a running server to get going, Pondview can query your data directly.

It also means you can point Pondview at an existing DuckDB file and start creating visuals from it right away. Put your `.duckdb` file in a folder, run `pondview start` from that folder, and Pondview detects it automatically when there is a single file at the folder root. You can also open a specific file explicitly:

```bash
pondview start --database path/to/your.duckdb
```

From there you can ask questions, build charts, and save dashboards against the tables already in your file.

## A simple mental model

The easiest way to think about Pondview is:

- **Chat** use natural language to get to a first answer quickly
- **SQL** view and edit the underlying query at any time
- **Dashboards** save visuals and keep the results you want to revisit

## Who this is for

Pondview is a good fit if you want to:

- Ask analytical questions in plain English
- Work with local files or connected data sources
- Move from exploration to reusable reporting in the same workspace

You do not need to understand DuckDB internals or the full runtime architecture before getting value from the app. Continue with the [First steps](/guide/getting-started) when you are ready to try the product flow.
