import { describe, expect, test } from "bun:test";
import {
  getConnectedEntryCatalog,
  getConnectedEntryDisplayName,
  shouldShowConnectedEntry,
} from "@/components/connected-data-panel";
import type { ConnectedTable } from "@/lib/connected-tables";
import { buildExplorerInsertPayload } from "@/lib/duckdb/table-reference";

describe("connected source explorer helpers", () => {
  test("uses the canonical DuckDB alias for reserved postgres names", () => {
    const entry: ConnectedTable = {
      type: "postgres",
      databasePath:
        "host=167.235.227.188 port=5432 user=admin password=secret dbname=main",
      attachAs: "main",
      schema: "public",
      tables: ["keywords"],
    };

    const catalog = getConnectedEntryCatalog(entry);

    expect(catalog).toBe("main_db");
    expect(
      buildExplorerInsertPayload({
        catalog,
        schema: entry.schema,
        table: "keywords",
        source: "connected-entry",
      }).reference,
    ).toBe("main_db.keywords");
    expect(getConnectedEntryDisplayName(entry)).toBe("main_db (postgres)");
  });

  test("keeps ordinary motherduck aliases unchanged", () => {
    const entry: ConnectedTable = {
      type: "motherduck",
      databasePath: "md:my_db",
      attachAs: "motherduck",
      schema: "main",
      tables: ["unicorns"],
    };

    const catalog = getConnectedEntryCatalog(entry);

    expect(catalog).toBe("motherduck");
    expect(
      buildExplorerInsertPayload({
        catalog,
        schema: entry.schema,
        table: "unicorns",
        source: "connected-entry",
      }).reference,
    ).toBe("motherduck.unicorns");
    expect(getConnectedEntryDisplayName(entry)).toBe("motherduck (motherduck)");
  });

  test("hides connected entries already visible in remote runtime catalogs", () => {
    const entry: ConnectedTable = {
      type: "motherduck",
      databasePath: "md:my_db",
      attachAs: "motherduck",
      schema: "main",
      tables: ["unicorns"],
    };

    expect(shouldShowConnectedEntry(entry, new Set(["motherduck"]))).toBe(
      false,
    );
    expect(shouldShowConnectedEntry(entry, new Set(["main_db"]))).toBe(true);
  });

  test("hides connected entries that point at metadata schemas", () => {
    const entry: ConnectedTable = {
      type: "motherduck",
      databasePath: "md:my_db",
      attachAs: "motherduck",
      schema: "md_information_schema",
      tables: ["recent_queries"],
    };

    expect(shouldShowConnectedEntry(entry, new Set())).toBe(false);
  });

  test("hides connected entries with fully qualified metadata table names", () => {
    const entry: ConnectedTable = {
      type: "motherduck",
      databasePath: "md:my_db",
      attachAs: "motherduck",
      tables: ["md_information_schema.database_snapshots"],
    };

    expect(shouldShowConnectedEntry(entry, new Set())).toBe(false);
  });
});
