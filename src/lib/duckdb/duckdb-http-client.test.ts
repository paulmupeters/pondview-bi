import { describe, expect, test } from "bun:test";
import {
  buildDuckDbHttpHeaders,
  buildDuckDbHttpUrl,
  resolveHttpDuckDbConfigValues,
} from "@/lib/duckdb/duckdb-http-client";

describe("resolveHttpDuckDbConfigValues", () => {
  test("normalizes host and auth", () => {
    expect(
      resolveHttpDuckDbConfigValues({
        host: " 127.0.0.1 ",
        port: 8123,
        auth: " token ",
      }),
    ).toEqual({
      host: "127.0.0.1",
      port: 8123,
      auth: "token",
    });
  });
});

describe("buildDuckDbHttpHeaders", () => {
  test("sends token auth with X-API-Key", () => {
    expect(
      buildDuckDbHttpHeaders({
        host: "127.0.0.1",
        port: 8123,
        auth: "secret-token",
      }),
    ).toMatchObject({
      "Content-Type": "application/x-www-form-urlencoded",
      "X-API-Key": "secret-token",
    });
  });

  test("sends basic auth when auth contains user and password", () => {
    expect(
      buildDuckDbHttpHeaders({
        host: "127.0.0.1",
        port: 8123,
        auth: "alice:hunter2",
      }),
    ).toMatchObject({
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic YWxpY2U6aHVudGVyMg==",
    });
  });

  test("omits auth headers when auth is empty", () => {
    expect(
      buildDuckDbHttpHeaders({
        host: "127.0.0.1",
        port: 8123,
        auth: undefined,
      }),
    ).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
    });
  });
});

describe("buildDuckDbHttpUrl", () => {
  test("uses host protocol when provided", () => {
    expect(
      buildDuckDbHttpUrl({
        host: "https://duckdb.example.com",
        port: 443,
        auth: undefined,
      }).toString(),
    ).toBe("https://duckdb.example.com/?default_format=JSONCompact");
  });
});
