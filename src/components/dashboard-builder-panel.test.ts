import { describe, expect, test } from "bun:test";
import { resolveStoredChartDbIdentifier } from "@/components/dashboard-builder-panel";

describe("resolveStoredChartDbIdentifier", () => {
  test("does not fall back to selectedDbIdentifier for remote runtime charts", () => {
    expect(
      resolveStoredChartDbIdentifier({
        sqlBackend: "duckdb-http",
        payloadDbIdentifier: undefined,
        selectedDbIdentifier: "duckdb:connected-runtime",
      }),
    ).toBeNull();
  });

  test("keeps explicit non-wasm db identifiers for remote external sources", () => {
    expect(
      resolveStoredChartDbIdentifier({
        sqlBackend: "duckdb-http",
        payloadDbIdentifier: "sqlite:/tmp/warehouse.db",
        selectedDbIdentifier: "duckdb:connected-runtime",
      }),
    ).toBe("sqlite:/tmp/warehouse.db");
  });
});
