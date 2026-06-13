#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${DB_PATH:-$SCRIPT_DIR/unicorns_dwh.duckdb}"

command -v duckdb >/dev/null 2>&1 || {
  echo "duckdb CLI is required and was not found on PATH." >&2
  exit 1
}

echo "Refreshing $DB_PATH"
duckdb "$DB_PATH" < "$SCRIPT_DIR/sql/import.sql"

echo
echo "Verifying imported tables"
duckdb "$DB_PATH" < "$SCRIPT_DIR/sql/verify.sql"

echo
echo "Pondview project is ready. Open it with:"
echo "  pondview start"
