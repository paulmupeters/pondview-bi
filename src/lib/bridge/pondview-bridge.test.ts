import { afterEach, describe, expect, test } from "bun:test";
import {
  clearBridgeConfigCache,
  clearSessionSecret,
  getBridgeConfigFromCache,
  getBridgeSession,
  hasSessionSecret,
  refreshBridgeConfig,
  runBridgeQuery,
  setSessionSecret,
} from "@/lib/bridge/pondview-bridge";

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

type Listener = (event: Event) => void;

function createStorage(): StorageLike {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

function createWindow(sessionStorage = createStorage()) {
  const listeners = new Map<string, Set<Listener>>();

  return {
    sessionStorage,
    addEventListener(type: string, listener: Listener) {
      const handlers = listeners.get(type) ?? new Set<Listener>();
      handlers.add(listener);
      listeners.set(type, handlers);
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event: Event) {
      listeners.get(event.type)?.forEach((listener) => {
        listener(event);
      });
      return true;
    },
  };
}

const originalWindow = (globalThis as { window?: unknown }).window;
const originalFetch = globalThis.fetch;

afterEach(() => {
  clearSessionSecret();
  clearBridgeConfigCache();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: originalWindow,
  });
  globalThis.fetch = originalFetch;
});

describe("pondview bridge browser state", () => {
  test("stores the session secret in sessionStorage for the current tab", async () => {
    const fakeWindow = createWindow();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: fakeWindow,
    });
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          host: "127.0.0.1",
          port: 4386,
          requires_auth: true,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      )) as unknown as typeof fetch;

    setSessionSecret(" secret ");
    await refreshBridgeConfig();

    expect(hasSessionSecret()).toBe(true);
    expect(fakeWindow.sessionStorage.getItem("bi.bridge.session-secret")).toBe(
      "secret",
    );
    expect(getBridgeConfigFromCache()).toEqual({
      host: "127.0.0.1",
      port: 4386,
      requiresAuth: true,
    });

    const session = await getBridgeSession();
    expect(session).toEqual({
      host: "127.0.0.1",
      port: 4386,
      requiresAuth: true,
      secret: "secret",
      hasSecret: true,
      isQueryReady: true,
    });
  });

  test("does not carry the session secret into a new tab", () => {
    const firstTab = createWindow();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: firstTab,
    });

    setSessionSecret("secret");
    expect(hasSessionSecret()).toBe(true);

    const secondTab = createWindow();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: secondTab,
    });

    expect(hasSessionSecret()).toBe(false);
    expect(secondTab.sessionStorage.getItem("bi.bridge.session-secret")).toBe(
      null,
    );
  });

  test("treats empty-secret bridge configs as query-ready without auth", async () => {
    const fakeWindow = createWindow();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: fakeWindow,
    });
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          host: "127.0.0.1",
          port: 4386,
          requires_auth: false,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      )) as unknown as typeof fetch;

    await refreshBridgeConfig();

    const session = await getBridgeSession();
    expect(session.hasSecret).toBe(false);
    expect(session.requiresAuth).toBe(false);
    expect(session.isQueryReady).toBe(true);
  });

  test("reads modern bridge query responses", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          columns: [{ name: "answer", type: "INTEGER" }],
          rows: [{ answer: 42 }],
          rowCount: 1,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      )) as unknown as typeof fetch;

    const result = await runBridgeQuery("SELECT 42 AS answer;");

    expect(result.columns).toEqual([{ name: "answer", type: "INTEGER" }]);
    expect(result.rows).toEqual([{ answer: 42 }]);
  });
});
