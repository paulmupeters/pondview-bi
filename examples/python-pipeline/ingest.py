import json
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any

import duckdb
import requests

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "pondview.duckdb"
BASE_URL = "https://dummyjson.com"


def fetch(endpoint: str) -> dict[str, Any]:
    response = requests.get(f"{BASE_URL}/{endpoint}", timeout=30)
    response.raise_for_status()
    return response.json()


def create_table_from_rows(
    con: duckdb.DuckDBPyConnection,
    table_name: str,
    rows: list[dict[str, Any]],
) -> None:
    with NamedTemporaryFile("w", encoding="utf-8", suffix=".json", delete=False) as file:
        json.dump(rows, file)
        temp_path = Path(file.name)

    try:
        con.execute(
            f"CREATE OR REPLACE TABLE {table_name} AS SELECT * FROM read_json_auto(?)",
            [str(temp_path)],
        )
    finally:
        temp_path.unlink(missing_ok=True)


def main() -> None:
    products = fetch("products?limit=100")["products"]
    carts = fetch("carts?limit=100")["carts"]
    users = fetch("users?limit=100")["users"]

    con = duckdb.connect(str(DB_PATH))
    try:
        create_table_from_rows(con, "raw_products", products)
        create_table_from_rows(con, "raw_carts", carts)
        create_table_from_rows(con, "raw_users", users)
    finally:
        con.close()

    print(f"Created {DB_PATH}")


if __name__ == "__main__":
    main()
