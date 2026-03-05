import { afterEach, describe, expect, test } from "bun:test";
import { resolveGatewayModel } from "@/ai/gateway-model";
import {
  AI_MODEL_STORAGE_KEY,
  AI_PROVIDER_STORAGE_KEY,
  OPEN_RESPONSES_PROVIDER_NAME_STORAGE_KEY,
  OPEN_RESPONSES_URL_STORAGE_KEY,
  getApiKeyStorageKeyForProvider,
  type AiProvider,
} from "@/ai/settings";

type LocalStorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function createStorage(): LocalStorageLike {
  const store = new Map<string, string>();

  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
}

function setBrowserStorage(storage: LocalStorageLike) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      localStorage: storage,
    },
  });
}

const originalWindow = (globalThis as { window?: unknown }).window;

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: originalWindow,
  });
});

function configureProvider(provider: AiProvider, options?: { model?: string }) {
  const storage = createStorage();
  storage.setItem(AI_PROVIDER_STORAGE_KEY, provider);
  storage.setItem(AI_MODEL_STORAGE_KEY, options?.model ?? "test-model");
  storage.setItem(getApiKeyStorageKeyForProvider(provider), "test-key");

  if (provider === "open-responses") {
    storage.setItem(OPEN_RESPONSES_URL_STORAGE_KEY, "https://api.example.com/v1");
    storage.setItem(OPEN_RESPONSES_PROVIDER_NAME_STORAGE_KEY, "example");
  }

  return storage;
}

describe("resolveGatewayModel", () => {
  test("resolves configured providers in browser", () => {
    const providers: AiProvider[] = [
      "gateway",
      "openai",
      "anthropic",
      "xai",
      "open-responses",
    ];

    for (const provider of providers) {
      const storage = configureProvider(provider);
      setBrowserStorage(storage);

      const model = resolveGatewayModel("fallback-model");
      expect(model).toBeTruthy();
    }
  });

  test("throws when api key is missing", () => {
    const storage = createStorage();
    storage.setItem(AI_PROVIDER_STORAGE_KEY, "openai");
    storage.setItem(AI_MODEL_STORAGE_KEY, "gpt-4.1");
    setBrowserStorage(storage);

    expect(() => resolveGatewayModel("fallback-model")).toThrow(
      "Missing OpenAI API key",
    );
  });

  test("throws when model is missing", () => {
    const storage = configureProvider("gateway", { model: "" });
    setBrowserStorage(storage);

    expect(() => resolveGatewayModel("fallback-model")).toThrow(
      "Missing model",
    );
  });

  test("throws when open responses URL is missing", () => {
    const storage = createStorage();
    storage.setItem(AI_PROVIDER_STORAGE_KEY, "open-responses");
    storage.setItem(AI_MODEL_STORAGE_KEY, "gpt-4.1");
    storage.setItem(getApiKeyStorageKeyForProvider("open-responses"), "test-key");
    storage.setItem(OPEN_RESPONSES_PROVIDER_NAME_STORAGE_KEY, "example");
    setBrowserStorage(storage);

    expect(() => resolveGatewayModel("fallback-model")).toThrow(
      "Missing Open Responses URL",
    );
  });

  test("uses server fallback when window is unavailable", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: undefined,
    });

    const model = resolveGatewayModel("moonshotai/kimi-k2.5");
    expect(model).toBeTruthy();
  });
});
