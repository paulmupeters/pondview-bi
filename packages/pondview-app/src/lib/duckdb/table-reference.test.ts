import { describe, expect, test } from "bun:test";
import {
  buildExplorerInsertPayload,
  buildExplorerTableReference,
  isDefaultExplorerSchema,
} from "@/lib/duckdb/table-reference";

describe("buildExplorerTableReference", () => {
  test("keeps main schema hidden by default for display", () => {
    expect(
      buildExplorerTableReference({
        schema: "main",
        table: "unicorns",
      }),
    ).toBe("unicorns");
  });

  test("treats public as a default schema for display", () => {
    expect(
      buildExplorerTableReference({
        schema: "public",
        table: "keywords",
      }),
    ).toBe("keywords");
  });

  test("keeps non-main schemas qualified without a catalog", () => {
    expect(
      buildExplorerTableReference({
        schema: "analytics",
        table: "events",
      }),
    ).toBe("analytics.events");
  });

  test("fully qualifies attached tables when a catalog should be included", () => {
    expect(
      buildExplorerTableReference({
        catalog: "motherduck",
        schema: "main",
        table: "unicorns",
        includeCatalog: true,
        includeDefaultSchema: true,
      }),
    ).toBe("motherduck.main.unicorns");
  });
});

describe("isDefaultExplorerSchema", () => {
  test("treats main and public as default schemas", () => {
    expect(isDefaultExplorerSchema("main")).toBe(true);
    expect(isDefaultExplorerSchema("public")).toBe(true);
    expect(isDefaultExplorerSchema("analytics")).toBe(false);
  });
});

describe("buildExplorerInsertPayload", () => {
  test("uses catalog.schema.table for runtime inserts in the default schema", () => {
    expect(
      buildExplorerInsertPayload({
        catalog: "duck",
        schema: "main",
        table: "astronomy",
        source: "runtime",
      }),
    ).toEqual({
      reference: "duck.main.astronomy",
      catalog: "duck",
      catalogContext: null,
      source: "runtime",
    });
  });

  test("uses catalog.schema.table for connected-entry inserts in the default schema", () => {
    expect(
      buildExplorerInsertPayload({
        catalog: "motherduck",
        schema: "main",
        table: "unicorns",
        source: "connected-entry",
        dbIdentifier: "md:my_db",
      }),
    ).toEqual({
      reference: "motherduck.main.unicorns",
      catalog: "motherduck",
      catalogContext: null,
      dbIdentifier: "md:my_db",
      source: "connected-entry",
    });
  });

  test("uses catalog.schema.table for public schema connected-entry inserts", () => {
    expect(
      buildExplorerInsertPayload({
        catalog: "main_db",
        schema: "public",
        table: "keywords",
        source: "connected-entry",
      }),
    ).toEqual({
      reference: "main_db.public.keywords",
      catalog: "main_db",
      catalogContext: null,
      source: "connected-entry",
    });
  });

  test("uses schema.table in the current catalog for non-default schemas", () => {
    expect(
      buildExplorerInsertPayload({
        catalog: "duck",
        currentCatalog: "duck",
        schema: "analytics",
        table: "events",
        source: "runtime",
      }),
    ).toEqual({
      reference: "analytics.events",
      catalog: "duck",
      catalogContext: null,
      source: "runtime",
    });
  });

  test("adds catalog context for non-default schemas in an attached catalog", () => {
    expect(
      buildExplorerInsertPayload({
        catalog: "warehouse",
        currentCatalog: "duck",
        schema: "analytics",
        table: "events",
        source: "runtime",
      }),
    ).toEqual({
      reference: "analytics.events",
      catalog: "warehouse",
      catalogContext: "warehouse",
      source: "runtime",
    });
  });
});
