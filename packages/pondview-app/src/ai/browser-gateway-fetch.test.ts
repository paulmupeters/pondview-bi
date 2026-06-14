import { describe, expect, test } from "bun:test";
import {
  createBrowserGatewayFetch,
  sanitizeGatewayBrowserHeaders,
} from "@/ai/browser-gateway-fetch";

describe("sanitizeGatewayBrowserHeaders", () => {
  test("strips user-agent when headers are a plain object", () => {
    const sanitizedHeaders = sanitizeGatewayBrowserHeaders({
      "User-Agent": "ai-sdk/test",
      Authorization: "Bearer test",
    });

    expect(sanitizedHeaders.has("user-agent")).toBe(false);
    expect(sanitizedHeaders.get("authorization")).toBe("Bearer test");
  });

  test("strips user-agent when headers are a Headers instance", () => {
    const originalHeaders = new Headers({
      "user-agent": "ai-sdk/test",
      Authorization: "Bearer test",
    });

    const sanitizedHeaders = sanitizeGatewayBrowserHeaders(originalHeaders);

    expect(sanitizedHeaders.has("user-agent")).toBe(false);
    expect(originalHeaders.get("user-agent")).toBe("ai-sdk/test");
  });

  test("preserves required gateway and content headers", () => {
    const sanitizedHeaders = sanitizeGatewayBrowserHeaders({
      Authorization: "Bearer test",
      "Content-Type": "application/json",
      "ai-gateway-protocol-version": "0.0.1",
      "ai-language-model-id": "moonshotai/kimi-k2.5",
      "ai-language-model-streaming": "true",
    });

    expect(sanitizedHeaders.get("authorization")).toBe("Bearer test");
    expect(sanitizedHeaders.get("content-type")).toBe("application/json");
    expect(sanitizedHeaders.get("ai-gateway-protocol-version")).toBe("0.0.1");
    expect(sanitizedHeaders.get("ai-language-model-id")).toBe(
      "moonshotai/kimi-k2.5",
    );
    expect(sanitizedHeaders.get("ai-language-model-streaming")).toBe("true");
  });
});

describe("createBrowserGatewayFetch", () => {
  test("does not throw when init.headers is undefined", async () => {
    const calls: RequestInit[] = [];
    const mockFetch = Object.assign(
      async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        calls.push(init ?? {});
        return new Response(null, { status: 200 });
      },
      {
        preconnect: (_url: string | URL) => {},
      },
    );

    const wrappedFetch = createBrowserGatewayFetch(mockFetch);
    await wrappedFetch("https://example.com", { method: "POST" });
    await wrappedFetch("https://example.com");

    expect(calls).toHaveLength(2);
    const firstHeaders = new Headers(calls[0].headers);
    const secondHeaders = new Headers(calls[1].headers);
    expect(firstHeaders.has("user-agent")).toBe(false);
    expect(secondHeaders.has("user-agent")).toBe(false);
  });

  test("provides a safe preconnect function when source fetch lacks it", async () => {
    const mockFetch = async (
      _input: Parameters<typeof fetch>[0],
      _init?: RequestInit,
    ) => new Response(null, { status: 200 });
    const wrappedFetch = createBrowserGatewayFetch(mockFetch);

    expect(typeof wrappedFetch.preconnect).toBe("function");
    expect(() => wrappedFetch.preconnect("https://example.com")).not.toThrow();
  });
});
