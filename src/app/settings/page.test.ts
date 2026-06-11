import { describe, expect, test } from "bun:test";
import { getDefaultBridgeEndpoint } from "@/app/settings/page";

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
