#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${DB_PATH:-$SCRIPT_DIR/pondview.duckdb}"
SOURCE_ALIAS="${SOURCE_ALIAS:-unicorns_demo}"

command -v duckdb >/dev/null 2>&1 || {
  echo "duckdb CLI is required and was not found on PATH." >&2
  exit 1
}

command -v pondview >/dev/null 2>&1 || {
  echo "pondview CLI is required and was not found on PATH." >&2
  exit 1
}

echo "Refreshing $DB_PATH"
duckdb "$DB_PATH" < "$SCRIPT_DIR/sql/import.sql"

echo
echo "Verifying imported tables"
duckdb "$DB_PATH" < "$SCRIPT_DIR/sql/verify.sql"

echo
echo "Attaching $DB_PATH to Pondview as '$SOURCE_ALIAS'"
pondview detach "$SOURCE_ALIAS" >/dev/null 2>&1 || true
pondview attach "$DB_PATH" --as "$SOURCE_ALIAS" --readonly

echo
echo "Attached sources"
pondview list-sources
