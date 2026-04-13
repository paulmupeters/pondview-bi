import { CHAT_MODEL } from "@/ai/models";

export type AiProvider = "openai" | "gateway" | "anthropic" | "open-responses";

export interface AiSettings {
  provider: AiProvider;
  model: string;
  apiKey: string;
  openResponsesUrl?: string;
  openResponsesName?: string;
}

export const AI_PROVIDER_STORAGE_KEY = "AI_PROVIDER";
export const AI_MODEL_STORAGE_KEY = "AI_MODEL";
export const OPEN_RESPONSES_URL_STORAGE_KEY = "OPEN_RESPONSES_URL";
export const OPEN_RESPONSES_PROVIDER_NAME_STORAGE_KEY =
  "OPEN_RESPONSES_PROVIDER_NAME";
export const AI_SETTINGS_UPDATED_EVENT = "ai:settings-updated";

const AI_PROVIDER_API_KEY_STORAGE_KEYS: Record<AiProvider, string> = {
  gateway: "AI_GATEWAY_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  "open-responses": "OPEN_RESPONSES_API_KEY",
};

const AI_PROVIDER_DISPLAY_NAMES: Record<AiProvider, string> = {
  gateway: "Gateway",
  openai: "OpenAI",
  anthropic: "Anthropic",
  "open-responses": "Open Responses",
};

const AI_PROVIDERS: AiProvider[] = [
  "gateway",
  "openai",
  "anthropic",
  "open-responses",
];

function normalizeText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function isAiProvider(
  value: string | null | undefined,
): value is AiProvider {
  return AI_PROVIDERS.includes((value ?? "") as AiProvider);
}

export function getAiProviderDisplayName(provider: AiProvider): string {
  return AI_PROVIDER_DISPLAY_NAMES[provider];
}

export function getApiKeyStorageKeyForProvider(provider: AiProvider): string {
  return AI_PROVIDER_API_KEY_STORAGE_KEYS[provider];
}

export function getProviderApiKeyFromStorage(provider: AiProvider): string {
  if (typeof window === "undefined") {
    return "";
  }

  return normalizeText(
    window.localStorage.getItem(getApiKeyStorageKeyForProvider(provider)),
  );
}

export function loadAiSettingsFromStorage(): AiSettings {
  const fallbackModel = CHAT_MODEL;

  if (typeof window === "undefined") {
    return {
      provider: "openai",
      model: fallbackModel,
      apiKey: "",
      openResponsesName: "",
      openResponsesUrl: "",
    };
  }

  const rawProvider = window.localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
  const provider: AiProvider = isAiProvider(rawProvider)
    ? rawProvider
    : "openai";
  const rawModel = window.localStorage.getItem(AI_MODEL_STORAGE_KEY);
  const model = rawModel === null ? fallbackModel : normalizeText(rawModel);

  return {
    provider,
    model,
    apiKey: getProviderApiKeyFromStorage(provider),
    openResponsesUrl: normalizeText(
      window.localStorage.getItem(OPEN_RESPONSES_URL_STORAGE_KEY),
    ),
    openResponsesName: normalizeText(
      window.localStorage.getItem(OPEN_RESPONSES_PROVIDER_NAME_STORAGE_KEY),
    ),
  };
}

export function saveAiSettingsToStorage(settings: AiSettings): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(AI_PROVIDER_STORAGE_KEY, settings.provider);
  window.localStorage.setItem(AI_MODEL_STORAGE_KEY, settings.model.trim());
  window.localStorage.setItem(
    getApiKeyStorageKeyForProvider(settings.provider),
    settings.apiKey.trim(),
  );

  window.localStorage.setItem(
    OPEN_RESPONSES_URL_STORAGE_KEY,
    (settings.openResponsesUrl ?? "").trim(),
  );
  window.localStorage.setItem(
    OPEN_RESPONSES_PROVIDER_NAME_STORAGE_KEY,
    (settings.openResponsesName ?? "").trim(),
  );
  window.dispatchEvent(new Event(AI_SETTINGS_UPDATED_EVENT));
}

export function getMissingRequiredSetting(settings: AiSettings): string | null {
  if (!normalizeText(settings.model)) {
    return "model";
  }

  if (!normalizeText(settings.apiKey)) {
    return `${getAiProviderDisplayName(settings.provider)} API key`;
  }

  if (settings.provider === "open-responses") {
    if (!normalizeText(settings.openResponsesUrl)) {
      return "Open Responses URL";
    }

    if (!normalizeText(settings.openResponsesName)) {
      return "Open Responses provider name";
    }
  }

  return null;
}

export function hasRequiredAiConfigurationInStorage(): boolean {
  return getMissingRequiredSetting(loadAiSettingsFromStorage()) === null;
}
