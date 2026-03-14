# Uploads and Browser Storage

Status: Placeholder

## Why this doc should exist

Uploads are now part of the main data flow, and browser-local file persistence is a user-visible behavior. That deserves explicit documentation because it affects UX, debugging, and recovery.

## What this doc should eventually cover

- Supported upload formats
- What gets imported into DuckDB WASM vs stored as a blob attachment
- Size limits and validation rules
- How uploaded files are surfaced in the Data page and prompt input
- Legacy server-backed upload behavior vs current browser-first behavior

## Relevant files

- [src/app/data/page.tsx](/Users/paulpeters/Developer/bi-chat/src/app/data/page.tsx)
- [src/lib/uploaded-files.ts](/Users/paulpeters/Developer/bi-chat/src/lib/uploaded-files.ts)
- [src/lib/uploaded-file-blob-store.ts](/Users/paulpeters/Developer/bi-chat/src/lib/uploaded-file-blob-store.ts)
- [src/hooks/use-uploaded-files.ts](/Users/paulpeters/Developer/bi-chat/src/hooks/use-uploaded-files.ts)
- [src/components/prompt-input-wrapper.tsx](/Users/paulpeters/Developer/bi-chat/src/components/prompt-input-wrapper.tsx)

## Suggested outline

1. Upload pipeline
2. File-type handling rules
3. Storage model
4. User-facing UI touchpoints
5. Troubleshooting and cleanup
