#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${DB_PATH:-$SCRIPT_DIR/carts_dwh.duckdb}"
export DB_PATH

command -v uv >/dev/null 2>&1 || {
  echo "uv is required and was not found on PATH." >&2
  exit 1
}

cd "$SCRIPT_DIR"

echo "Installing Python dependencies"
uv sync

echo
echo "Running ingestion"
uv run python ingest.py

echo
echo "Running transformations"
uv run python transform.py

echo
echo "Verifying generated tables"
uv run python - <<'PY'
import duckdb

import os

con = duckdb.connect(os.environ["DB_PATH"], read_only=True)
try:
    for table_name, row_count in con.sql(
        """
        SELECT table_name, estimated_size
        FROM duckdb_tables()
        WHERE database_name = current_database()
        ORDER BY table_name
        """
    ).fetchall():
        print(f"{table_name}: {row_count} rows")
finally:
    con.close()
PY

echo
echo "Pondview project is ready. Open it with:"
echo "  pondview start"
