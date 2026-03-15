import type { SqlBackend } from "@/lib/sql/sql-runtime";

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

export interface WorkspaceDashboard {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceChart {
  id: string;
  dashboardId: string;
  title: string | null;
  description: string | null;
  sql: string;
  dbIdentifier: string | null;
  sqlBackend?: SqlBackend | null;
  chartConfigJson: string;
  semanticQueryJson: string | null;
  exploreName: string | null;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceDashboardMeasure {
  id: string;
  dashboardId: string;
  key: string;
  label: string;
  sql: string;
  dbIdentifier: string | null;
  sqlBackend?: SqlBackend | null;
  createdAt: number;
  updatedAt: number;
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

export type WorkspaceExport = WorkspaceExportV1 | WorkspaceExportV2;

export const WORKSPACE_DB_NAME = "pondview-workspace";
export const WORKSPACE_DB_VERSION = 3;

export const STORE_CHATS = "chats";
export const STORE_MESSAGES = "messages";
export const STORE_DASHBOARDS = "dashboards";
export const STORE_CHARTS = "charts";
export const STORE_DASHBOARD_MEASURES = "dashboardMeasures";
export const STORE_DASHBOARD_SLICERS = "dashboardSlicers";
export const STORE_CHART_SLICERS = "chartSlicers";
export const STORE_PREFERENCES = "preferences";
export const STORE_UPLOADED_FILE_BLOBS = "uploadedFileBlobs";

type StoreName =
  | typeof STORE_CHATS
  | typeof STORE_MESSAGES
  | typeof STORE_DASHBOARDS
  | typeof STORE_CHARTS
  | typeof STORE_DASHBOARD_MEASURES
  | typeof STORE_DASHBOARD_SLICERS
  | typeof STORE_CHART_SLICERS
  | typeof STORE_PREFERENCES
  | typeof STORE_UPLOADED_FILE_BLOBS;

let openDbPromise: Promise<IDBDatabase> | null = null;

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

  if (!db.objectStoreNames.contains(STORE_DASHBOARDS)) {
    const dashboards = db.createObjectStore(STORE_DASHBOARDS, {
      keyPath: "id",
    });
    dashboards.createIndex("updatedAt", "updatedAt", { unique: false });
  }

  if (!db.objectStoreNames.contains(STORE_CHARTS)) {
    const charts = db.createObjectStore(STORE_CHARTS, { keyPath: "id" });
    charts.createIndex("dashboardId", "dashboardId", { unique: false });
    charts.createIndex("dashboardIdPosition", ["dashboardId", "position"], {
      unique: false,
    });
  }

  if (!db.objectStoreNames.contains(STORE_DASHBOARD_MEASURES)) {
    const dashboardMeasures = db.createObjectStore(STORE_DASHBOARD_MEASURES, {
      keyPath: "id",
    });
    dashboardMeasures.createIndex("dashboardId", "dashboardId", {
      unique: false,
    });
    dashboardMeasures.createIndex("dashboardIdKey", ["dashboardId", "key"], {
      unique: true,
    });
  }

  if (!db.objectStoreNames.contains(STORE_DASHBOARD_SLICERS)) {
    const dashboardSlicers = db.createObjectStore(STORE_DASHBOARD_SLICERS, {
      keyPath: "id",
    });
    dashboardSlicers.createIndex("dashboardId", "dashboardId", {
      unique: false,
    });
    dashboardSlicers.createIndex(
      "dashboardIdPosition",
      ["dashboardId", "position"],
      {
        unique: false,
      },
    );
  }

  if (!db.objectStoreNames.contains(STORE_CHART_SLICERS)) {
    const chartSlicers = db.createObjectStore(STORE_CHART_SLICERS, {
      keyPath: "id",
    });
    chartSlicers.createIndex("chartId", "chartId", { unique: false });
    chartSlicers.createIndex("chartIdPosition", ["chartId", "position"], {
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
    return openDbPromise;
  }

  openDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(WORKSPACE_DB_NAME, WORKSPACE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      createStores(db);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open workspace database"));
  });

  return openDbPromise;
}

export async function getAllFromStore<T>(storeName: StoreName): Promise<T[]> {
  const db = await openWorkspaceDb();
  const tx = db.transaction(storeName, "readonly");
  const store = tx.objectStore(storeName);
  const rows = await requestToPromise(store.getAll() as IDBRequest<T[]>);
  await transactionDone(tx);
  return rows;
}

export async function getByKey<T>(
  storeName: StoreName,
  key: IDBValidKey,
): Promise<T | undefined> {
  const db = await openWorkspaceDb();
  const tx = db.transaction(storeName, "readonly");
  const store = tx.objectStore(storeName);
  const row = await requestToPromise(
    store.get(key) as IDBRequest<T | undefined>,
  );
  await transactionDone(tx);
  return row;
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
      STORE_DASHBOARDS,
      STORE_CHARTS,
      STORE_DASHBOARD_MEASURES,
      STORE_DASHBOARD_SLICERS,
      STORE_CHART_SLICERS,
      STORE_PREFERENCES,
      STORE_UPLOADED_FILE_BLOBS,
    ],
    "readwrite",
  );

  tx.objectStore(STORE_CHATS).clear();
  tx.objectStore(STORE_MESSAGES).clear();
  tx.objectStore(STORE_DASHBOARDS).clear();
  tx.objectStore(STORE_CHARTS).clear();
  tx.objectStore(STORE_DASHBOARD_MEASURES).clear();
  tx.objectStore(STORE_DASHBOARD_SLICERS).clear();
  tx.objectStore(STORE_CHART_SLICERS).clear();
  tx.objectStore(STORE_PREFERENCES).clear();
  tx.objectStore(STORE_UPLOADED_FILE_BLOBS).clear();

  await transactionDone(tx);
}
