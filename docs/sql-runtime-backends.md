# SQL Runtime Backends

Status: Placeholder

## Why this doc should exist

The app can execute SQL through multiple runtimes: DuckDB WASM, Bridge, and DuckDB over HTTP. That behavior matters for dashboards, shell usage, connected data, and debugging, but it is currently described only indirectly across code and a few DuckDB notes.

## What this doc should eventually cover

- How backend preference is selected in Settings
- Health checks and fallback behavior
- What runs locally in the browser vs remotely
- Which features are backend-sensitive
- How runtime fingerprinting affects dashboard/materialization caches

## Relevant files

- [src/lib/sql/sql-runtime.ts](/Users/paulpeters/Developer/bi-chat/src/lib/sql/sql-runtime.ts)
- [src/lib/sql/runtime-fingerprint.ts](/Users/paulpeters/Developer/bi-chat/src/lib/sql/runtime-fingerprint.ts)
- [src/lib/sql/run-query.ts](/Users/paulpeters/Developer/bi-chat/src/lib/sql/run-query.ts)
- [src/app/settings/page.tsx](/Users/paulpeters/Developer/bi-chat/src/app/settings/page.tsx)
- [src/lib/bridge/pondview-bridge.ts](/Users/paulpeters/Developer/bi-chat/src/lib/bridge/pondview-bridge.ts)
- [src/lib/duckdb/duckdb-http-browser.ts](/Users/paulpeters/Developer/bi-chat/src/lib/duckdb/duckdb-http-browser.ts)

## Suggested outline

1. Backend overview
2. Selection and fallback rules
3. Health/status model
4. Feature matrix
5. Debugging checklist
