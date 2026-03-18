import { describe, expect, test } from "bun:test";
import {
  getConnectedEntryCatalog,
  getConnectedEntryDisplayName,
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
});
