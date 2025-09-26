export const CONNECTED_TABLES_STORAGE_KEY = "connectedTables";

export const CONNECTED_TABLES_UPDATED_EVENT = "connectedTablesUpdated";

export type ConnectedTable = {
  type: string;
  databasePath: string;
  table: string;
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

    return parsed.filter(
      (entry): entry is ConnectedTable =>
        typeof entry === "object" &&
        entry !== null &&
        typeof entry.type === "string" &&
        typeof entry.databasePath === "string" &&
        typeof entry.table === "string",
    );
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

