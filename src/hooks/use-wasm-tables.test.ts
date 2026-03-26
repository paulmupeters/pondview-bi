import { describe, expect, test } from "bun:test";
import { parseWasmTables } from "@/hooks/use-wasm-tables";

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
