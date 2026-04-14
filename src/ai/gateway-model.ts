import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGateway, gateway, type LanguageModel } from "ai";
import { createBrowserGatewayFetch } from "@/ai/browser-gateway-fetch";
import {
  type AiProvider,
  getAiProviderDisplayName,
  getMissingRequiredSetting,
  loadAiSettingsFromStorage,
  XAI_BASE_URL,
  XAI_PROVIDER_NAME,
} from "@/ai/settings";

function resolveBrowserModel(
  provider: AiProvider,
  modelId: string,
): LanguageModel {
  const settings = loadAiSettingsFromStorage();
  const missingSetting = getMissingRequiredSetting(settings);
  if (missingSetting) {
    throw new Error(
      `Missing ${missingSetting}. Open Settings to configure AI provider.`,
    );
  }

  switch (provider) {
    case "gateway": {
      const browserGateway = createGateway({
        apiKey: settings.apiKey,
        fetch: createBrowserGatewayFetch(),
      });
      return browserGateway(modelId);
    }
    case "openai": {
      const openAiProvider = createOpenAI({ apiKey: settings.apiKey });
      return openAiProvider(modelId);
    }
    case "anthropic": {
      const anthropicProvider = createAnthropic({ apiKey: settings.apiKey });
      return anthropicProvider(modelId);
    }
    case "xai": {
      const xaiProvider = createOpenAICompatible({
        apiKey: settings.apiKey,
        baseURL: XAI_BASE_URL,
        name: XAI_PROVIDER_NAME,
      });
      return xaiProvider(modelId);
    }
    case "openai-compatible": {
      const compatibleProvider = createOpenAICompatible({
        apiKey: settings.apiKey,
        baseURL: settings.openAiCompatibleUrl ?? "",
        name: settings.openAiCompatibleName ?? "",
      });
      return compatibleProvider(modelId);
    }
  }
}

/**
 * Resolve a language model for both browser and server runtimes.
 * - Browser: uses provider + credentials from Settings localStorage.
 * - Server: uses default gateway provider (env-driven).
 */
export function resolveGatewayModel(fallbackModelId: string): LanguageModel {
  if (typeof window === "undefined") {
    return gateway(fallbackModelId);
  }

  const settings = loadAiSettingsFromStorage();
  const modelId = settings.model.trim() || fallbackModelId;

  return resolveBrowserModel(settings.provider, modelId);
}

export function hasBrowserGatewayApiKey(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const settings = loadAiSettingsFromStorage();
    return Boolean(settings.apiKey.trim());
  } catch {
    return false;
  }
}

export function getSelectedAiProviderDisplayName(): string {
  if (typeof window === "undefined") {
    return getAiProviderDisplayName("gateway");
  }

  return getAiProviderDisplayName(loadAiSettingsFromStorage().provider);
}
