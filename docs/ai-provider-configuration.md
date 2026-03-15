# AI Provider Configuration

Status: Placeholder

## Why this doc should exist

The app now supports multiple AI providers and stores most end-user AI configuration in browser storage, but the current docs mostly describe an older env-driven OpenAI setup.

## What this doc should eventually cover

- Which provider options exist in Settings
- Which settings are stored in browser storage vs environment variables
- Default model IDs and fallback behavior
- Browser-first model resolution and fallback behavior
- Common failure modes: missing API key, blocked browser requests, bad model ID

## Relevant files

- [src/app/settings/page.tsx](/Users/paulpeters/Developer/bi-chat/src/app/settings/page.tsx)
- [src/ai/settings.ts](/Users/paulpeters/Developer/bi-chat/src/ai/settings.ts)
- [src/ai/models.ts](/Users/paulpeters/Developer/bi-chat/src/ai/models.ts)
- [src/ai/gateway-model.ts](/Users/paulpeters/Developer/bi-chat/src/ai/gateway-model.ts)
- [src/components/chat.tsx](/Users/paulpeters/Developer/bi-chat/src/components/chat.tsx)

## Suggested outline

1. Browser-first AI setup flow
2. Provider matrix
3. Local storage keys
4. Runtime caveats
5. Troubleshooting
