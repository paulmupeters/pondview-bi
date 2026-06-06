import { describe, expect, test } from "bun:test";
import { buildUploadedTableName } from "@/lib/uploaded-files";

describe("buildUploadedTableName", () => {
  test("normalizes file names into DuckDB-safe upload table names", () => {
    expect(
      buildUploadedTableName("2026 Orders Export.csv", "abcdefghijk"),
    ).toBe("_2026_orders_export_abcdefgh");
    expect(buildUploadedTableName("!!!.parquet", "123456789")).toBe(
      "uploaded_file_12345678",
    );
  });
});
