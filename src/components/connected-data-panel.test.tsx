import { describe, expect, test } from "bun:test";
import {
  getConnectedEntryCatalog,
  getConnectedEntryDisplayName,
  getSampleDataActionState,
  getVisibleConnectedEntryTables,
  shouldShowConnectedEntry,
  validateConnectedEntry,
} from "@/components/connected-data-panel";
import type { ConnectedTable } from "@/lib/connected-tables";
import { buildExplorerInsertPayload } from "@/lib/duckdb/table-reference";

describe("connected source explorer helpers", () => {
  test("uses the canonical DuckDB alias for reserved postgres names", () => {
    const entry: ConnectedTable = {
      type: "postgres",
      databasePath:
        "host=db.example.test port=5432 user=admin password=secret dbname=main",
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

  test("treats entries with no visible selected tables as empty", () => {
    const entry: ConnectedTable = {
      type: "motherduck",
      databasePath: "md:my_db",
      attachAs: "motherduck",
      schema: "main",
      tables: [],
    };

    expect(getVisibleConnectedEntryTables(entry)).toEqual([]);
    expect(shouldShowConnectedEntry(entry, new Set())).toBe(false);
  });

  test("keeps only user-facing selected tables", () => {
    const entry: ConnectedTable = {
      type: "postgres",
      databasePath:
        "host=db.example.test port=5432 user=admin password=secret dbname=main",
      attachAs: "main",
      schema: "public",
      tables: ["keywords", "md_information_schema.snapshots"],
    };

    expect(getVisibleConnectedEntryTables(entry)).toEqual(["keywords"]);
    expect(shouldShowConnectedEntry(entry, new Set())).toBe(true);
  });

  test("marks remote connected entries as disconnected when validation fails", async () => {
    const entry: ConnectedTable = {
      type: "postgres",
      databasePath:
        "host=db.example.test port=5432 user=admin password=secret dbname=main",
      attachAs: "main",
      schema: "public",
      tables: ["keywords"],
    };

    await expect(
      validateConnectedEntry(entry, {
        sqlBackend: "bridge",
        runRemoteSql: async () => {
          throw new Error("connection failed");
        },
      }),
    ).resolves.toEqual({ status: "disconnected" });
  });

  test("marks local duckdb entries as ready without remote validation", async () => {
    const entry: ConnectedTable = {
      type: "duckdb",
      databasePath: "/tmp/local.duckdb",
      schema: "main",
      tables: ["unicorns"],
    };

    await expect(
      validateConnectedEntry(entry, {
        sqlBackend: "bridge",
        runRemoteSql: async () => {
          throw new Error("should not be called");
        },
      }),
    ).resolves.toEqual({ status: "ready" });
  });

  test("marks remote saved entries as disconnected in wasm mode", async () => {
    const entry: ConnectedTable = {
      type: "postgres",
      databasePath:
        "host=db.example.test port=5432 user=admin password=secret dbname=main",
      attachAs: "main",
      schema: "public",
      tables: ["keywords"],
    };

    await expect(
      validateConnectedEntry(entry, {
        sqlBackend: "duckdb-wasm",
      }),
    ).resolves.toEqual({ status: "disconnected" });
  });

  test("shows the add sample data action only when a runtime section is empty", () => {
    expect(
      getSampleDataActionState({
        hasTables: false,
        isLoading: false,
        error: null,
      }),
    ).toEqual({
      isLoading: false,
      error: null,
    });

    expect(
      getSampleDataActionState({
        hasTables: true,
        isLoading: false,
        error: null,
      }),
    ).toBeNull();
  });

  test("preserves loading and error state for sample data actions", () => {
    expect(
      getSampleDataActionState({
        hasTables: false,
        isLoading: true,
        error: null,
      }),
    ).toEqual({
      isLoading: true,
      error: null,
    });

    expect(
      getSampleDataActionState({
        hasTables: false,
        isLoading: false,
        error: "Failed to add sample data.",
      }),
    ).toEqual({
      isLoading: false,
      error: "Failed to add sample data.",
    });
  });
});
