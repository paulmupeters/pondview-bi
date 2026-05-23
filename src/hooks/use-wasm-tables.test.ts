import { describe, expect, test } from "bun:test";
import {
  parseShowAllWasmTables,
  parseWasmTables,
} from "@/hooks/use-wasm-tables";

describe("parseWasmTables", () => {
  test("preserves the catalog name from information_schema", () => {
    expect(
      parseWasmTables([
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

  test("filters internal metadata schemas", () => {
    expect(
      parseWasmTables([
        {
          table_catalog: "duck",
          table_schema: "pondview",
          table_name: "dashboards",
          table_type: "BASE TABLE",
        },
        {
          table_catalog: "duck",
          table_schema: "pondview_exec",
          table_name: "orders",
          table_type: "VIEW",
        },
        {
          table_catalog: "duck",
          table_schema: "md_information_schema",
          table_name: "tables",
          table_type: "BASE TABLE",
        },
        {
          table_catalog: "duck",
          table_schema: "public",
          table_name: "customers",
          table_type: "BASE TABLE",
        },
      ]),
    ).toEqual([
      {
        catalog: "duck",
        schema: "public",
        name: "customers",
        type: "BASE TABLE",
      },
    ]);
  });
});

describe("parseShowAllWasmTables", () => {
  test("preserves attached catalog names from SHOW ALL TABLES rows", () => {
    expect(
      parseShowAllWasmTables([
        {
          database: "station",
          schema: "main",
          name: "measurements",
          type: "BASE TABLE",
          column_names: ["id", "name"],
          column_types: ["BIGINT", "VARCHAR"],
        },
      ]),
    ).toEqual([
      {
        catalog: "station",
        schema: "main",
        name: "measurements",
        type: "BASE TABLE",
        columns: [
          { name: "id", type: "BIGINT" },
          { name: "name", type: "VARCHAR" },
        ],
      },
    ]);
  });

  test("filters internal schemas from SHOW ALL TABLES rows", () => {
    expect(
      parseShowAllWasmTables([
        {
          database: "duck",
          schema: "pondview",
          name: "dashboards",
        },
        {
          database: "station",
          schema: "main",
          name: "measurements",
        },
      ]),
    ).toEqual([
      {
        catalog: "station",
        schema: "main",
        name: "measurements",
        type: "BASE TABLE",
      },
    ]);
  });
});
