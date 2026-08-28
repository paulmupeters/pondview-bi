import { describe, expect, test } from "bun:test";
import type { DuckdbWasmProvider } from "@/lib/duckdb/duckdb-wasm";
import { DuckdbWasmClient } from "@/lib/duckdb/duckdb-wasm-client";

describe("DuckdbWasmClient.importBrowserFile", () => {
  test("loads the Excel extension and imports the selected XLSX worksheet", async () => {
    const queries: string[] = [];
    const registeredFiles: string[] = [];
    const provider = {
      getCurrentWasm: async () => ({
        db: {
          registerFileHandle: async (name: string) => {
            registeredFiles.push(name);
          },
        },
        con: {
          query: async (sql: string) => {
            queries.push(sql);
            return {};
          },
        },
      }),
    } as unknown as DuckdbWasmProvider;
    const client = new DuckdbWasmClient(provider);
    const file = new File([new Uint8Array([1, 2, 3])], "workbook.xlsx");

    await client.importBrowserFile({
      file,
      registeredName: "uploads/workbook.xlsx",
      schema: "uploads",
      tableName: "workbook_123",
      format: "xlsx",
      xlsxSheet: "Q1's Results",
    });

    expect(registeredFiles).toEqual(["uploads/workbook.xlsx"]);
    expect(queries).toEqual([
      "INSTALL excel;",
      "LOAD excel;",
      'CREATE SCHEMA IF NOT EXISTS "uploads"',
      "CREATE OR REPLACE TABLE \"uploads\".\"workbook_123\" AS SELECT * FROM read_xlsx('uploads/workbook.xlsx', sheet = 'Q1''s Results')",
      "CHECKPOINT",
    ]);
  });

  test("rejects XLSX imports without a selected worksheet", async () => {
    let providerCalls = 0;
    const provider = {
      getCurrentWasm: async () => {
        providerCalls += 1;
        throw new Error("Provider should not be called");
      },
    } as unknown as DuckdbWasmProvider;
    const client = new DuckdbWasmClient(provider);

    await expect(
      client.importBrowserFile({
        file: new File([], "workbook.xlsx"),
        registeredName: "uploads/workbook.xlsx",
        schema: "uploads",
        tableName: "workbook_123",
        format: "xlsx",
      }),
    ).rejects.toThrow("Select a worksheet before importing an XLSX file.");
    expect(providerCalls).toBe(0);
  });
});
