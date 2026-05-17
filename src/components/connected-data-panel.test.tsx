import { describe, expect, test } from "bun:test";
import {
  connectedEntriesToExplorerTables,
  getConnectedEntryCatalog,
  getConnectedEntryDisplayName,
  getExplorerTableDisplayLabel,
  getRemoteRuntimeDisplayLabel,
  getSampleDataActionState,
  getVisibleConnectedEntryTables,
  resolveActiveRuntimeExplorer,
  shouldShowConnectedEntry,
  validateConnectedEntry,
} from "@/components/connected-data-panel";
import type { ConnectedTable } from "@/lib/connected-tables";
import { buildExplorerInsertPayload } from "@/lib/duckdb/table-reference";

describe("connected source explorer helpers", () => {
  test("uses only live remote runtime tables when a remote backend is active", () => {
    expect(
      resolveActiveRuntimeExplorer({
        sqlBackend: "bridge",
        groupedRemoteTables: [
          { catalog: "warehouse", schema: "public", tables: ["orders"] },
        ],
        groupedWasmTables: [{ catalog: "", schema: "main", tables: ["local"] }],
      }),
    ).toEqual({
      target: "remote",
      groups: [{ catalog: "warehouse", schema: "public", tables: ["orders"] }],
    });
  });

  test("uses only live wasm tables when wasm is active", () => {
    expect(
      resolveActiveRuntimeExplorer({
        sqlBackend: "duckdb-wasm",
        groupedRemoteTables: [
          { catalog: "warehouse", schema: "public", tables: ["orders"] },
        ],
        groupedWasmTables: [{ catalog: "", schema: "main", tables: ["local"] }],
      }),
    ).toEqual({
      target: "wasm",
      groups: [{ catalog: "", schema: "main", tables: ["local"] }],
    });
  });

  test("renders runtime rows as direct table references without separate catalog headings", () => {
    expect(
      getExplorerTableDisplayLabel({
        catalog: "motherduck",
        schema: "main",
        table: "unicorns",
      }),
    ).toBe("motherduck.unicorns");

    expect(
      getExplorerTableDisplayLabel({
        catalog: "warehouse",
        schema: "analytics",
        table: "orders",
      }),
    ).toBe("warehouse.analytics.orders");

    expect(
      getExplorerTableDisplayLabel({
        catalog: "",
        schema: "main",
        table: "local_table",
      }),
    ).toBe("local_table");
  });

  test("labels bridge runtime with the connected database filename when available", () => {
    expect(
      getRemoteRuntimeDisplayLabel({
        host: "127.0.0.1",
        port: 17817,
        database: {
          mode: "file",
          id: "database-hash",
          name: "stations.duckdb",
        },
      }),
    ).toBe("stations.duckdb (127.0.0.1)");

    expect(
      getRemoteRuntimeDisplayLabel({
        host: "127.0.0.1",
        port: 17817,
        database: {
          mode: "memory",
          id: "memory",
        },
      }),
    ).toBe("Bridge (127.0.0.1)");
  });

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

  test("maps quack connected entries into wasm explorer tables", () => {
    expect(
      connectedEntriesToExplorerTables([
        {
          type: "quack",
          connectionId: "quack:test",
          databaseName: "quack:localhost",
          attachAs: "test",
          schema: "main",
          tables: ["stations"],
        },
        {
          type: "postgres",
          connectionId: "pg:warehouse",
          attachAs: "warehouse",
          schema: "public",
          tables: ["orders"],
        },
      ]),
    ).toEqual([{ catalog: "test", schema: "main", name: "stations" }]);
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
