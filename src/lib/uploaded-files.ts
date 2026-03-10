import { nanoid } from "nanoid";
import { DuckdbWasmClient } from "@/lib/duckdb/duckdb-wasm-client";
import {
  deleteUploadedFileBlob,
  readUploadedFileBlob,
  storeUploadedFileBlob,
} from "@/lib/uploaded-file-blob-store";

export const UPLOADED_FILES_STORAGE_KEY = "uploadedFiles";

export const UPLOADED_FILES_UPDATED_EVENT = "uploadedFilesUpdated";

export const MAX_UPLOADED_FILE_SIZE = 50 * 1024 * 1024;
export const ALLOWED_UPLOAD_EXTENSIONS = [
  ".csv",
  ".xlsx",
  ".xls",
  ".parquet",
] as const;
export const UPLOADED_FILES_SCHEMA = "uploads";

export type UploadedFileStorageKind = "browser" | "legacy-server";
export type UploadedFileImportStatus = "imported" | "stored" | "error";

export type UploadedFile = {
  fileId: string;
  fileName: string;
  originalName: string;
  filePath?: string;
  size: number;
  type: string;
  uploadedAt: string;
  extension: string;
  storageKind: UploadedFileStorageKind;
  importStatus: UploadedFileImportStatus;
  importError?: string;
  schemaName?: string;
  tableName?: string;
};

type UploadedFileLegacy = Partial<UploadedFile> & {
  fileId?: unknown;
  fileName?: unknown;
  originalName?: unknown;
  filePath?: unknown;
  size?: unknown;
  type?: unknown;
  uploadedAt?: unknown;
  extension?: unknown;
  storageKind?: unknown;
  importStatus?: unknown;
  importError?: unknown;
  schemaName?: unknown;
  tableName?: unknown;
};

const isClient = typeof window !== "undefined";

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getFileExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");
  if (lastDot < 0) {
    return "";
  }
  return name.slice(lastDot).toLowerCase();
}

function getBaseName(name: string): string {
  const lastDot = name.lastIndexOf(".");
  return lastDot < 0 ? name : name.slice(0, lastDot);
}

function toDuckDbIdentifier(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized) {
    return "uploaded_file";
  }
  return /^[0-9]/.test(normalized) ? `_${normalized}` : normalized;
}

function buildUploadedTableName(originalName: string, fileId: string): string {
  const baseName = toDuckDbIdentifier(getBaseName(originalName));
  return `${baseName}_${fileId.slice(0, 8)}`;
}

function buildRegisteredFileName(file: UploadedFile): string {
  return `uploads/${file.fileId}_${file.fileName}`;
}

function validateUploadEntry(entry: UploadedFileLegacy): UploadedFile | null {
  if (typeof entry.fileId !== "string" || typeof entry.fileName !== "string") {
    return null;
  }
  if (typeof entry.size !== "number") {
    return null;
  }

  const originalName =
    typeof entry.originalName === "string"
      ? entry.originalName
      : entry.fileName;
  const extension =
    typeof entry.extension === "string"
      ? entry.extension
      : getFileExtension(originalName);
  const storageKind: UploadedFileStorageKind =
    entry.storageKind === "browser" || entry.storageKind === "legacy-server"
      ? entry.storageKind
      : typeof entry.filePath === "string"
        ? "legacy-server"
        : "browser";
  const importStatus: UploadedFileImportStatus =
    entry.importStatus === "imported" ||
    entry.importStatus === "stored" ||
    entry.importStatus === "error"
      ? entry.importStatus
      : "stored";

  return {
    fileId: entry.fileId,
    fileName: entry.fileName,
    originalName,
    filePath: typeof entry.filePath === "string" ? entry.filePath : undefined,
    size: entry.size,
    type: typeof entry.type === "string" ? entry.type : "",
    uploadedAt:
      typeof entry.uploadedAt === "string"
        ? entry.uploadedAt
        : new Date().toISOString(),
    extension,
    storageKind,
    importStatus,
    importError:
      typeof entry.importError === "string" ? entry.importError : undefined,
    schemaName:
      typeof entry.schemaName === "string" ? entry.schemaName : undefined,
    tableName:
      typeof entry.tableName === "string" ? entry.tableName : undefined,
  };
}

function isImportableByWasm(extension: string): boolean {
  return extension === ".csv" || extension === ".parquet";
}

