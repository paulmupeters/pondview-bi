# Connected Data Sources

Status: Placeholder

## Why this doc should exist

The product now supports more sources than the README and docs currently describe, and the connection model includes runtime-specific behavior that new contributors will not infer quickly from the UI alone.

## What this doc should eventually cover

- Supported source types: DuckDB, MotherDuck, Postgres, MySQL, SQLite
- How the connect dialog maps UI fields into identifiers
- When a source is attached through DuckDB extensions
- How aliases and schema previews work
- Backend-specific limitations

## Relevant files

- [src/components/connect-data-dialog.tsx](/Users/paulpeters/Developer/bi-chat/src/components/connect-data-dialog.tsx)
- [src/lib/connected-tables.ts](/Users/paulpeters/Developer/bi-chat/src/lib/connected-tables.ts)
- [src/lib/duckdb/path.ts](/Users/paulpeters/Developer/bi-chat/src/lib/duckdb/path.ts)
- [src/lib/duckdb/duckdb-attachments.ts](/Users/paulpeters/Developer/bi-chat/src/lib/duckdb/duckdb-attachments.ts)
- [src/components/connected-data-panel.tsx](/Users/paulpeters/Developer/bi-chat/src/components/connected-data-panel.tsx)

## Suggested outline

1. Source types and support status
2. Connection identifier formats
3. Browser vs remote backend behavior
4. Schema/table discovery
5. Known edge cases
