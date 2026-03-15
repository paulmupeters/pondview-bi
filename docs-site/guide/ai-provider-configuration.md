# AI Provider Configuration

BI Chat uses a browser-first AI configuration flow for the primary chat UI. Provider choice, model ID, and API keys are saved in local storage and used directly by the client-side agent.

## Where configuration is set

Open **Settings -> AI Provider Configuration** and set:

- Provider (`Gateway`, `OpenAI`, `Anthropic`, `xAI`, `Open Responses`)
- Model ID
- Provider API key
- For Open Responses only: base URL and provider name

All of these values are saved by `saveAiSettingsToStorage()` and reloaded by `loadAiSettingsFromStorage()`.

## Provider and required fields

| Provider | Required fields | Notes |
| --- | --- | --- |
| `gateway` | model, API key | Uses `createGateway(...)` in the browser. |
| `openai` | model, API key | Uses `createOpenAI(...)`. |
| `anthropic` | model, API key | Uses `createAnthropic(...)`. |
| `xai` | model, API key | Uses `createXai(...)`. |
| `open-responses` | model, API key, URL, provider name | Uses `createOpenResponses(...)`. |

Validation is enforced by `getMissingRequiredSetting()` before saving and when model resolution runs.

## Storage model

### Local storage keys

- `AI_PROVIDER`
- `AI_MODEL`
- Provider-specific API key key:
  - `AI_GATEWAY_API_KEY`
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `XAI_API_KEY`
  - `OPEN_RESPONSES_API_KEY`
- Open Responses extras:
  - `OPEN_RESPONSES_URL`
  - `OPEN_RESPONSES_PROVIDER_NAME`

### Defaults

- Default provider: `gateway`
- Default model fallback: `CHAT_MODEL` from `src/ai/models.ts` (`zai/glm-5`)
- If `AI_MODEL` is empty, the fallback model is used

## Runtime behavior: browser vs server

### Primary chat flow (browser)

The main chat UI uses `DirectChatTransport` with `createPondviewAgent(...)`. Model resolution comes from `resolveGatewayModel(...)`, which reads settings from browser local storage.

### Compatibility API routes (server)

`/api/chat` and `/api/chat/[chatId]` remain for compatibility/external callers. These routes are server-side and do **not** use browser local storage settings.

- `/api/chat` uses `LEGACY_CHAT_MODEL` (`openai/gpt-5-mini`)
- `/api/chat/[chatId]` uses `CHAT_MODEL` (`zai/glm-5`)

Treat these routes as separate from the browser-configured chat transport.

## Common failures and fixes

- Missing required settings: save provider, model, and key in Settings.
- Network/CORS errors in browser: verify provider endpoint accessibility and browser/network restrictions.
- Authentication failures: confirm provider key is valid for the selected provider.
- Bad model IDs: use a model ID supported by that provider endpoint.

The chat UI maps common low-level errors into clearer messages in `toPromptErrorMessage(...)`.
