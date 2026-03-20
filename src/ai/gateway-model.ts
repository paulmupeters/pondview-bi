import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenResponses } from "@ai-sdk/open-responses";
import { createOpenAI } from "@ai-sdk/openai";
// import { createXai } from "@ai-sdk/xai";
import { createGateway, gateway, type LanguageModel } from "ai";
import { createBrowserGatewayFetch } from "@/ai/browser-gateway-fetch";
import {
  type AiProvider,
  getAiProviderDisplayName,
  getMissingRequiredSetting,
  loadAiSettingsFromStorage,
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
      const provider = createOpenAI({ apiKey: settings.apiKey });
      return provider(modelId);
    }
    case "anthropic": {
      const provider = createAnthropic({ apiKey: settings.apiKey });
      return provider(modelId);
    }
    // case "xai": {
    //   const provider = createXai({ apiKey: settings.apiKey });
    //   return provider(modelId);
    // }
    case "open-responses": {
      const provider = createOpenResponses({
        apiKey: settings.apiKey,
        url: settings.openResponsesUrl ?? "",
        name: settings.openResponsesName ?? "",
      });
      return provider(modelId);
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
