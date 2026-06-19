import { describe, expect, test } from "bun:test";
import {
  getDefaultBridgeEndpoint,
  validateBridgeEndpoint,
} from "@/app/settings/page";

describe("getDefaultBridgeEndpoint", () => {
  test("defaults to the local bridge port when no bridge config is known", () => {
    expect(getDefaultBridgeEndpoint()).toBe("http://127.0.0.1:17817");
  });

  test("uses discovered bridge host and port when config is available", () => {
    expect(
      getDefaultBridgeEndpoint({
        host: "0.0.0.0",
        port: 18000,
        requiresAuth: false,
      }),
    ).toBe("http://127.0.0.1:18000");
  });
});

describe("validateBridgeEndpoint", () => {
  test("accepts empty endpoint for same-origin bridge requests", () => {
    expect(validateBridgeEndpoint("")).toBeNull();
  });

  test("accepts the default local bridge endpoint", () => {
    expect(validateBridgeEndpoint("http://127.0.0.1:17817")).toBeNull();
  });

  test("rejects non-http bridge endpoints", () => {
    expect(validateBridgeEndpoint("ftp://127.0.0.1:17817")).toBe(
      "CLI endpoint must use http or https.",
    );
  });
});
