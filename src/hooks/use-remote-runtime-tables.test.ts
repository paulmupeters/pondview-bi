import { describe, expect, test } from "bun:test";
import {
  mapInformationSchemaRows,
  mapShowAllTablesRows,
  mergeRuntimeTables,
} from "@/hooks/use-remote-runtime-tables";

describe("Bridge table metadata mapping", () => {
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

  test("merges SHOW ALL TABLES fallback rows without duplicating metadata rows", () => {
    expect(
      mergeRuntimeTables(
        [
          {
            catalog: "pondview",
            schema: "main",
            name: "raw_carts",
            type: "BASE TABLE",
          },
        ],
        [
          {
            catalog: "pondview",
            schema: "main",
            name: "raw_carts",
            type: "BASE TABLE",
          },
          {
            catalog: "pondview",
            schema: "main",
            name: "raw_products",
            type: "BASE TABLE",
          },
        ],
      ),
    ).toEqual([
      {
        catalog: "pondview",
        schema: "main",
        name: "raw_carts",
        type: "BASE TABLE",
      },
      {
        catalog: "pondview",
        schema: "main",
        name: "raw_products",
        type: "BASE TABLE",
      },
    ]);
  });

  test("filters internal metadata schemas from information_schema rows", () => {
    expect(
      mapInformationSchemaRows([
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

  test("filters internal metadata schemas from SHOW ALL TABLES fallback rows", () => {
    expect(
      mapShowAllTablesRows([
        {
          database: "motherduck",
          schema: "pondview",
          name: "dashboards",
        },
        {
          database: "motherduck",
          schema: "pondview_exec",
          name: "orders",
        },
        {
          database: "motherduck",
          schema: "md_information_schema",
          name: "tables",
        },
        {
          database: "motherduck",
          schema: "public",
          name: "unicorns",
        },
      ]),
    ).toEqual([
      {
        catalog: "motherduck",
        schema: "public",
        name: "unicorns",
        type: "BASE TABLE",
      },
    ]);
  });
});
