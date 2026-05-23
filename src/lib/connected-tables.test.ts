import { describe, expect, test } from "bun:test";
import {
  sanitizeConnectedTableForStorage,
  sanitizeConnectedTablesForStorage,
} from "@/lib/connected-tables";

describe("sanitizeConnectedTableForStorage", () => {
  test("drops legacy entries backed by raw database paths", () => {
    expect(
      sanitizeConnectedTableForStorage({
        type: "postgres",
        databasePath:
          "host=db.example.test port=5432 user=admin password=secret dbname=main",
        schema: "public",
        tables: ["orders"],
      }),
    ).toBeNull();
  });

  test("keeps opaque connection identifiers and strips databasePath", () => {
    expect(
      sanitizeConnectedTableForStorage({
        type: "postgres",
        connectionId: "pg:warehouse",
        databasePath:
          "host=db.example.test port=5432 user=admin password=secret dbname=main",
        schema: "public",
        tables: ["orders"],
        attachAs: "warehouse",
        readOnly: true,
      }),
    ).toEqual({
      type: "postgres",
      connectionId: "pg:warehouse",
      schema: "public",
      tables: ["orders"],
      attachAs: "warehouse",
      readOnly: true,
    });
  });

  test("keeps non-secret quack connection metadata for wasm catalog fallback", () => {
    expect(
      sanitizeConnectedTableForStorage({
        type: "quack",
        connectionId: "quack:test",
        databaseName: "quack:localhost",
        attachAs: "test",
        schema: "main",
        tables: ["stations"],
        readOnly: false,
        duckdbExtension: "quack",
        duckdbExtensionRepository: "core_nightly",
      }),
    ).toEqual({
      type: "quack",
      connectionId: "quack:test",
      databaseName: "quack:localhost",
      attachAs: "test",
      schema: "main",
      tables: ["stations"],
      readOnly: false,
      duckdbExtension: "quack",
      duckdbExtensionRepository: "core_nightly",
    });
  });
});

describe("sanitizeConnectedTablesForStorage", () => {
  test("keeps only entries that can be safely persisted", () => {
    expect(
      sanitizeConnectedTablesForStorage([
        {
          type: "postgres",
          databasePath:
            "host=db.example.test port=5432 user=admin password=secret dbname=main",
          schema: "public",
          tables: ["orders"],
        },
        {
          type: "postgres",
          connectionId: "pg:warehouse",
          schema: "public",
          tables: ["orders"],
        },
      ]),
    ).toEqual([
      {
        type: "postgres",
        connectionId: "pg:warehouse",
        schema: "public",
        tables: ["orders"],
      },
    ]);
  });
});
