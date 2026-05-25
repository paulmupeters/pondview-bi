import { describe, expect, test } from "bun:test";
import { detectExternalConnection, resolveDbPath } from "@/lib/duckdb/path";

describe("resolveDbPath", () => {
  test("preserves explicit MotherDuck tokens", () => {
    expect(resolveDbPath("md:my_db?motherduck_token=abc123")).toBe(
      "md:my_db?motherduck_token=abc123",
    );
  });

  test("keeps bare MotherDuck identifiers unchanged", () => {
    expect(resolveDbPath("md:my_db")).toBe("md:my_db");
  });

  test("normalizes duckdb-prefixed MotherDuck identifiers", () => {
    expect(resolveDbPath("duckdb:md:my_db")).toBe("md:my_db");
  });

  test("detects Quack remote identifiers", () => {
    expect(detectExternalConnection("quack:localhost:9494")).toEqual({
      type: "quack",
      identifier: "quack:localhost:9494",
      duckdbExtension: "quack",
      duckdbExtensionRepository: "core_nightly",
      readOnly: false,
      attachOptions: {
        type: "quack",
      },
    });
  });

  test("detects HTTPFS remote file identifiers", () => {
    expect(
      detectExternalConnection("https://data.example.com/events.parquet"),
    ).toEqual({
      type: "httpfs",
      identifier: "https://data.example.com/events.parquet",
      duckdbExtension: "httpfs",
      readOnly: true,
    });
  });
});
