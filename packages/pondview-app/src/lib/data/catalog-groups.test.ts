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

  test("labels catalogs from stored connected sources", () => {
    expect(
      buildDataCatalogGroups(
        [
          {
            catalog: "warehouse",
            schema: "public",
            name: "orders",
            type: "BASE TABLE",
          },
        ],
        {
          sqlBackend: "bridge",
          currentCatalog: "memory",
          connectedSources: [
            { type: "postgres", attachAs: "warehouse", readOnly: true },
          ],
        },
      ),
    ).toEqual([
      {
        catalog: "warehouse",
        schema: "public",
        origin: {
          label: "Postgres",
          description: "Attached source · read-only",
        },
        tables: [{ catalog: "warehouse", name: "orders", type: "BASE TABLE" }],
      },
    ]);
  });

  test("uses stored quack selections when runtime metadata is empty", () => {
    expect(
      buildDataCatalogGroups([], {
        sqlBackend: "duckdb-wasm",
        connectedSources: [
          {
            type: "quack",
            attachAs: "test",
            schema: "main",
            tables: ["stations"],
            readOnly: false,
          },
        ],
      }),
    ).toEqual([
      {
        catalog: "test",
        schema: "main",
        origin: {
          label: "Quack remote DuckDB",
          description: "Attached source",
        },
        tables: [{ catalog: "test", name: "stations", type: "BASE TABLE" }],
      },
    ]);
  });

  test("deduplicates quack selections already returned by runtime metadata", () => {
    expect(
      buildDataCatalogGroups(
        [
          {
            catalog: "test",
            schema: "main",
            name: "stations",
            type: "BASE TABLE",
          },
        ],
        {
          sqlBackend: "duckdb-wasm",
          connectedSources: [
            {
              type: "quack",
              attachAs: "test",
              schema: "main",
              tables: ["stations"],
            },
          ],
        },
      ),
    ).toEqual([
      {
        catalog: "test",
        schema: "main",
        origin: {
          label: "Quack remote DuckDB",
          description: "Attached source",
        },
        tables: [{ catalog: "test", name: "stations", type: "BASE TABLE" }],
      },
    ]);
  });

  test("labels extension sources when catalog differs from attach alias", () => {
    expect(
      buildDataCatalogGroups(
        [
          {
            catalog: "postgres",
            schema: "public",
            name: "orders",
            type: "BASE TABLE",
          },
        ],
        {
          sqlBackend: "bridge",
          currentCatalog: "memory",
          connectedSources: [
            {
              type: "postgres",
              attachAs: "warehouse",
              schema: "public",
              tables: ["orders"],
              readOnly: true,
            },
          ],
        },
      ),
    ).toEqual([
      {
        catalog: "postgres",
        schema: "public",
        origin: {
          label: "Postgres",
          description: "Attached source · read-only",
        },
        tables: [{ catalog: "postgres", name: "orders", type: "BASE TABLE" }],
      },
    ]);
  });

  test("labels catalogs from bridge source aliases", () => {
    expect(
      buildDataCatalogGroups(
        [
          {
            catalog: "attached",
            schema: "main",
            name: "events",
            type: "BASE TABLE",
          },
        ],
        {
          sqlBackend: "bridge",
          currentCatalog: "memory",
          connectedSources: [{ type: "duckdb", alias: "attached" }],
        },
      ),
    ).toEqual([
      {
        catalog: "attached",
        schema: "main",
        origin: {
          label: "CLI attached database",
          description: "DuckDB file attached via CLI",
        },
        tables: [{ catalog: "attached", name: "events", type: "BASE TABLE" }],
      },
    ]);
  });

  test("labels remote DuckDB files when catalog differs from attach alias", () => {
    expect(
      buildDataCatalogGroups(
        [
          {
            catalog: "analytics",
            schema: "main",
            name: "events",
            type: "BASE TABLE",
          },
        ],
        {
          sqlBackend: "bridge",
          currentCatalog: "memory",
          connectedSources: [
            {
              type: "httpfs",
              attachAs: "remote_file",
              schema: "main",
              tables: ["events"],
              readOnly: true,
            },
          ],
        },
      ),
    ).toEqual([
      {
        catalog: "analytics",
        schema: "main",
        origin: {
          label: "CLI attached database",
          description: "Remote DuckDB file attached via CLI",
        },
        tables: [{ catalog: "analytics", name: "events", type: "BASE TABLE" }],
      },
    ]);
  });

  test("does not label unknown bridge-attached catalogs as bridge databases", () => {
    expect(
      buildDataCatalogGroups(
        [
          {
            catalog: "warehouse",
            schema: "public",
            name: "orders",
            type: "BASE TABLE",
          },
        ],
        {
          sqlBackend: "bridge",
          currentCatalog: "memory",
        },
      ),
    ).toEqual([
      {
        catalog: "warehouse",
        schema: "public",
        tables: [{ catalog: "warehouse", name: "orders", type: "BASE TABLE" }],
      },
    ]);
  });

  test("labels bridge primary databases from runtime context", () => {
    expect(
      buildDataCatalogGroups(
        [
          {
            catalog: "analytics",
            schema: "main",
            name: "metrics",
            type: "BASE TABLE",
          },
        ],
        {
          sqlBackend: "bridge",
          currentCatalog: "analytics",
          bridgeDatabaseMode: "file",
        },
      ),
    ).toEqual([
      {
        catalog: "analytics",
        schema: "main",
        origin: {
          label: "CLI primary database",
          description: "DuckDB file via CLI",
        },
        tables: [{ catalog: "analytics", name: "metrics", type: "BASE TABLE" }],
      },
    ]);
  });
});
