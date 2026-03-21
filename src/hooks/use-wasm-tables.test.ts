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
});
