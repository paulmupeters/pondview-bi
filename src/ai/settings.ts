import { CHAT_MODEL } from "@/ai/models";

export type AiProvider =
  | "openai"
  | "gateway"
  | "anthropic"
  | "openai-compatible"
  | "xai";

export interface AiSettings {
  provider: AiProvider;
  model: string;
  apiKey: string;
  openAiCompatibleUrl?: string;
  openAiCompatibleName?: string;
}

export const AI_PROVIDER_STORAGE_KEY = "AI_PROVIDER";
export const AI_MODEL_STORAGE_KEY = "AI_MODEL";
export const OPENAI_COMPATIBLE_URL_STORAGE_KEY = "OPENAI_COMPATIBLE_URL";
export const OPENAI_COMPATIBLE_PROVIDER_NAME_STORAGE_KEY =
  "OPENAI_COMPATIBLE_PROVIDER_NAME";

export const XAI_BASE_URL = "https://api.x.ai/v1";
export const XAI_PROVIDER_NAME = "xai";

const AI_PROVIDER_API_KEY_STORAGE_KEYS: Record<AiProvider, string> = {
  gateway: "AI_GATEWAY_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  "openai-compatible": "OPENAI_COMPATIBLE_API_KEY",
  xai: "XAI_API_KEY",
};

const AI_PROVIDER_DISPLAY_NAMES: Record<AiProvider, string> = {
  gateway: "Gateway",
  openai: "OpenAI",
  anthropic: "Anthropic",
  "openai-compatible": "OpenAI Compatible",
  xai: "xAI",
};

const AI_PROVIDERS: AiProvider[] = [
  "gateway",
  "openai",
  "anthropic",
  "openai-compatible",
  "xai",
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
      openAiCompatibleName: "",
      openAiCompatibleUrl: "",
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
    openAiCompatibleUrl: normalizeText(
      window.localStorage.getItem(OPENAI_COMPATIBLE_URL_STORAGE_KEY),
    ),
    openAiCompatibleName: normalizeText(
      window.localStorage.getItem(OPENAI_COMPATIBLE_PROVIDER_NAME_STORAGE_KEY),
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
    OPENAI_COMPATIBLE_URL_STORAGE_KEY,
    (settings.openAiCompatibleUrl ?? "").trim(),
  );
  window.localStorage.setItem(
    OPENAI_COMPATIBLE_PROVIDER_NAME_STORAGE_KEY,
    (settings.openAiCompatibleName ?? "").trim(),
  );
}

export function getMissingRequiredSetting(settings: AiSettings): string | null {
  if (!normalizeText(settings.model)) {
    return "model";
  }

  if (!normalizeText(settings.apiKey)) {
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
