import type { DashboardSourceDescriptor } from "@/lib/dashboard/source-descriptor";
import type { SqlBackend } from "@/lib/sql/sql-runtime";

export type DashboardStorageStatus = "shared" | "best-effort";

export interface WorkspaceChat {
  id: string;
  title: string | null;
  userId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceMessage {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  parts: string | null;
  createdAt: number;
}

export interface WorkspaceAnalysisNotebook {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
}

export type WorkspaceAnalysisCellStatus =
  | "idle"
  | "running"
  | "complete"
  | "error";

export interface WorkspaceAnalysisCell {
  id: string;
  notebookId: string;
  position: number;
  promptText: string;
  sqlDraft: string | null;
  selectedDbIdentifier: string | null;
  selectedCatalogContext: string | null;
  status: WorkspaceAnalysisCellStatus;
  resultPayloadJson: string | null;
  createdAt: number;
  updatedAt: number;
  lastRunAt: number | null;
}

export type WorkspaceAnalysisCellEntryRole =
  | "user"
  | "assistant"
  | "tool"
  | "system";

export interface WorkspaceAnalysisCellEntry {
  id: string;
  notebookId: string;
  cellId: string;
  order: number;
  role: WorkspaceAnalysisCellEntryRole;
  partsJson: string;
  createdAt: number;
}

export interface WorkspaceDashboard {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  columns?: number;
  autoFitRows?: boolean;
  runtimeBackend?: SqlBackend | null;
  activeSnapshotId?: string | null;
  homeDbIdentifier?: string | null;
  homeSqlBackend?: SqlBackend | null;
  storageStatus?: DashboardStorageStatus | null;
}

export interface WorkspaceChart {
  id: string;
  dashboardId: string;
  title: string | null;
  description: string | null;
  sql: string;
  sourceDescriptor?: DashboardSourceDescriptor | null;
  sourceDescriptorJson?: string | null;
  snapshotId?: string | null;
  dbIdentifier: string | null;
  catalogContext?: string | null;
  sqlBackend?: SqlBackend | null;
  chartConfigJson: string;
  semanticQueryJson: string | null;
  exploreName: string | null;
  position: number;
  createdAt: number;
  updatedAt: number;
  sourceSql?: string | null;
  sourceDbIdentifier?: string | null;
  sourceCatalogContext?: string | null;
  sourceSqlBackend?: SqlBackend | null;
}

export interface WorkspaceDashboardMeasure {
  id: string;
  dashboardId: string;
  key: string;
  label: string;
  sql: string;
  sourceDescriptor?: DashboardSourceDescriptor | null;
  sourceDescriptorJson?: string | null;
  snapshotId?: string | null;
  dbIdentifier: string | null;
  catalogContext?: string | null;
  sqlBackend?: SqlBackend | null;
  createdAt: number;
  updatedAt: number;
  sourceSql?: string | null;
  sourceDbIdentifier?: string | null;
  sourceCatalogContext?: string | null;
  sourceSqlBackend?: SqlBackend | null;
}

export interface WorkspaceDashboardSlicer {
  id: string;
  dashboardId: string;
  field: string;
  title: string | null;
  limit: number;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceChartSlicer {
  id: string;
  chartId: string;
  field: string;
  title: string | null;
  limit: number;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspacePreference {
  key: string;
  valueJson: string;
  updatedAt: number;
}

export interface WorkspaceUploadedFileBlob {
  id: string;
  blob: Blob;
  name: string;
  type: string;
  lastModified: number;
  size: number;
}

export interface WorkspaceExportV1 {
  version: 1;
  exportedAt: string;
  chats: WorkspaceChat[];
  messages: WorkspaceMessage[];
  dashboards: WorkspaceDashboard[];
  charts: WorkspaceChart[];
  dashboardSlicers: WorkspaceDashboardSlicer[];
  chartSlicers: WorkspaceChartSlicer[];
  preferences: WorkspacePreference[];
}

export interface WorkspaceExportV2 {
  version: 2;
  exportedAt: string;
  chats: WorkspaceChat[];
  messages: WorkspaceMessage[];
  dashboards: WorkspaceDashboard[];
  charts: WorkspaceChart[];
  dashboardMeasures: WorkspaceDashboardMeasure[];
  dashboardSlicers: WorkspaceDashboardSlicer[];
  chartSlicers: WorkspaceChartSlicer[];
  preferences: WorkspacePreference[];
}

export interface WorkspaceExportV3 {
  version: 3;
  exportedAt: string;
  chats: WorkspaceChat[];
  messages: WorkspaceMessage[];
  notebooks: WorkspaceAnalysisNotebook[];
  analysisCells: WorkspaceAnalysisCell[];
  analysisCellEntries: WorkspaceAnalysisCellEntry[];
  dashboards: WorkspaceDashboard[];
  charts: WorkspaceChart[];
  dashboardMeasures: WorkspaceDashboardMeasure[];
  dashboardSlicers: WorkspaceDashboardSlicer[];
  chartSlicers: WorkspaceChartSlicer[];
  preferences: WorkspacePreference[];
}

export type WorkspaceExport =
  | WorkspaceExportV1
  | WorkspaceExportV2
  | WorkspaceExportV3;

export const WORKSPACE_DB_NAME = "pondview-workspace";
export const WORKSPACE_DB_VERSION = 5;
const WORKSPACE_DB_NAME_OVERRIDE_KEY = "pondview-workspace-name-override";

export const STORE_CHATS = "chats";
export const STORE_MESSAGES = "messages";
export const STORE_ANALYSIS_NOTEBOOKS = "analysisNotebooks";
export const STORE_ANALYSIS_CELLS = "analysisCells";
export const STORE_ANALYSIS_CELL_ENTRIES = "analysisCellEntries";
export const STORE_PREFERENCES = "preferences";
export const STORE_UPLOADED_FILE_BLOBS = "uploadedFileBlobs";

type StoreName =
  | typeof STORE_CHATS
  | typeof STORE_MESSAGES
  | typeof STORE_ANALYSIS_NOTEBOOKS
  | typeof STORE_ANALYSIS_CELLS
  | typeof STORE_ANALYSIS_CELL_ENTRIES
  | typeof STORE_PREFERENCES
  | typeof STORE_UPLOADED_FILE_BLOBS;

let openDbPromise: Promise<IDBDatabase> | null = null;
let workspaceTraceId = 0;
const WORKSPACE_DB_OPEN_TIMEOUT_MS = 4000;

function readWorkspaceDbNameOverride(): string | null {
  try {
    if (typeof window === "undefined") {
      return null;
    }

    const value = window.localStorage.getItem(WORKSPACE_DB_NAME_OVERRIDE_KEY);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeWorkspaceDbNameOverride(value: string | null): void {
  try {
    if (typeof window === "undefined") {
      return;
    }

    if (value) {
      window.localStorage.setItem(WORKSPACE_DB_NAME_OVERRIDE_KEY, value);
    } else {
      window.localStorage.removeItem(WORKSPACE_DB_NAME_OVERRIDE_KEY);
    }
  } catch {
    // Ignore localStorage failures and fall back to the default DB name.
  }
}

export function getActiveWorkspaceDbName(): string {
  return readWorkspaceDbNameOverride() ?? WORKSPACE_DB_NAME;
}

export function switchToFreshWorkspaceDatabase(): string {
  const previousDbName = getActiveWorkspaceDbName();
  const nextDbName = `${WORKSPACE_DB_NAME}-recovery-${Date.now()}`;
  writeWorkspaceDbNameOverride(nextDbName);
  resetOpenDbPromise();
  console.warn("[workspace-db] switched to a fresh workspace database", {
    previousDbName,
    nextDbName,
  });
  return nextDbName;
}

function resetOpenDbPromise(): void {
  openDbPromise = null;
}

function beginWorkspaceTrace(
  operation: string,
  details?: Record<string, unknown>,
): {
  finish: (status: "ok" | "error", extra?: Record<string, unknown>) => void;
} {
  const id = ++workspaceTraceId;
  const startedAt = Date.now();
  const timeoutId = globalThis.setTimeout(() => {
    console.warn(`[workspace-db:${id}] still pending: ${operation}`, details);
  }, 2000);

  console.info(`[workspace-db:${id}] start ${operation}`, details);

  return {
    finish: (status, extra) => {
      globalThis.clearTimeout(timeoutId);
      console.info(`[workspace-db:${id}] ${status} ${operation}`, {
        ...details,
        ...extra,
        durationMs: Date.now() - startedAt,
      });
    },
  };
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function createStores(db: IDBDatabase): void {
  for (const legacyStoreName of [
    "dashboards",
    "charts",
    "dashboardMeasures",
    "dashboardSlicers",
    "chartSlicers",
  ]) {
    if (db.objectStoreNames.contains(legacyStoreName)) {
      db.deleteObjectStore(legacyStoreName);
    }
  }

  if (!db.objectStoreNames.contains(STORE_CHATS)) {
    const chats = db.createObjectStore(STORE_CHATS, { keyPath: "id" });
    chats.createIndex("updatedAt", "updatedAt", { unique: false });
  }

  if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
    const messages = db.createObjectStore(STORE_MESSAGES, { keyPath: "id" });
    messages.createIndex("chatId", "chatId", { unique: false });
    messages.createIndex("chatIdCreatedAt", ["chatId", "createdAt"], {
      unique: false,
    });
  }

  if (!db.objectStoreNames.contains(STORE_ANALYSIS_NOTEBOOKS)) {
    const notebooks = db.createObjectStore(STORE_ANALYSIS_NOTEBOOKS, {
      keyPath: "id",
    });
    notebooks.createIndex("updatedAt", "updatedAt", { unique: false });
  }

  if (!db.objectStoreNames.contains(STORE_ANALYSIS_CELLS)) {
    const analysisCells = db.createObjectStore(STORE_ANALYSIS_CELLS, {
      keyPath: "id",
    });
    analysisCells.createIndex("notebookId", "notebookId", { unique: false });
    analysisCells.createIndex(
      "notebookIdPosition",
      ["notebookId", "position"],
      { unique: false },
    );
  }

  if (!db.objectStoreNames.contains(STORE_ANALYSIS_CELL_ENTRIES)) {
    const analysisCellEntries = db.createObjectStore(
      STORE_ANALYSIS_CELL_ENTRIES,
      {
        keyPath: "id",
      },
    );
    analysisCellEntries.createIndex("notebookId", "notebookId", {
      unique: false,
    });
    analysisCellEntries.createIndex("cellId", "cellId", { unique: false });
    analysisCellEntries.createIndex("cellIdOrder", ["cellId", "order"], {
      unique: false,
    });
  }

  if (!db.objectStoreNames.contains(STORE_PREFERENCES)) {
    const preferences = db.createObjectStore(STORE_PREFERENCES, {
      keyPath: "key",
    });
    preferences.createIndex("updatedAt", "updatedAt", { unique: false });
  }

  if (!db.objectStoreNames.contains(STORE_UPLOADED_FILE_BLOBS)) {
    db.createObjectStore(STORE_UPLOADED_FILE_BLOBS, { keyPath: "id" });
  }
}

export async function openWorkspaceDb(): Promise<IDBDatabase> {
  if (openDbPromise) {
    console.info("[workspace-db] reusing existing open promise");
    return openDbPromise;
  }

  const dbName = getActiveWorkspaceDbName();
  openDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const trace = beginWorkspaceTrace("openWorkspaceDb", {
      dbName,
      version: WORKSPACE_DB_VERSION,
    });
    const request = indexedDB.open(dbName, WORKSPACE_DB_VERSION);
    const timeoutId = globalThis.setTimeout(() => {
      resetOpenDbPromise();
      trace.finish("error", { event: "timeout" });
      reject(
        new Error(
          "Timed out opening the workspace database. The browser's IndexedDB state appears stuck.",
        ),
      );
    }, WORKSPACE_DB_OPEN_TIMEOUT_MS);

    request.onupgradeneeded = () => {
      const db = request.result;
      console.info("[workspace-db] onupgradeneeded", {
        dbName: db.name,
        version: db.version,
        objectStoreNames: Array.from(db.objectStoreNames),
      });
      createStores(db);
    };

    request.onblocked = () => {
      globalThis.clearTimeout(timeoutId);
      resetOpenDbPromise();
      trace.finish("error", { event: "blocked" });
      reject(
        new Error(
          "Workspace database upgrade is blocked by another open tab or stale connection. Reload the app and close other Pondview tabs.",
        ),
      );
    };

    request.onsuccess = () => {
      globalThis.clearTimeout(timeoutId);
      const db = request.result;
      trace.finish("ok", {
        event: "success",
        objectStoreNames: Array.from(db.objectStoreNames),
      });

      db.onversionchange = () => {
        console.warn("[workspace-db] versionchange received, closing db");
        db.close();
        resetOpenDbPromise();
      };

      db.onclose = () => {
        console.warn("[workspace-db] database connection closed");
        resetOpenDbPromise();
      };

      resolve(db);
    };

    request.onerror = () => {
      globalThis.clearTimeout(timeoutId);
      resetOpenDbPromise();
      trace.finish("error", {
        event: "error",
        message: request.error?.message ?? "unknown",
      });
      reject(request.error ?? new Error("Failed to open workspace database"));
    };
  });

  return openDbPromise;
}

export async function deleteWorkspaceDatabase(): Promise<void> {
  const dbName = getActiveWorkspaceDbName();
  resetOpenDbPromise();

  await new Promise<void>((resolve, reject) => {
    const trace = beginWorkspaceTrace("deleteWorkspaceDatabase", {
      dbName,
    });
    const request = indexedDB.deleteDatabase(dbName);

    request.onblocked = () => {
      trace.finish("error", { event: "blocked" });
      reject(
        new Error(
          "Workspace database reset is blocked by another open tab or stale connection.",
        ),
      );
    };

    request.onsuccess = () => {
      trace.finish("ok", { event: "success" });
      resolve();
    };

    request.onerror = () => {
      trace.finish("error", {
        event: "error",
        message: request.error?.message ?? "unknown",
      });
      reject(request.error ?? new Error("Failed to delete workspace database"));
    };
  });
}

export async function getAllFromStore<T>(storeName: StoreName): Promise<T[]> {
  const trace = beginWorkspaceTrace("getAllFromStore", { storeName });
  const db = await openWorkspaceDb();
  const tx = db.transaction(storeName, "readonly");
  const store = tx.objectStore(storeName);
  try {
    const rows = await requestToPromise(store.getAll() as IDBRequest<T[]>);
    trace.finish("ok", {
      rowCount: Array.isArray(rows) ? rows.length : undefined,
    });
    return rows;
  } catch (error) {
    trace.finish("error", {
      message: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  }
}

export async function getByKey<T>(
  storeName: StoreName,
  key: IDBValidKey,
): Promise<T | undefined> {
  const trace = beginWorkspaceTrace("getByKey", {
    storeName,
    key: String(key),
  });
  const db = await openWorkspaceDb();
  const tx = db.transaction(storeName, "readonly");
  const store = tx.objectStore(storeName);
  try {
    const row = await requestToPromise(
      store.get(key) as IDBRequest<T | undefined>,
    );
    trace.finish("ok", { found: row !== undefined });
    return row;
  } catch (error) {
    trace.finish("error", {
      message: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  }
}

export async function putMany<T extends object>(
  storeName: StoreName,
  rows: T[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const db = await openWorkspaceDb();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  for (const row of rows) {
    store.put(row);
  }
  await transactionDone(tx);
}

export async function putOne<T extends object>(
  storeName: StoreName,
  row: T,
): Promise<void> {
  const db = await openWorkspaceDb();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).put(row);
  await transactionDone(tx);
}

export async function deleteByKey(
  storeName: StoreName,
  key: IDBValidKey,
): Promise<void> {
  const db = await openWorkspaceDb();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).delete(key);
  await transactionDone(tx);
}

export async function clearStore(storeName: StoreName): Promise<void> {
  const db = await openWorkspaceDb();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).clear();
  await transactionDone(tx);
}

export async function clearWorkspaceDb(): Promise<void> {
  const db = await openWorkspaceDb();
  const tx = db.transaction(
    [
      STORE_CHATS,
      STORE_MESSAGES,
      STORE_ANALYSIS_NOTEBOOKS,
      STORE_ANALYSIS_CELLS,
      STORE_ANALYSIS_CELL_ENTRIES,
      STORE_PREFERENCES,
      STORE_UPLOADED_FILE_BLOBS,
    ],
    "readwrite",
  );

  tx.objectStore(STORE_CHATS).clear();
  tx.objectStore(STORE_MESSAGES).clear();
  tx.objectStore(STORE_ANALYSIS_NOTEBOOKS).clear();
  tx.objectStore(STORE_ANALYSIS_CELLS).clear();
  tx.objectStore(STORE_ANALYSIS_CELL_ENTRIES).clear();
  tx.objectStore(STORE_PREFERENCES).clear();
  tx.objectStore(STORE_UPLOADED_FILE_BLOBS).clear();

  await transactionDone(tx);
}
