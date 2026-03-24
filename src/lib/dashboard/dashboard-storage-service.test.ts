import { describe, expect, test } from "bun:test";
import {
  resolveJoinDefsForNewDashboard,
  resolveTargetForSource,
} from "@/lib/dashboard/dashboard-storage-service";
import { DEFAULT_WASM_DB_IDENTIFIER } from "@/lib/sql/sql-runtime";

describe("resolveTargetForSource", () => {
  test("keeps remote runtime-default dashboards on the selected remote backend", () => {
    const target = resolveTargetForSource({
      dbIdentifier: DEFAULT_WASM_DB_IDENTIFIER,
      sqlBackend: "duckdb-http",
    });

    expect(target.kind).toBe("runtime-default");
    expect(target.dbIdentifier).toBeNull();
    expect(target.sqlBackend).toBe("duckdb-http");
    expect(target.storageStatus).toBe("shared");
  });

  test("keeps bridge runtime-default dashboards shared", () => {
    const target = resolveTargetForSource({
      dbIdentifier: DEFAULT_WASM_DB_IDENTIFIER,
      sqlBackend: "bridge",
    });

    expect(target.kind).toBe("runtime-default");
    expect(target.storageStatus).toBe("shared");
  });

  test("keeps wasm dashboards best-effort", () => {
    const target = resolveTargetForSource({
      dbIdentifier: DEFAULT_WASM_DB_IDENTIFIER,
      sqlBackend: "duckdb-wasm",
    });

    expect(target.kind).toBe("wasm-local");
    expect(target.dbIdentifier).toBe(DEFAULT_WASM_DB_IDENTIFIER);
    expect(target.sqlBackend).toBe("duckdb-wasm");
    expect(target.storageStatus).toBe("best-effort");
  });
});

describe("resolveJoinDefsForNewDashboard", () => {
  test("uses global defaults only when join defs are omitted", () => {
    expect(resolveJoinDefsForNewDashboard([])).toEqual([]);
  });

  test("deduplicates explicitly provided join defs", () => {
    expect(
      resolveJoinDefsForNewDashboard([
        {
          leftTable: "orders",
          leftColumn: "customer_id",
          rightTable: "customers",
          rightColumn: "id",
          type: "left",
        },
        {
          leftTable: "orders",
          leftColumn: "customer_id",
          rightTable: "customers",
          rightColumn: "id",
          type: "left",
        },
      ]),
    ).toEqual([
      {
        leftTable: "orders",
        leftColumn: "customer_id",
        rightTable: "customers",
        rightColumn: "id",
        type: "left",
      },
    ]);
  });
});
