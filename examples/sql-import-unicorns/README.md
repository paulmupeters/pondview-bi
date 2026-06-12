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
- `mart_unicorns_joined_by_year`

## Run the import

This example assumes the `duckdb` and `pondview` CLIs are installed.

```bash
./import-unicorns.sh
```

The script refreshes `pondview.duckdb`, verifies the tables, and attaches the
database to Pondview as a read-only source named `unicorns_demo`.

You can override the output database path or Pondview source alias:

```bash
DB_PATH=./custom-unicorns.duckdb SOURCE_ALIAS=unicorns ./import-unicorns.sh
```

## Manual commands

Run only the DuckDB import:

```bash
duckdb pondview.duckdb < sql/import.sql
duckdb pondview.duckdb < sql/verify.sql
```

Attach the database to Pondview:

```bash
pondview attach pondview.duckdb --as unicorns_demo --readonly
pondview list-sources
```

Then query it in Pondview with fully qualified table references such as:

```sql
SELECT *
FROM unicorns_demo.main.mart_unicorns_by_country
ORDER BY total_valuation_billions DESC;
```
