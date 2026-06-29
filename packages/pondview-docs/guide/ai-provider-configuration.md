# AI Provider Configuration

Pondview supports two AI configuration paths:

- With Bridge connected, provider credentials can be saved in the Bridge secret store and chat requests are sent through Bridge.
- Without Bridge, the browser-first flow keeps provider keys in browser session storage and sends requests from the browser.

## Where configuration is set

Open **Settings -> AI Provider Configuration** and set:

- Provider (`OpenAI`, `Anthropic`, `xAI`, `Ollama`, `OpenAI Compatible`, or `Vercel Gateway`)
- Model ID
- Provider API key, except for Ollama
- For Ollama: optional base URL, defaulting to `http://localhost:11434/v1`
- For OpenAI Compatible: base URL and provider name
- Optional advanced system prompt instructions

When Bridge is connected, Pondview can save the selected provider secret in the local Bridge secret store. By default that file lives at `${XDG_CONFIG_HOME:-~/.config}/pondview/secrets.json`; set `PONDVIEW_SECRETS_PATH` if you need to move it.

When Bridge is not connected, Pondview uses browser storage instead. API keys are kept only for the current browser session, so you may need to re-enter them after closing the tab or browser.

The advanced system prompt is appended to Pondview's built-in analysis instructions. Use it for team-specific tone, terminology, or analysis conventions while keeping the default SQL and visualization workflow in place.

## Provider and required fields

| Provider            | Required fields                    |
| ------------------- | ---------------------------------- |
| `openai`            | model, API key                     |
| `anthropic`         | model, API key                     |
| `xai`               | model, API key                     |
| `ollama`            | model                              |
| `openai-compatible` | model, API key, URL, provider name |
| `gateway`           | model, API key                     |

Pondview checks these fields before saving the configuration and again before starting an AI request.

## Storage model

Pondview stores provider settings differently depending on how you are running the app:

- Browser-only mode: provider choice, model, system prompt, and non-secret provider options are saved in the browser. API keys are saved in browser session storage and are not CLI environment variables.
- Bridge mode: provider secrets can be saved in the Bridge secret store. Bridge authentication settings such as `--token`, `--token-env`, and `PONDVIEW_TOKEN` are only for connecting to Bridge; they do not configure AI providers.

If you clear browser data, use a different browser profile, or open Pondview on another device, browser-only AI settings will not follow you. If you use Bridge, reconnecting to the same Bridge configuration can reuse the saved local secret store.

## How chat requests are sent

When Bridge has AI configuration, chat requests go through Bridge and use the provider credentials saved there. The saved system prompt is included with each chat request. Otherwise Pondview sends AI requests from the browser with the settings saved in **AI Provider Configuration**.

## Common failures and fixes

- Missing required settings: save provider, model, and key in Settings.
- Network/CORS errors in browser: verify provider endpoint accessibility and browser/network restrictions.
- Authentication failures: confirm provider key is valid for the selected provider.
- Bad model IDs: use a model ID supported by that provider endpoint.

Pondview tries to show clearer messages for common setup, authentication, network, and provider errors. If the message still looks provider-specific, check that provider's dashboard or API documentation for the exact meaning.
