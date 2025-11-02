export const UPLOADED_FILES_STORAGE_KEY = "uploadedFiles";

export const UPLOADED_FILES_UPDATED_EVENT = "uploadedFilesUpdated";

export type UploadedFile = {
  fileId: string;
  fileName: string;
  originalName: string;
  filePath: string;
  size: number;
  type: string;
  uploadedAt: string;
};

const isClient = typeof window !== "undefined";

export function readUploadedFilesFromStorage(): UploadedFile[] {
  if (!isClient) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(UPLOADED_FILES_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as UploadedFile[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is UploadedFile => {
      if (typeof entry !== "object" || entry === null) return false;
      return (
        typeof entry.fileId === "string" &&
        typeof entry.fileName === "string" &&
        typeof entry.filePath === "string" &&
        typeof entry.size === "number"
      );
    });
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

export function removeUploadedFile(fileId: string) {
  if (!isClient) {
    return;
  }

  const existing = readUploadedFilesFromStorage();
  writeUploadedFilesToStorage(existing.filter((f) => f.fileId !== fileId));
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

