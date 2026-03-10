import {
  deleteByKey,
  getByKey,
  putOne,
  STORE_UPLOADED_FILE_BLOBS,
  type WorkspaceUploadedFileBlob,
} from "@/lib/workspace/workspace-db";

export async function storeUploadedFileBlob(
  fileId: string,
  file: File,
): Promise<void> {
  await putOne(STORE_UPLOADED_FILE_BLOBS, {
    id: fileId,
    blob: file,
    name: file.name,
    type: file.type,
    lastModified: file.lastModified,
    size: file.size,
  } satisfies WorkspaceUploadedFileBlob);
}

export async function readUploadedFileBlob(
  fileId: string,
): Promise<File | null> {
  const row = await getByKey<WorkspaceUploadedFileBlob>(
    STORE_UPLOADED_FILE_BLOBS,
    fileId,
  );
  if (!row) {
    return null;
  }

  return new File([row.blob], row.name, {
    type: row.type,
    lastModified: row.lastModified,
  });
}

export async function deleteUploadedFileBlob(fileId: string): Promise<void> {
  await deleteByKey(STORE_UPLOADED_FILE_BLOBS, fileId);
}
