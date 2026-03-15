# Extension Server and API Routes

The extension server is a lightweight Node HTTP adapter that serves static app assets and re-exposes selected app API route handlers without running a full framework server.

## What `serve:extension` runs

Script:

```bash
bun run src/extension-server/server.ts
```

Defaults:

- Port: `4318` (`EXTENSION_SERVER_PORT` override supported)
- Static root: `dist` (`STATIC_OUT_DIR` override supported)

## Request handling model

For `/api/*` requests, the server:

1. Converts Node `IncomingMessage` to Web `Request`.
2. Matches route by method + regex pattern.
3. Calls imported handler from `src/app/api/...`.
4. Streams the resulting `Response` back to the client.

Non-API requests serve static files from `dist`, with deep-link helpers for `/chat/:id` and `/dashboards/:id`.

## Mirrored API route groups

The extension server includes routes for:

- Chat
  - `/api/chats`
  - `/api/chat`
  - `/api/chat/:chatId`
  - `/api/chat/:chatId/message`
  - `/api/chat/:chatId/message/:messageId`
  - `/api/chat/:chatId/message/:messageId/artifact`
- Dashboards/charts/slicers
  - `/api/dashboards`
  - `/api/dashboards/:dashboardId`
  - `/api/dashboard/:dashboardId/charts`
  - `/api/dashboard/:dashboardId/slicers`
  - `/api/charts/:chartId`
  - `/api/charts/:chartId/slicers`
- DuckDB
  - `/api/tables`
  - `/api/duckdb/config`
  - `/api/duckdb/query`
  - `/api/duckdb/tables`
  - `/api/duckdb/secrets`
- Uploads
  - `/api/upload`
  - `/api/upload/:fileId`

If path exists but method is unsupported, response is `405 Method Not Allowed`.

## Development workflow

Typical flow:

1. Build app assets (`bun build` or your normal production build step).
2. Start extension server (`bun run serve:extension`).
3. Call mirrored APIs through the extension-server base URL.

When API behavior changes, update both:

- App route implementation in `src/app/api/...`
- Route inventory in `src/extension-server/server.ts`

## Caveats and limits

- Only explicitly listed routes are available.
- Browser-local state (local storage/IndexedDB) still lives in the browser and is not stored by extension server.
- This server is an adapter for existing route handlers, not a full Next.js runtime replacement.
