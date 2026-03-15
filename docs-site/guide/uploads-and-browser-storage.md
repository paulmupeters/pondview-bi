# Uploads and Browser Storage

Uploads are browser-first. File metadata is tracked in local storage, binary blobs are persisted in workspace IndexedDB, and CSV/Parquet files are auto-imported into DuckDB WASM.

## Supported file types and limits

Allowed extensions:

- `.csv`
- `.xlsx`
- `.xls`
- `.parquet`

Max file size:

- `50MB` per file

Validation happens in `validateUploadableFile(...)`.

## Upload pipeline

`persistUploadedFile(file)` performs:

1. Validate extension and size.
2. Generate `fileId` and metadata entry.
3. Store blob in workspace DB (`STORE_UPLOADED_FILE_BLOBS`).
4. If file is CSV or Parquet, import into DuckDB WASM (`uploads.<table>`).
5. Save metadata entry to local storage (`uploadedFiles`).

## Import behavior by file type

| Type | Auto-import to DuckDB WASM | Result |
| --- | --- | --- |
| CSV | Yes | Stored + imported (`importStatus: imported`) |
| Parquet | Yes | Stored + imported (`importStatus: imported`) |
| XLSX/XLS | No | Stored as browser file only (`importStatus: stored`) |

Non-imported files remain available as chat attachments.

## Storage model

### Local storage

- Key: `uploadedFiles`
- Stores metadata (`fileId`, original name, size, status, schema/table if imported)

### IndexedDB (workspace DB)

- Store: `uploadedFileBlobs`
- Stores raw blob + name/type metadata for reattachment

## UI touchpoints

- **Data page**
  - Upload button
  - Upload status message
  - Uploaded files list
  - Imported table names for DuckDB WASM entries
- **Prompt input**
  - Attachment picker reads uploaded files
  - Selecting a file reads blob from IndexedDB and attaches it to the prompt
  - Inline upload from the attachment hover card uses the same persistence flow

## Deletion and cleanup

`removeUploadedFile(fileId)`:

1. Removes metadata from local storage.
2. Deletes blob from IndexedDB.
3. If imported, drops the DuckDB WASM table and unregisters browser file mapping.

## Legacy server upload routes

Server routes (`/api/upload`, `/api/upload/[fileId]`) still exist for compatibility/extension flows and write files to disk under `uploads/`. The primary in-app UX is browser-local.
