import type { Config, Result } from "@/lib/types";

function isNumericValue(value: unknown): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value !== "string" || value.trim() === "") {
    return false;
  }

  return Number.isFinite(Number(value));
}

function isLikelyTemporalColumn(name: string, values: unknown[]): boolean {
  const normalizedName = name.toLowerCase();
  if (
    /\b(date|time|day|week|month|quarter|year|created|updated|period)\b/.test(
      normalizedName,
    )
  ) {
    return true;
  }

  return values.some((value) => {
    if (value instanceof Date) {
      return true;
    }
    if (typeof value !== "string") {
      return false;
    }
    return !Number.isNaN(Date.parse(value));
  });
}

function prettifyColumnName(name: string): string {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function truncateTitle(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;
}

export function buildDeterministicChartConfig({
  rows,
  userQuery,
}: {
  rows: Result[];
  userQuery: string;
}): Config | null {
  const firstRow = rows[0];
  if (!firstRow) {
    return null;
  }

  const columnNames = Object.keys(firstRow);
  if (columnNames.length < 2) {
    return null;
  }

  const numericColumns = columnNames.filter((columnName) =>
    rows.some((row) => isNumericValue(row[columnName])),
  );

  if (numericColumns.length === 0) {
    return null;
  }

  const xKey =
    columnNames.find((columnName) => !numericColumns.includes(columnName)) ??
    columnNames.find((columnName) => columnName !== numericColumns[0]) ??
    columnNames[0];

  const yKeys = numericColumns.filter((columnName) => columnName !== xKey);
  if (yKeys.length === 0) {
    return null;
  }

  const xValues = rows.map((row) => row[xKey]);
  const chartType = isLikelyTemporalColumn(xKey, xValues) ? "line" : "bar";
  const primaryMeasure = prettifyColumnName(yKeys[0]);
  const dimension = prettifyColumnName(xKey);
  const requestedTitle = truncateTitle(userQuery);

  return {
    visualType: "chart",
    title: requestedTitle || `${primaryMeasure} by ${dimension}`,
    description: `Fallback ${chartType} chart using ${dimension} on the X axis and ${yKeys
      .map(prettifyColumnName)
      .join(", ")} on the Y axis.`,
    type: chartType,
    xKey,
    yKeys,
    multipleLines: false,
    legend: yKeys.length > 1,
    countMode: false,
    showGrid: true,
    showXAxis: true,
    showYAxis: true,
    showDots: chartType === "line",
    showTooltip: true,
    lineSize: 2,
    labelYAngle: -90,
  };
}
