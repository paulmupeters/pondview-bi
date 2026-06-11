# Python API to DuckDB pipeline

This example fetches sample ecommerce data from
[DummyJSON](https://dummyjson.com), loads it into `pondview.duckdb`, and builds
a few analysis-ready mart tables.

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

con = duckdb.connect("pondview.duckdb", read_only=True)
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

To inspect the database in Pondview, start the app or bridge runtime from the
repository root and attach this file:

```bash
bun run bridge -- attach examples/python-pipeline/pondview.duckdb --as pipeline
```
