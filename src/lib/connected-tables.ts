export const CONNECTED_TABLES_STORAGE_KEY = "connectedTables";

export const CONNECTED_TABLES_UPDATED_EVENT = "connectedTablesUpdated";

export type ConnectedTable = {
  type: string;
  /** @deprecated Kept for backward compatibility. New entries use `connectionId` instead. */
  databasePath?: string;
  /** Opaque key referencing a credential stored server-side in `.env.local`. */
  connectionId?: string;
  // Friendly name for the database (e.g., "my_db" for MotherDuck, database name for Postgres)
  databaseName?: string;
  // For backward compatibility keep `table` optional now
  table?: string;
  // New: allow storing schema instead of table
  schema?: string;
  // Optional list of selected tables within a schema
  tables?: string[];
  description?: string;
  attachAs?: string;
  readOnly?: boolean;
  duckdbExtension?: string;
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
      // Accept entries with either databasePath (legacy) or connectionId (new)
      const hasDatabasePath = typeof (entry as any).databasePath === "string";
      const hasConnectionId = typeof (entry as any).connectionId === "string";
      if (!hasDatabasePath && !hasConnectionId) return false;
      // Accept either table or schema for compatibility
      const hasTable = typeof (entry as any).table === "string";
      const hasSchema = typeof (entry as any).schema === "string";
      const maybeTables = (entry as any).tables;
      const tablesValid =
        maybeTables === undefined ||
        (Array.isArray(maybeTables) &&
          maybeTables.every((t) => typeof t === "string"));
      const databaseName = (entry as any).databaseName;
      const attachAs = (entry as any).attachAs;
      const readOnly = (entry as any).readOnly;
      const duckdbExtension = (entry as any).duckdbExtension;
      const databaseNameValid =
        databaseName === undefined || typeof databaseName === "string";
      const attachValid =
        attachAs === undefined || typeof attachAs === "string";
      const readOnlyValid =
        readOnly === undefined || typeof readOnly === "boolean";
      const duckdbExtensionValid =
        duckdbExtension === undefined || typeof duckdbExtension === "string";
      return (
        tablesValid &&
        (hasTable || hasSchema) &&
        databaseNameValid &&
        attachValid &&
        readOnlyValid &&
        duckdbExtensionValid
      );
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

export async function updateSemanticLayerSources(
  _entry: ConnectedTable,
): Promise<void> {
  // Semantic layer sync is deferred in browser mode.
}

export async function appendConnectedTable(
  entry: ConnectedTable,
): Promise<void> {
  if (!isClient) {
    return;
  }

  // Store in localStorage (semantic-layer sync is deferred in browser mode)
  const storageEntry: ConnectedTable = {
    type: entry.type,
    connectionId: entry.connectionId,
    databaseName: entry.databaseName,
    table: entry.table,
    schema: entry.schema,
    tables: entry.tables,
    description: entry.description,
    attachAs: entry.attachAs,
    readOnly: entry.readOnly,
    duckdbExtension: entry.duckdbExtension,
    databasePath: entry.databasePath,
  };

  const existing = readConnectedTablesFromStorage();
  writeConnectedTablesToStorage([...existing, storageEntry]);
}

export async function removeConnectedTable(
  entry: ConnectedTable,
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
                error,
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
              error,
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
    // Match by type first
    if (table.type !== entry.type) return true;

    // Match by connectionId (new path) or databasePath (legacy)
    const connectionMatch =
      (table.connectionId &&
        entry.connectionId &&
        table.connectionId === entry.connectionId) ||
      (table.databasePath &&
        entry.databasePath &&
        table.databasePath === entry.databasePath);
    if (!connectionMatch) return true;
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
