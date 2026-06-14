import { describe, expect, test } from "bun:test";
import { sanitizeSqlErrorMessage } from "@/lib/sql/error-sanitizer";

describe("sanitizeSqlErrorMessage", () => {
  test("redacts libpq-style connection strings", () => {
    const message =
      "DuckDB WASM cannot resolve database identifier `host=167.235.227.188 port=5432 user=admin password=supersecret dbname=main`.";

    expect(sanitizeSqlErrorMessage(message)).toBe(
      "DuckDB WASM cannot resolve database identifier `<redacted connection>`.",
    );
  });

  test("redacts credential-bearing URIs", () => {
    const message =
      "Failed to attach postgres://demo:supersecret@db.example.test:5432/analytics";

    expect(sanitizeSqlErrorMessage(message)).toBe(
      "Failed to attach <redacted connection>",
    );
  });

  test("leaves ordinary messages unchanged", () => {
    expect(sanitizeSqlErrorMessage("Connection unavailable")).toBe(
      "Connection unavailable",
    );
  });
});
