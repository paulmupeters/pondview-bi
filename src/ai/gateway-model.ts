import { createGateway, gateway, type LanguageModel } from "ai";

const AI_GATEWAY_API_KEY_STORAGE_KEY = "AI_GATEWAY_API_KEY";

function getBrowserGatewayApiKey(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const key = window.localStorage.getItem(AI_GATEWAY_API_KEY_STORAGE_KEY);
  const trimmed = key?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolve a gateway model for both browser and server runtimes.
 * - Browser: uses API key from Settings localStorage.
 * - Server: uses default gateway provider (env-driven).
 */
export function resolveGatewayModel(modelId: string): LanguageModel {
  const browserApiKey = getBrowserGatewayApiKey();
  if (browserApiKey) {
    const browserGateway = createGateway({ apiKey: browserApiKey });
    return browserGateway(modelId);
  }

  if (typeof window !== "undefined") {
    throw new Error(
      "Missing AI Gateway API key. Set AI_GATEWAY_API_KEY in Settings.",
    );
  }

  return gateway(modelId);
}

export function hasBrowserGatewayApiKey(): boolean {
  return getBrowserGatewayApiKey() !== null;
}
