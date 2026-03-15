# Docs Map

This folder currently has good coverage for DuckDB internals and dashboard materialization, but it was missing several product-level and operational topics.

## Existing docs

- [duckdb-extension-connections.md](/Users/paulpeters/Developer/bi-chat/docs/duckdb-extension-connections.md)
- [duckdb-usage-overview.md](/Users/paulpeters/Developer/bi-chat/docs/duckdb-usage-overview.md)
- [duckdb-wasm-usage.md](/Users/paulpeters/Developer/bi-chat/docs/duckdb-wasm-usage.md)
- [materialization-lifecycle.md](/Users/paulpeters/Developer/bi-chat/docs/materialization-lifecycle.md)
- [semantic-layer-materialization.md](/Users/paulpeters/Developer/bi-chat/docs/semantic-layer-materialization.md)
- [datasource-context/web_analytics.md](/Users/paulpeters/Developer/bi-chat/docs/datasource-context/web_analytics.md)

## Added placeholders for gaps

- [ai-provider-configuration.md](/Users/paulpeters/Developer/bi-chat/docs/ai-provider-configuration.md)
- [sql-runtime-backends.md](/Users/paulpeters/Developer/bi-chat/docs/sql-runtime-backends.md)
- [connected-data-sources.md](/Users/paulpeters/Developer/bi-chat/docs/connected-data-sources.md)
- [uploads-and-browser-storage.md](/Users/paulpeters/Developer/bi-chat/docs/uploads-and-browser-storage.md)
- [workspace-persistence.md](/Users/paulpeters/Developer/bi-chat/docs/workspace-persistence.md)

## Why these were gaps

- The existing docs explain DuckDB details well, but not how users configure AI providers.
- Runtime selection across WASM, Bridge, and DuckDB over HTTP is spread across code and Settings UI.
- Data-source support has expanded beyond the docs.
- Upload behavior and browser-local persistence are important product behaviors but were undocumented.
- The workspace import/export model is a real maintenance topic with no dedicated doc.
