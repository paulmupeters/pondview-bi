# SQL import with DuckDB httpfs

This example imports Pondview's built-in unicorn sample dataset with a
SQL-only DuckDB script. It uses DuckDB's `httpfs` extension to read the same
remote CSV used by the **Add sample dataset** button in Pondview:

```sql
https://data.pondview.app/unicorns.csv
```

The import creates:

- `unicorns`, matching the raw sample dataset shape used by Pondview
- `unicorns_enriched`, with normalized column names and parsed valuations
- `mart_unicorns_by_country`
- `mart_unicorns_by_industry`
- `mart_unicorns_joined_by_year`, grouped by year and country

## Run the import

This example assumes the `duckdb` and `pondview` CLIs are installed.

```bash
./import-unicorns.sh
```

The script refreshes `unicorns_dwh.duckdb` and verifies the tables. The
committed Pondview project metadata uses `unicorns_dwh.duckdb` as the local
DuckDB runtime.

## Manual commands

Run only the DuckDB import:

```bash
duckdb unicorns_dwh.duckdb < sql/import.sql
duckdb unicorns_dwh.duckdb < sql/verify.sql
```

To inspect the database in Pondview, run the import and start the local app:

```bash
./import-unicorns.sh
pondview start
```

Then query it in Pondview:

```sql
SELECT *
FROM mart_unicorns_by_country
ORDER BY total_valuation_billions DESC;
```
