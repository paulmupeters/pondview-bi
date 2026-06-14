import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  getDefaultPromptModePreference,
  resolvePromptModePreference,
  setDefaultPromptModePreference,
  subscribeDefaultPromptModePreference,
} from "@/lib/default-prompt-mode";

type StorageMap = Map<string, string>;

function createLocalStorageStub(store: StorageMap): Storage {
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.get(key) ?? null;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key) {
      store.delete(key);
    },
    setItem(key, value) {
      store.set(key, value);
    },
  };
}

let originalWindow: typeof globalThis.window | undefined;
let storageStore: StorageMap;

beforeEach(() => {
  originalWindow = globalThis.window;
  storageStore = new Map();
  const events = new EventTarget();
  const localStorage = createLocalStorageStub(storageStore);
  const windowStub = {
    localStorage,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  } as unknown as Window & typeof globalThis;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowStub,
    writable: true,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
    writable: true,
  });
});

describe("default prompt mode preference", () => {
  test("defaults to ai when no preference is stored", () => {
    expect(getDefaultPromptModePreference()).toBe("ai");
  });

  test("returns manual when the preference is stored", () => {
    storageStore.set("bi.prompt-mode.default", "manual");

    expect(getDefaultPromptModePreference()).toBe("manual");
  });

  test("falls back to ai for invalid stored values", () => {
    storageStore.set("bi.prompt-mode.default", "unexpected");

    expect(getDefaultPromptModePreference()).toBe("ai");
  });

  test("notifies subscribers when the preference changes", () => {
    const listener = mock(() => {});
    const unsubscribe = subscribeDefaultPromptModePreference(listener);

    setDefaultPromptModePreference("manual");

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe("resolvePromptModePreference", () => {
  test("uses the saved default when no mode param is provided", () => {
    expect(resolvePromptModePreference(null, "manual")).toBe("manual");
  });

  test("lets an ai mode param override a saved manual default", () => {
    expect(resolvePromptModePreference("ai", "manual")).toBe("ai");
  });

  test("lets a manual mode param override a saved ai default", () => {
    expect(resolvePromptModePreference("manual", "ai")).toBe("manual");
  });
});
