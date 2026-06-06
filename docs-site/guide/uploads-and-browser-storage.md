# Uploads and Browser Storage

Uploads are browser-first. File metadata is tracked in local storage, binary blobs are persisted in workspace IndexedDB, and supported files are imported into the active runtime when possible.

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
4. If the active runtime can import the file, create a table in DuckDB (`uploads.<table>`).
5. Save metadata entry to local storage (`uploadedFiles`).

## Import behavior by file type

| Type | DuckDB WASM | Bridge | Result |
| --- | --- | --- | --- |
| CSV | Imported | Imported | Stored + imported (`importStatus: imported`) |
| Parquet | Imported | Imported | Stored + imported (`importStatus: imported`) |
| XLSX | Stored only | Imported after worksheet selection | Stored, and imported in Bridge |
| XLS | Stored only | Unsupported | Use `.xlsx` instead for Bridge imports |

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
3. If imported into DuckDB WASM, drops the WASM table and unregisters browser file mapping.

## Server upload routes

Bridge imports use `POST /imports/file`. The bridge writes the uploaded bytes to a temporary file, imports them into DuckDB, and deletes the temporary file after import.
