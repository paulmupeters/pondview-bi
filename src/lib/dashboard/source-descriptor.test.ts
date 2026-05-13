import { describe, expect, test } from "bun:test";
import {
  buildDashboardSourceDescriptor,
  parseDashboardSourceDescriptorJson,
  serializeDashboardSourceDescriptor,
} from "@/lib/dashboard/source-descriptor";

describe("dashboard source descriptors", () => {
  test("classifies runtime wasm descriptors canonically", () => {
    expect(
      buildDashboardSourceDescriptor({
        runtimeBackend: "duckdb-wasm",
      }),
    ).toEqual({
      kind: "runtime",
      runtimeBackend: "duckdb-wasm",
      dbIdentifier: "wasm:local",
      catalogContext: null,
    });
  });

  test("classifies motherduck descriptors distinctly from runtime sources", () => {
    expect(
      buildDashboardSourceDescriptor({
        runtimeBackend: "duckdb-http",
        dbIdentifier: "md:analytics",
      }),
    ).toEqual({
      kind: "motherduck",
      runtimeBackend: "duckdb-http",
      dbIdentifier: "md:analytics",
      catalogContext: null,
    });
  });

  test("round-trips external descriptors through JSON serialization", () => {
    const descriptor = buildDashboardSourceDescriptor({
      runtimeBackend: "bridge",
      dbIdentifier: "sqlite:/tmp/warehouse.db",
      catalogContext: "warehouse",
    });

    expect(
      parseDashboardSourceDescriptorJson(
        serializeDashboardSourceDescriptor(descriptor),
      ),
    ).toEqual(descriptor);
  });

  test("classifies Quack descriptors as external DuckDB sources", () => {
    expect(
      buildDashboardSourceDescriptor({
        runtimeBackend: "bridge",
        dbIdentifier: "quack:analytics.example.com:443",
        catalogContext: "analytics",
      }),
    ).toEqual({
      kind: "external",
      runtimeBackend: "bridge",
      dbIdentifier: "quack:analytics.example.com:443",
      catalogContext: "analytics",
      externalType: "quack",
    });
  });
});
