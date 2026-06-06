import { CHAT_MODEL, VISUALIZATION_MODEL } from "@/ai/models";

export type AiProvider =
  | "openai"
  | "gateway"
  | "anthropic"
  | "ollama"
  | "openai-compatible"
  | "xai";

export interface AiSettings {
  provider: AiProvider;
  model: string;
  visualizationModel: string;
  apiKey: string;
  ollamaBaseUrl?: string;
  openAiCompatibleUrl?: string;
  openAiCompatibleName?: string;
}

export const AI_PROVIDER_STORAGE_KEY = "AI_PROVIDER";
export const AI_MODEL_STORAGE_KEY = "AI_MODEL";
export const AI_VISUALIZATION_MODEL_STORAGE_KEY = "AI_VISUALIZATION_MODEL";
export const OPENAI_COMPATIBLE_URL_STORAGE_KEY = "OPENAI_COMPATIBLE_URL";
export const OPENAI_COMPATIBLE_PROVIDER_NAME_STORAGE_KEY =
  "OPENAI_COMPATIBLE_PROVIDER_NAME";
export const OLLAMA_BASE_URL_STORAGE_KEY = "OLLAMA_BASE_URL";

export const XAI_BASE_URL = "https://api.x.ai/v1";
export const XAI_PROVIDER_NAME = "xai";
export const OLLAMA_BASE_URL = "http://localhost:11434/v1";
export const OLLAMA_PROVIDER_NAME = "ollama";

export const AI_SETTINGS_UPDATED_EVENT = "bi-chat:ai-settings-updated";

const AI_PROVIDER_API_KEY_STORAGE_KEYS: Record<AiProvider, string> = {
  gateway: "AI_GATEWAY_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  ollama: "OLLAMA_API_KEY",
  "openai-compatible": "OPENAI_COMPATIBLE_API_KEY",
  xai: "XAI_API_KEY",
};

const AI_PROVIDER_DISPLAY_NAMES: Record<AiProvider, string> = {
  gateway: "Vercel Gateway",
  openai: "OpenAI",
  anthropic: "Anthropic",
  ollama: "Ollama",
  "openai-compatible": "OpenAI Compatible",
  xai: "xAI",
};

const AI_PROVIDERS: AiProvider[] = [
  "gateway",
  "openai",
  "anthropic",
  "ollama",
  "openai-compatible",
  "xai",
];

function normalizeText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function getDevelopmentGatewayApiKey(): string {
  if (typeof __DEV_AI_GATEWAY_API_KEY__ === "undefined") {
    return "";
  }

  return normalizeText(__DEV_AI_GATEWAY_API_KEY__);
}

function hasBrowserStorage(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined" &&
    typeof window.sessionStorage !== "undefined"
  );
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
  if (!hasBrowserStorage()) {
    return "";
  }

  const key = getApiKeyStorageKeyForProvider(provider);
  const sessionValue = normalizeText(window.sessionStorage.getItem(key));
  if (sessionValue) {
    window.localStorage.removeItem(key);
    return sessionValue;
  }

  const legacyLocalValue = normalizeText(window.localStorage.getItem(key));
  if (legacyLocalValue) {
    window.sessionStorage.setItem(key, legacyLocalValue);
    window.localStorage.removeItem(key);
  }
  if (legacyLocalValue) {
    return legacyLocalValue;
  }

  return provider === "gateway" ? getDevelopmentGatewayApiKey() : "";
}

