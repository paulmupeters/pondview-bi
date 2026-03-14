# Extension Server and API Routes

Status: Placeholder

## Why this doc should exist

The app includes an extension-side server that re-exposes API route handlers, but there is no dedicated doc explaining what it serves, why it exists, or how it differs from the in-app API routes.

## What this doc should eventually cover

- What `serve:extension` runs
- Which routes are mirrored through the extension server
- How upload, dashboard, chat, and DuckDB routes are wired
- Expected request/response patterns
- Local development and debugging tips

## Relevant files

- [src/extension-server/server.ts](/Users/paulpeters/Developer/bi-chat/src/extension-server/server.ts)
- [src/app/api/chat/route.ts](/Users/paulpeters/Developer/bi-chat/src/app/api/chat/route.ts)
- [src/app/api/chat/[chatId]/route.ts](/Users/paulpeters/Developer/bi-chat/src/app/api/chat/[chatId]/route.ts)
- [src/app/api/dashboards/route.ts](/Users/paulpeters/Developer/bi-chat/src/app/api/dashboards/route.ts)
- [src/app/api/duckdb/query/route.ts](/Users/paulpeters/Developer/bi-chat/src/app/api/duckdb/query/route.ts)
- [src/app/api/upload/route.ts](/Users/paulpeters/Developer/bi-chat/src/app/api/upload/route.ts)

## Suggested outline

1. Server purpose
2. Route inventory
3. Runtime assumptions
4. Development workflow
5. Known limitations
