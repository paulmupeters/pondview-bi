import { describe, expect, test } from "bun:test";
import {
  buildDataCatalogGroups,
  DEFAULT_DATA_CATALOG,
} from "@/lib/data/catalog-groups";

describe("buildDataCatalogGroups", () => {
  test("separates matching schema names by catalog", () => {
    expect(
      buildDataCatalogGroups([
        {
          catalog: "runtime",
          schema: "main",
          name: "orders",
          type: "BASE TABLE",
        },
        {
          catalog: "attached",
          schema: "main",
          name: "orders",
          type: "BASE TABLE",
        },
      ]),
    ).toEqual([
      {
        catalog: "attached",
        schema: "main",
        tables: [{ catalog: "attached", name: "orders", type: "BASE TABLE" }],
      },
      {
        catalog: "runtime",
        schema: "main",
        tables: [{ catalog: "runtime", name: "orders", type: "BASE TABLE" }],
      },
    ]);
  });

  test("groups tables with the same catalog and schema", () => {
    expect(
      buildDataCatalogGroups([
        {
          catalog: "warehouse",
          schema: "analytics",
          name: "orders",
          type: "BASE TABLE",
        },
        {
          catalog: "warehouse",
          schema: "analytics",
          name: "customers",
          type: "VIEW",
        },
      ]),
    ).toEqual([
      {
        catalog: "warehouse",
        schema: "analytics",
        tables: [
          { catalog: "warehouse", name: "customers", type: "VIEW" },
          { catalog: "warehouse", name: "orders", type: "BASE TABLE" },
        ],
      },
    ]);
  });

  test("filters hidden schemas and catalogs", () => {
    expect(
      buildDataCatalogGroups([
        {
          catalog: "warehouse",
          schema: "pondview",
          name: "internal",
          type: "BASE TABLE",
        },
        {
          catalog: "md_information_schema",
          schema: "main",
          name: "snapshots",
          type: "BASE TABLE",
        },
        {
          catalog: "warehouse",
          schema: "public",
          name: "orders",
          type: "BASE TABLE",
        },
      ]),
    ).toEqual([
      {
        catalog: "warehouse",
        schema: "public",
        tables: [{ catalog: "warehouse", name: "orders", type: "BASE TABLE" }],
      },
    ]);
  });

  test("normalizes empty catalogs and sorts groups by catalog then schema", () => {
    expect(
      buildDataCatalogGroups([
        { catalog: "zeta", schema: "main", name: "b", type: "BASE TABLE" },
        { catalog: "", schema: "main", name: "local", type: "BASE TABLE" },
        { catalog: "alpha", schema: "sales", name: "c", type: "BASE TABLE" },
        { catalog: "alpha", schema: "main", name: "a", type: "BASE TABLE" },
      ]),
    ).toEqual([
      {
        catalog: "alpha",
        schema: "main",
        tables: [{ catalog: "alpha", name: "a", type: "BASE TABLE" }],
      },
      {
        catalog: "alpha",
        schema: "sales",
        tables: [{ catalog: "alpha", name: "c", type: "BASE TABLE" }],
      },
      {
        catalog: DEFAULT_DATA_CATALOG,
        schema: "main",
        tables: [
          {
            catalog: DEFAULT_DATA_CATALOG,
            name: "local",
            type: "BASE TABLE",
          },
        ],
      },
      {
        catalog: "zeta",
        schema: "main",
        tables: [{ catalog: "zeta", name: "b", type: "BASE TABLE" }],
      },
    ]);
  });
});
