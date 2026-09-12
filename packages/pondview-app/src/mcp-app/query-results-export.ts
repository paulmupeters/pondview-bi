import { formatQueryCell, type QueryResultColumn } from "./query-results-model";

export type QueryExportFormat = "csv" | "json";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const formatted = formatQueryCell(value);
  const spreadsheetSafe = /^[=+@]/.test(formatted)
    ? `'${formatted}`
    : formatted;
  return /[",\r\n]/.test(spreadsheetSafe)
    ? `"${spreadsheetSafe.replaceAll('"', '""')}"`
    : spreadsheetSafe;
}

export function serializeQueryCsv(
  columns: QueryResultColumn[],
  rows: Array<Record<string, unknown>>,
): string {
  const lines = [columns.map((column) => csvCell(column.name)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column.name])).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

export function serializeQueryJson(
  columns: QueryResultColumn[],
  rows: Array<Record<string, unknown>>,
): string {
  const normalizedRows = rows.map((row) =>
    Object.fromEntries(
      columns.map((column) => [column.name, row[column.name]]),
    ),
  );
  return JSON.stringify(
    normalizedRows,
    (_key, value) => (typeof value === "bigint" ? String(value) : value),
    2,
  );
}

export function createQueryExport(
  format: QueryExportFormat,
  columns: QueryResultColumn[],
  rows: Array<Record<string, unknown>>,
): { filename: string; mimeType: string; text: string } {
  if (format === "csv") {
    return {
      filename: "pondview-query-results.csv",
      mimeType: "text/csv;charset=utf-8",
      text: serializeQueryCsv(columns, rows),
    };
  }
  return {
    filename: "pondview-query-results.json",
    mimeType: "application/json",
    text: serializeQueryJson(columns, rows),
  };
}
