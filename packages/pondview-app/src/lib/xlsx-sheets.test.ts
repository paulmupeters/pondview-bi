import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import { readXlsxSheetNames } from "@/lib/xlsx-sheets";

describe("readXlsxSheetNames", () => {
  test("reads workbook sheet names from an XLSX archive", async () => {
    const archive = zipSync({
      "xl/workbook.xml": strToU8(
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
          "<sheets>",
          '<sheet name="Orders" sheetId="1" r:id="rId1"/>',
          '<sheet name="Revenue &amp; Costs" sheetId="2" r:id="rId2"/>',
          "</sheets>",
          "</workbook>",
        ].join(""),
      ),
    });

    const bytes = Uint8Array.from(archive);
    const file = new File([bytes.buffer as ArrayBuffer], "workbook.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    await expect(readXlsxSheetNames(file)).resolves.toEqual([
      "Orders",
      "Revenue & Costs",
    ]);
  });
});
