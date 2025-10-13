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

export function appendConnectedTable(entry: ConnectedTable) {
  if (!isClient) {
    return;
  }

  const existing = readConnectedTablesFromStorage();
  writeConnectedTablesToStorage([...existing, entry]);
}
