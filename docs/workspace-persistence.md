# Workspace Persistence

Status: Placeholder

## Why this doc should exist

Chats, dashboards, preferences, saved SQL, and uploads all rely on browser-local workspace storage and import/export helpers. That is core app behavior, but it is not documented in one place today.

## What this doc should eventually cover

- What the workspace stores
- Which stores use IndexedDB vs localStorage
- Import/export/reset behavior
- Server-side repositories vs browser workspace repositories
- Compatibility/versioning expectations

## Relevant files

- [src/lib/workspace/workspace-db.ts](/Users/paulpeters/Developer/bi-chat/src/lib/workspace/workspace-db.ts)
- [src/lib/workspace/export-import.ts](/Users/paulpeters/Developer/bi-chat/src/lib/workspace/export-import.ts)
- [src/lib/workspace/chat-repo.ts](/Users/paulpeters/Developer/bi-chat/src/lib/workspace/chat-repo.ts)
- [src/lib/workspace/dashboard-repo.ts](/Users/paulpeters/Developer/bi-chat/src/lib/workspace/dashboard-repo.ts)
- [src/lib/workspace/preferences-repo.ts](/Users/paulpeters/Developer/bi-chat/src/lib/workspace/preferences-repo.ts)
- [src/app/settings/page.tsx](/Users/paulpeters/Developer/bi-chat/src/app/settings/page.tsx)

## Suggested outline

1. Storage architecture
2. Data model by feature
3. Import/export format
4. Reset semantics
5. Migration notes
