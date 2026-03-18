import { describe, expect, test } from "bun:test";
import {
  mapInformationSchemaRows,
  mapShowAllTablesRows,
} from "@/hooks/use-duckdb-http-tables";

describe("DuckDB HTTP table metadata mapping", () => {
  test("preserves catalog names from information_schema", () => {
    expect(
      mapInformationSchemaRows([
        {
          table_catalog: "duck",
          table_schema: "main",
          table_name: "astronomy",
          table_type: "BASE TABLE",
        },
      ]),
    ).toEqual([
      {
        catalog: "duck",
        schema: "main",
        name: "astronomy",
        type: "BASE TABLE",
      },
    ]);
  });

  test("preserves catalog names from SHOW ALL TABLES fallback rows", () => {
    expect(
      mapShowAllTablesRows([
        {
          database: "motherduck",
          schema: "main",
          name: "unicorns",
        },
      ]),
    ).toEqual([
      {
        catalog: "motherduck",
        schema: "main",
        name: "unicorns",
        type: "BASE TABLE",
      },
    ]);
  });
});
