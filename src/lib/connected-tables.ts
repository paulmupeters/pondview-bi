import { DuckdbWasmClient } from "@/lib/duckdb/duckdb-wasm-client";

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
  duckdbExtensionRepository?: string;
};

const isClient = typeof window !== "undefined";

export function sanitizeConnectedTableForStorage(
  entry: ConnectedTable,
): ConnectedTable | null {
  if (!entry.connectionId?.trim()) {
    return null;
  }

  return {
    type: entry.type,
    connectionId: entry.connectionId.trim(),
    databaseName: entry.databaseName,
    table: entry.table,
    schema: entry.schema,
    tables: entry.tables,
    description: entry.description,
    attachAs: entry.attachAs,
    readOnly: entry.readOnly,
    duckdbExtension: entry.duckdbExtension,
    duckdbExtensionRepository: entry.duckdbExtensionRepository,
  };
}

export function sanitizeConnectedTablesForStorage(
  tables: ConnectedTable[],
): ConnectedTable[] {
  return tables
    .map(sanitizeConnectedTableForStorage)
    .filter((entry): entry is ConnectedTable => entry !== null);
}

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

    return parsed
      .filter((entry): entry is ConnectedTable => {
        if (typeof entry !== "object" || entry === null) return false;
        const e = entry as Record<string, unknown>;
        if (typeof e.type !== "string") return false;
        const hasConnectionId = typeof e.connectionId === "string";
        if (!hasConnectionId) return false;
        // Accept either table or schema for compatibility
        const hasTable = typeof e.table === "string";
        const hasSchema = typeof e.schema === "string";
        const maybeTables = e.tables;
        const tablesValid =
          maybeTables === undefined ||
          (Array.isArray(maybeTables) &&
            maybeTables.every((t) => typeof t === "string"));
        const databaseName = e.databaseName;
        const attachAs = e.attachAs;
        const readOnly = e.readOnly;
        const duckdbExtension = e.duckdbExtension;
        const duckdbExtensionRepository = e.duckdbExtensionRepository;
        const databaseNameValid =
          databaseName === undefined || typeof databaseName === "string";
        const attachValid =
          attachAs === undefined || typeof attachAs === "string";
        const readOnlyValid =
          readOnly === undefined || typeof readOnly === "boolean";
        const duckdbExtensionValid =
          duckdbExtension === undefined || typeof duckdbExtension === "string";
        const duckdbExtensionRepositoryValid =
          duckdbExtensionRepository === undefined ||
          typeof duckdbExtensionRepository === "string";
        return (
          tablesValid &&
          (hasTable || hasSchema) &&
          databaseNameValid &&
          attachValid &&
          readOnlyValid &&
          duckdbExtensionValid &&
          duckdbExtensionRepositoryValid
        );
      })
      .map(sanitizeConnectedTableForStorage)
      .filter((entry): entry is ConnectedTable => entry !== null);
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
    const sanitizedTables = sanitizeConnectedTablesForStorage(tables);
    window.localStorage.setItem(
      CONNECTED_TABLES_STORAGE_KEY,
      JSON.stringify(sanitizedTables),
    );
    window.dispatchEvent(new Event(CONNECTED_TABLES_UPDATED_EVENT));
  } catch (error) {
    console.error("Failed to write connected tables to storage", error);
  }
}

export async function appendConnectedTable(
  entry: ConnectedTable,
): Promise<void> {
  if (!isClient) {
    return;
  }

  // Store in localStorage; browser mode does not sync connected sources to YAML.
  const storageEntry = sanitizeConnectedTableForStorage(entry);
  if (!storageEntry) {
    return;
  }

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

    // Match only opaque connection ids. Raw database paths are no longer persisted.
    const connectionMatch =
      table.connectionId &&
      entry.connectionId &&
      table.connectionId === entry.connectionId;
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