export function loadAiSettingsFromStorage(): AiSettings {
  const fallbackModel = CHAT_MODEL;

  if (!hasBrowserStorage()) {
    return {
      provider: "openai",
      model: fallbackModel,
      visualizationModel: VISUALIZATION_MODEL,
      apiKey: "",
      ollamaBaseUrl: OLLAMA_BASE_URL,
      openAiCompatibleName: "",
      openAiCompatibleUrl: "",
    };
  }

  const rawProvider = window.localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
  const provider: AiProvider = isAiProvider(rawProvider)
    ? rawProvider
    : getDevelopmentGatewayApiKey()
      ? "gateway"
      : "openai";
  const rawModel = window.localStorage.getItem(AI_MODEL_STORAGE_KEY);
  const model = rawModel === null ? fallbackModel : normalizeText(rawModel);
  const rawVisualizationModel = window.localStorage.getItem(
    AI_VISUALIZATION_MODEL_STORAGE_KEY,
  );
  const visualizationModel =
    rawVisualizationModel === null
      ? VISUALIZATION_MODEL
      : normalizeText(rawVisualizationModel);

  return {
    provider,
    model,
    visualizationModel,
    apiKey: getProviderApiKeyFromStorage(provider),
    ollamaBaseUrl:
      normalizeText(window.localStorage.getItem(OLLAMA_BASE_URL_STORAGE_KEY)) ||
      OLLAMA_BASE_URL,
    openAiCompatibleUrl: normalizeText(
      window.localStorage.getItem(OPENAI_COMPATIBLE_URL_STORAGE_KEY),
    ),
    openAiCompatibleName: normalizeText(
      window.localStorage.getItem(OPENAI_COMPATIBLE_PROVIDER_NAME_STORAGE_KEY),
    ),
  };
}

export function saveAiSettingsToStorage(settings: AiSettings): void {
  if (!hasBrowserStorage()) {
    return;
  }

  window.localStorage.setItem(AI_PROVIDER_STORAGE_KEY, settings.provider);
  window.localStorage.setItem(AI_MODEL_STORAGE_KEY, settings.model.trim());
  const visualizationModel = settings.visualizationModel.trim();
  if (visualizationModel) {
    window.localStorage.setItem(
      AI_VISUALIZATION_MODEL_STORAGE_KEY,
      visualizationModel,
    );
  } else {
    window.localStorage.removeItem(AI_VISUALIZATION_MODEL_STORAGE_KEY);
  }
  window.sessionStorage.setItem(
    getApiKeyStorageKeyForProvider(settings.provider),
    settings.apiKey.trim(),
  );
  window.localStorage.removeItem(
    getApiKeyStorageKeyForProvider(settings.provider),
  );

  window.localStorage.setItem(
    OLLAMA_BASE_URL_STORAGE_KEY,
    (settings.ollamaBaseUrl ?? OLLAMA_BASE_URL).trim() || OLLAMA_BASE_URL,
  );
  window.localStorage.setItem(
    OPENAI_COMPATIBLE_URL_STORAGE_KEY,
    (settings.openAiCompatibleUrl ?? "").trim(),
  );
  window.localStorage.setItem(
    OPENAI_COMPATIBLE_PROVIDER_NAME_STORAGE_KEY,
    (settings.openAiCompatibleName ?? "").trim(),
  );

  window.dispatchEvent(new Event(AI_SETTINGS_UPDATED_EVENT));
}

export function clearAiProviderApiKeyFromSession(provider: AiProvider): void {
  if (!hasBrowserStorage()) {
    return;
  }

  window.sessionStorage.removeItem(getApiKeyStorageKeyForProvider(provider));
  window.dispatchEvent(new Event(AI_SETTINGS_UPDATED_EVENT));
}

export function hasRequiredAiConfigurationInStorage(): boolean {
  if (!hasBrowserStorage()) {
    return false;
  }

  return getMissingRequiredSetting(loadAiSettingsFromStorage()) === null;
}

export function getMissingRequiredSetting(settings: AiSettings): string | null {
  if (!normalizeText(settings.model)) {
    return "model";
  }

  if (settings.provider !== "ollama" && !normalizeText(settings.apiKey)) {
    return `${getAiProviderDisplayName(settings.provider)} API key`;
  }

  if (settings.provider === "openai-compatible") {
    if (!normalizeText(settings.openAiCompatibleUrl)) {
      return "OpenAI Compatible URL";
    }

    if (!normalizeText(settings.openAiCompatibleName)) {
      return "OpenAI Compatible provider name";
    }
  }

  return null;
}
