# Uploads and Browser Storage

Uploads are browser-first. File metadata is tracked in local storage, binary blobs are persisted in workspace IndexedDB, and supported files are imported into the active runtime when possible.

## Supported file types and limits

Supported extensions:

- `.csv`
- `.xlsx`
- `.xls`
- `.parquet`

Maximum file size:

- `50MB` per file

## What happens after upload

CSV and Parquet files are imported as local DuckDB tables. After import, you can
query them in the SQL editor and ask the AI to use them in analysis.

Excel files are stored as uploaded files. In DuckDB WASM they remain available
as chat attachments; in Bridge-backed projects, `.xlsx` files can be imported
after worksheet selection.

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

## Where uploads are used

You can use uploaded files from:

- **Data page**: upload files, review upload status, and see imported table names.
- **SQL editor**: query imported CSV, Parquet, and Bridge-imported XLSX tables.
- **Prompt input**: attach uploaded files to an AI message.

## Browser storage

Uploaded files live in the browser profile where you added them. They are not
automatically shared with other browsers, devices, or people.

This matters when:

- You clear browser data.
- You switch browser profiles.
- You open Pondview on another device.
- You expect someone else to see the same uploaded files.

For shared or repeatable work, prefer connected data sources or a Bridge-backed
project workflow instead of relying on one browser's uploaded files.

## Deletion and cleanup

`removeUploadedFile(fileId)`:

1. Removes metadata from local storage.
2. Deletes blob from IndexedDB.
3. If imported into DuckDB WASM, drops the WASM table and unregisters browser file mapping.

## Server upload routes

Bridge imports use `POST /imports/file`. The bridge writes the uploaded bytes to a temporary file, imports them into DuckDB, and deletes the temporary file after import.
