export const CONNECTED_TABLES_STORAGE_KEY = "connectedTables";

export const CONNECTED_TABLES_UPDATED_EVENT = "connectedTablesUpdated";

export type ConnectedTable = {
  type: string;
  databasePath: string;
  // For backward compatibility keep `table` optional now
  table?: string;
  // New: allow storing schema instead of table
  schema?: string;
  // Optional list of selected tables within a schema
  tables?: string[];
  description?: string;
};

const isClient = typeof window !== "undefined";

export function readConnectedTablesFromStorage(): ConnectedTable[] {
  if (!isClient) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(CONNECTED_TABLES_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as ConnectedTable[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is ConnectedTable => {
      if (typeof entry !== "object" || entry === null) return false;
      if (typeof (entry as any).type !== "string") return false;
      if (typeof (entry as any).databasePath !== "string") return false;
      // Accept either table or schema for compatibility
      const hasTable = typeof (entry as any).table === "string";
      const hasSchema = typeof (entry as any).schema === "string";
      const maybeTables = (entry as any).tables;
      const tablesValid =
        maybeTables === undefined ||
        (Array.isArray(maybeTables) &&
          maybeTables.every((t) => typeof t === "string"));
      return tablesValid && (hasTable || hasSchema);
    });
  } catch (error) {
    console.error("Failed to read connected tables from storage", error);
    return [];
  }
}

export function writeConnectedTablesToStorage(tables: ConnectedTable[]) {
  if (!isClient) {
    return;
  }

  try {
    window.localStorage.setItem(
      CONNECTED_TABLES_STORAGE_KEY,
      JSON.stringify(tables),
    );
    window.dispatchEvent(new Event(CONNECTED_TABLES_UPDATED_EVENT));
  } catch (error) {
    console.error("Failed to write connected tables to storage", error);
  }
}

export async function appendConnectedTable(
  entry: ConnectedTable
): Promise<void> {
  if (!isClient) {
    return;
  }

  const existing = readConnectedTablesFromStorage();
  writeConnectedTablesToStorage([...existing, entry]);

  // Update semantic layer sources.yml
  try {
    const response = await fetch("/api/semantic-layer/sources", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        table: entry.table,
        schema: entry.schema,
        tables: entry.tables,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error(
        "[Semantic Layer] Failed to update sources:",
        errorData.error || response.statusText
      );
    } else {
      const result = await response.json();
      if (result.success && result.addedSources > 0) {
        console.log(
          `[Semantic Layer] Added ${result.addedSources} source(s) to sources.yml`
        );
      }
    }
  } catch (error) {
    // Don't fail the connection if semantic layer update fails
    console.error("[Semantic Layer] Error updating sources:", error);
  }
 }

export async function removeConnectedTable(
  entry: ConnectedTable
): Promise<void> {
  if (!isClient) {
    return;
  }

  // Clean up DuckDB-Wasm tables if this is a DuckDB entry
  if (entry.type === "duckdb") {
    try {
      const { DuckdbWasmClient } = await import(
        "@/lib/duckdb/duckdb-wasm-client"
      );
      const client = new DuckdbWasmClient();

      // Only clean up if client is connected
      if (client.isConnected()) {
        // If entry has a schema with tables array, drop each table
        if (entry.schema && entry.tables && entry.tables.length > 0) {
          for (const tableName of entry.tables) {
            try {
              await client.dropTable(entry.schema, tableName);
            } catch (error) {
              console.error(
                `Failed to drop table ${entry.schema}.${tableName}:`,
                error
              );
            }
          }
        }
        // If entry has a single table, drop it
        else if (entry.table) {
          const schema = entry.schema || "main";
          try {
            await client.dropTable(schema, entry.table);
          } catch (error) {
            console.error(
              `Failed to drop table ${schema}.${entry.table}:`,
              error
            );
          }
        }
      }
    } catch (error) {
      console.error("Failed to clean up DuckDB-Wasm tables:", error);
      // Continue with removal from storage even if DuckDB cleanup fails
    }
  }

  const existing = readConnectedTablesFromStorage();
  const filtered = existing.filter((table) => {
    // Match by type and databasePath
    if (
      table.type !== entry.type ||
      table.databasePath !== entry.databasePath
    ) {
      return true;
    }
    // Match by schema if both have schema
    if (table.schema && entry.schema) {
      if (table.schema !== entry.schema) {
        return true;
      }
      // If schemas match, check if tables arrays match (if present)
      const tableTables = table.tables || [];
      const entryTables = entry.tables || [];
      if (tableTables.length !== entryTables.length) {
        return true;
      }
      const tablesMatch = tableTables.every((t) => entryTables.includes(t));
      return !tablesMatch;
    }
    // Match by table if both have table
    if (table.table && entry.table) {
      return table.table !== entry.table;
    }
    // If one has schema and the other has table, they're different
    if ((table.schema && entry.table) || (table.table && entry.schema)) {
      return true;
    }
    // If neither has schema or table, they're the same (shouldn't happen)
    return false;
  });
  writeConnectedTablesToStorage(filtered);
}
