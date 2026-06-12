import os
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("DB_PATH", ROOT / "carts_dwh.duckdb"))
SQL_FILES = [ROOT / "sql/01_staging.sql", ROOT / "sql/02_marts.sql"]


def main() -> None:
    con = duckdb.connect(str(DB_PATH))
    try:
        for sql_file in SQL_FILES:
            sql = sql_file.read_text()
            con.execute(sql)
    finally:
        con.close()

    print("Transformations complete")


if __name__ == "__main__":
    main()