export function readUploadedFilesFromStorage(): UploadedFile[] {
  if (!isClient) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(UPLOADED_FILES_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as UploadedFileLegacy[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => validateUploadEntry(entry))
      .filter((entry): entry is UploadedFile => entry !== null);
  } catch (error) {
    console.error("Failed to read uploaded files from storage", error);
    return [];
  }
}

export function writeUploadedFilesToStorage(files: UploadedFile[]) {
  if (!isClient) {
    return;
  }

  try {
    window.localStorage.setItem(
      UPLOADED_FILES_STORAGE_KEY,
      JSON.stringify(files),
    );
    window.dispatchEvent(new Event(UPLOADED_FILES_UPDATED_EVENT));
  } catch (error) {
    console.error("Failed to write uploaded files to storage", error);
  }
}

export function appendUploadedFile(file: UploadedFile) {
  if (!isClient) {
    return;
  }

  const existing = readUploadedFilesFromStorage();
  writeUploadedFilesToStorage([...existing, file]);
}

function removeUploadedFileFromStorage(fileId: string): UploadedFile | null {
  const existing = readUploadedFilesFromStorage();
  const matching = existing.find((file) => file.fileId === fileId) ?? null;
  writeUploadedFilesToStorage(
    existing.filter((file) => file.fileId !== fileId),
  );
  return matching;
}

export async function removeUploadedFile(fileId: string): Promise<void> {
  if (!isClient) {
    return;
  }

  const removedFile = removeUploadedFileFromStorage(fileId);
  if (!removedFile) {
    return;
  }

  await deleteUploadedFileBlob(fileId).catch((error) => {
    console.error("Failed to delete uploaded file blob", error);
  });

  if (removedFile.schemaName && removedFile.tableName) {
    try {
      const client = new DuckdbWasmClient();
      await client.dropTable(removedFile.schemaName, removedFile.tableName);
      await client.unregisterBrowserFile(buildRegisteredFileName(removedFile));
    } catch (error) {
      console.error(
        "Failed to remove uploaded file table from DuckDB WASM",
        error,
      );
    }
  }
}

export function validateUploadableFile(file: File): string | null {
  const extension = getFileExtension(file.name);
  if (
    !ALLOWED_UPLOAD_EXTENSIONS.includes(
      extension as (typeof ALLOWED_UPLOAD_EXTENSIONS)[number],
    )
  ) {
    return "Invalid file type. Only CSV, XLSX, XLS, and Parquet files are allowed.";
  }
  if (file.size > MAX_UPLOADED_FILE_SIZE) {
    return `File size exceeds ${MAX_UPLOADED_FILE_SIZE / (1024 * 1024)}MB limit.`;
  }
  return null;
}

export async function getUploadedFileBlob(
  fileId: string,
): Promise<File | null> {
  return readUploadedFileBlob(fileId);
}

export async function persistUploadedFile(file: File): Promise<UploadedFile> {
  const validationError = validateUploadableFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const fileId = nanoid();
  const sanitizedOriginalName = sanitizeFileName(file.name);
  const extension = getFileExtension(file.name);
  const uploadedAt = new Date().toISOString();

  const baseEntry: UploadedFile = {
    fileId,
    fileName: sanitizedOriginalName,
    originalName: file.name,
    size: file.size,
    type: file.type,
    uploadedAt,
    extension,
    storageKind: "browser",
    importStatus: "stored",
  };

  await storeUploadedFileBlob(fileId, file);

  let finalEntry = baseEntry;
  if (isImportableByWasm(extension)) {
    try {
      const client = new DuckdbWasmClient();
      const tableName = buildUploadedTableName(file.name, fileId);
      await client.importBrowserFile({
        file,
        registeredName: buildRegisteredFileName(baseEntry),
        schema: UPLOADED_FILES_SCHEMA,
        tableName,
        format: extension === ".parquet" ? "parquet" : "csv",
      });

      finalEntry = {
        ...baseEntry,
        importStatus: "imported",
        schemaName: UPLOADED_FILES_SCHEMA,
        tableName,
      };
    } catch (error) {
      finalEntry = {
        ...baseEntry,
        importStatus: "error",
        importError:
          error instanceof Error ? error.message : String(error ?? ""),
      };
    }
  } else {
    finalEntry = {
      ...baseEntry,
      importStatus: "stored",
      importError:
        "Stored in the browser, but not yet auto-imported into DuckDB WASM.",
    };
  }

  appendUploadedFile(finalEntry);
  return finalEntry;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
