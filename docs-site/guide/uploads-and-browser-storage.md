# Uploads and Browser Storage

Uploads are stored in your browser workspace. CSV and Parquet files are also
made available to the local DuckDB runtime so you can query them in Pondview.

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

Excel files are stored as uploaded files but are not automatically converted into
DuckDB tables. They remain available as chat attachments.

## Behavior by file type

| Type | Auto-import to DuckDB WASM | Result |
| ---- | -------------------------- | ------ |
| CSV | Yes | Stored and queryable as a local table |
| Parquet | Yes | Stored and queryable as a local table |
| XLSX/XLS | No | Stored as a browser file and available for chat attachment |

## Where uploads are used

You can use uploaded files from:

- **Data page**: upload files, review upload status, and see imported table names.
- **SQL editor**: query imported CSV and Parquet tables.
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

Deleting an uploaded file removes it from the uploaded files list. If the file
was imported as a local DuckDB table, Pondview also removes that local table.
