# AI Provider Configuration

BI Chat supports two AI configuration paths:

- With Bridge query-ready, provider credentials can be saved in the Bridge secret store and chat requests are sent to Bridge.
- Without Bridge, the browser-first flow stores provider keys in session storage and uses the client-side agent directly.

## Where configuration is set

Open **Settings -> AI Provider Configuration** and set:

- Provider (`Gateway`, `OpenAI`, `Anthropic`, `xAI`, `Ollama`, `OpenAI Compatible`)
- Model ID
- Provider API key, except for Ollama
- For Ollama: optional base URL, defaulting to `http://localhost:11434/v1`
- For OpenAI Compatible: base URL and provider name

In browser-only mode these values are saved by `saveAiSettingsToStorage()` and reloaded by `loadAiSettingsFromStorage()`. In Bridge mode the provider secret is also written to `${XDG_CONFIG_HOME:-~/.config}/pondview/secrets.json` through the authenticated Bridge API.

## Provider and required fields

| Provider            | Required fields                    | Notes                                               |
| ------------------- | ---------------------------------- | --------------------------------------------------- |
| `gateway`           | model, API key                     | Uses `createGateway(...)` in the browser.           |
| `openai`            | model, API key                     | Uses `createOpenAI(...)`.                           |
| `anthropic`         | model, API key                     | Uses `createAnthropic(...)`.                        |
| `xai`               | model, API key                     | Uses `createOpenAICompatible(...)`.                 |
| `ollama`            | model                              | Uses `createOpenAICompatible(...)` against Ollama.  |
| `openai-compatible` | model, API key, URL, provider name | Uses `createOpenAICompatible(...)` for custom APIs. |

Validation is enforced by `getMissingRequiredSetting()` before saving and when model resolution runs.

## Storage model

### Browser storage keys

- `AI_PROVIDER`
- `AI_MODEL`
- Provider-specific API key key, stored in session storage for browser-only fallback:
  - `AI_GATEWAY_API_KEY`
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `XAI_API_KEY`
  - `OPENAI_COMPATIBLE_API_KEY`
- Ollama extras:
  - `OLLAMA_BASE_URL`
- OpenAI Compatible extras:
  - `OPENAI_COMPATIBLE_URL`
  - `OPENAI_COMPATIBLE_PROVIDER_NAME`

### Defaults

- Default provider: `openai`
- Default model fallback: `CHAT_MODEL` from `src/ai/models.ts`
- If `AI_MODEL` is empty, the fallback model is used

## Runtime behavior: browser only

### Primary chat flow

When Bridge has AI configuration, chat UI uses an HTTP chat transport to `/ai/chat`; Bridge resolves the provider credentials server-side. Otherwise the main chat UI uses `DirectChatTransport` with `createPondviewAgent(...)`, and model resolution comes from `resolveGatewayModel(...)`.

## Common failures and fixes

- Missing required settings: save provider, model, and key in Settings.
- Network/CORS errors in browser: verify provider endpoint accessibility and browser/network restrictions.
- Authentication failures: confirm provider key is valid for the selected provider.
- Bad model IDs: use a model ID supported by that provider endpoint.

The chat UI maps common low-level errors into clearer messages in `toPromptErrorMessage(...)`.
