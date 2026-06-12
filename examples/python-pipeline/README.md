# Python API to DuckDB pipeline

This example fetches sample ecommerce data from
[DummyJSON](https://dummyjson.com), loads it into `carts_dwh.duckdb`, and builds
a few analysis-ready mart tables.

This example assumes the `uv` and `pondview` CLIs are installed.

Run the full pipeline and attach the resulting database to Pondview:

```bash
./run-pipeline.sh
```

The script installs Python dependencies, runs ingestion, runs transformations,
verifies the generated tables, and writes Pondview project metadata that uses
`carts_dwh.duckdb` as the local DuckDB runtime.

You can override the output database path:

```bash
DB_PATH=./custom-pipeline.duckdb ./run-pipeline.sh
```

## Manual commands

Run the commands from this directory:

```bash
# Install dependencies
uv sync

# Run ingestion
uv run python ingest.py

# Run transformations
uv run python transform.py
```

Verify the output:

```bash
uv run python - <<'PY'
import duckdb

con = duckdb.connect("carts_dwh.duckdb", read_only=True)
for table in con.sql("SHOW TABLES").fetchall():
    print(table[0])
PY
```

You should see raw, staging, and mart tables, including:

- `raw_products`
- `stg_cart_items`
- `mart_revenue_by_category`
- `mart_revenue_by_country`
- `mart_top_products`

To inspect the database in Pondview, run the pipeline and start the local app:

```bash
./run-pipeline.sh
pondview start
```
