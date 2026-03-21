import { describe, expect, test } from "bun:test";
import { resolveDbPath } from "@/lib/duckdb/path";

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
});
