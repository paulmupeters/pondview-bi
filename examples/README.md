# Pondview examples

Small runnable examples for creating DuckDB data that can be explored in
Pondview.

## SQL import: unicorns

[`sql-import-unicorns`](./sql-import-unicorns/) imports Pondview's built-in
unicorn sample dataset with DuckDB SQL and the `httpfs` extension. It creates a
local `pondview.duckdb` file, verifies the imported tables, and attaches the
database to Pondview with the Pondview CLI.

Use this example when you want a SQL-first import script that mirrors the app's
sample data.

## Python pipeline

[`python-pipeline`](./python-pipeline/) fetches sample ecommerce API data,
stores it in DuckDB, and builds staging and mart tables with SQL transforms.

Use this example when you want a lightweight Python-to-DuckDB workflow.
