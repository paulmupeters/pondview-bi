import { strFromU8, unzipSync } from "fflate";

export async function readXlsxSheetNames(file: File): Promise<string[]> {
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const workbook = archive["xl/workbook.xml"];
  if (!workbook) {
    throw new Error("This XLSX file is missing workbook metadata.");
  }

  const xml = strFromU8(workbook);
  const names: string[] = [];
  const sheetPattern = /<sheet\b[^>]*\bname=(["'])(.*?)\1/gi;
  let match = sheetPattern.exec(xml);
  while (match !== null) {
    const name = decodeXmlEntities(match[2] ?? "").trim();
    if (name) {
      names.push(name);
    }
    match = sheetPattern.exec(xml);
  }

  if (names.length === 0) {
    throw new Error("No worksheets were found in this XLSX file.");
  }
  return names;
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
