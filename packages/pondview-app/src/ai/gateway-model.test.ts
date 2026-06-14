import { afterEach, describe, expect, test } from "bun:test";
import {
  resolveGatewayModel,
  resolveVisualizationGatewayModel,
} from "@/ai/gateway-model";
import {
  AI_MODEL_STORAGE_KEY,
  AI_PROVIDER_STORAGE_KEY,
  AI_VISUALIZATION_MODEL_STORAGE_KEY,
  type AiProvider,
  getApiKeyStorageKeyForProvider,
  loadAiSettingsFromStorage,
  OPENAI_COMPATIBLE_PROVIDER_NAME_STORAGE_KEY,
  OPENAI_COMPATIBLE_URL_STORAGE_KEY,
  saveAiSettingsToStorage,
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
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
}

function setBrowserStorage(
  storage: LocalStorageLike,
  sessionStorage: LocalStorageLike = storage,
) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      localStorage: storage,
      sessionStorage,
      dispatchEvent: () => true,
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
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  localStorage.setItem(AI_PROVIDER_STORAGE_KEY, provider);
  localStorage.setItem(AI_MODEL_STORAGE_KEY, options?.model ?? "test-model");
  sessionStorage.setItem(getApiKeyStorageKeyForProvider(provider), "test-key");

  if (provider === "openai-compatible") {
    localStorage.setItem(
      OPENAI_COMPATIBLE_URL_STORAGE_KEY,
      "https://api.example.com/v1",
    );
    localStorage.setItem(
      OPENAI_COMPATIBLE_PROVIDER_NAME_STORAGE_KEY,
      "example",
    );
  }

  return { localStorage, sessionStorage };
}

describe("resolveGatewayModel", () => {
  test("resolves configured providers in browser", () => {
    const providers: AiProvider[] = [
      "gateway",
      "openai",
      "anthropic",
      "ollama",
      "openai-compatible",
      "xai",
    ];

    for (const provider of providers) {
      const { localStorage, sessionStorage } = configureProvider(provider);
      setBrowserStorage(localStorage, sessionStorage);

      const model = resolveGatewayModel("fallback-model");
      expect(model).toBeTruthy();
    }
  });

  test("throws when api key is missing", () => {
    const storage = createStorage();
    storage.setItem(AI_PROVIDER_STORAGE_KEY, "openai");
    storage.setItem(AI_MODEL_STORAGE_KEY, "gpt-4.1");
    setBrowserStorage(storage, createStorage());

    expect(() => resolveGatewayModel("fallback-model")).toThrow(
      "Missing OpenAI API key",
    );
  });

  test("uses the call-site fallback model when no model is stored", () => {
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    localStorage.setItem(AI_PROVIDER_STORAGE_KEY, "gateway");
    sessionStorage.setItem(
      getApiKeyStorageKeyForProvider("gateway"),
      "test-key",
    );
    setBrowserStorage(localStorage, sessionStorage);

    const model = resolveGatewayModel("google/gemini-3-flash") as {
      modelId?: string;
    };

    expect(model.modelId).toBe("google/gemini-3-flash");
  });

  test("uses a separate visualization model when configured", () => {
    const { localStorage, sessionStorage } = configureProvider("gateway", {
      model: "openai/gpt-5.4",
    });
    localStorage.setItem(
      AI_VISUALIZATION_MODEL_STORAGE_KEY,
      "google/gemini-3-flash",
    );
    setBrowserStorage(localStorage, sessionStorage);

    const chatModel = resolveGatewayModel("fallback-model") as {
      modelId?: string;
    };
    const visualizationModel = resolveVisualizationGatewayModel(
      "fallback-visualization-model",
    ) as { modelId?: string };

    expect(chatModel.modelId).toBe("openai/gpt-5.4");
    expect(visualizationModel.modelId).toBe("google/gemini-3-flash");
  });

  test("does not require an api key for ollama", () => {
    const storage = createStorage();
    storage.setItem(AI_PROVIDER_STORAGE_KEY, "ollama");
    storage.setItem(AI_MODEL_STORAGE_KEY, "llama3.2");
    setBrowserStorage(storage, createStorage());

    const model = resolveGatewayModel("fallback-model");
    expect(model).toBeTruthy();
  });

  test("throws when model is missing", () => {
    const { localStorage, sessionStorage } = configureProvider("openai", {
      model: "",
    });
    setBrowserStorage(localStorage, sessionStorage);

    expect(() => resolveGatewayModel("fallback-model")).toThrow(
      "Missing model",
    );
  });

  test("throws when openai compatible URL is missing", () => {
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    localStorage.setItem(AI_PROVIDER_STORAGE_KEY, "openai-compatible");
    localStorage.setItem(AI_MODEL_STORAGE_KEY, "gpt-4.1");
    sessionStorage.setItem(
      getApiKeyStorageKeyForProvider("openai-compatible"),
      "test-key",
    );
    localStorage.setItem(
      OPENAI_COMPATIBLE_PROVIDER_NAME_STORAGE_KEY,
      "example",
    );
    setBrowserStorage(localStorage, sessionStorage);

    expect(() => resolveGatewayModel("fallback-model")).toThrow(
      "Missing OpenAI Compatible URL",
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

  test("stores provider api keys in session storage only", () => {
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    setBrowserStorage(localStorage, sessionStorage);

    saveAiSettingsToStorage({
      provider: "openai",
      model: "gpt-4.1",
      visualizationModel: "google/gemini-3-flash",
      apiKey: "sk-session",
      openAiCompatibleName: "",
      openAiCompatibleUrl: "",
    });

    expect(localStorage.getItem(getApiKeyStorageKeyForProvider("openai"))).toBe(
      null,
    );
    expect(
      sessionStorage.getItem(getApiKeyStorageKeyForProvider("openai")),
    ).toBe("sk-session");
    expect(loadAiSettingsFromStorage()).toMatchObject({
      provider: "openai",
      model: "gpt-4.1",
      visualizationModel: "google/gemini-3-flash",
      apiKey: "sk-session",
    });
  });
});
