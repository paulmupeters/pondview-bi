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
    /\b(date|time|day|week|month|quarter|year|yr|created|updated|period)\b/.test(
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

function isLikelyMeasureColumn(name: string): boolean {
  return /(?:^|[_\s-])(count|cnt|total|sum|avg|average|min|max|median|value|amount|revenue|sales|number|num|rate|ratio|percent|percentage|share)(?:$|[_\s-])/i.test(
    name,
  );
}

function chooseDimensionColumn(
  columnNames: string[],
  numericColumns: string[],
  rows: Result[],
): string {
  const nonNumericColumn = columnNames.find(
    (columnName) => !numericColumns.includes(columnName),
  );
  if (nonNumericColumn) {
    return nonNumericColumn;
  }

  const temporalColumn = columnNames.find((columnName) =>
    isLikelyTemporalColumn(
      columnName,
      rows.map((row) => row[columnName]),
    ),
  );
  if (temporalColumn) {
    return temporalColumn;
  }

  const measureColumn = numericColumns.find(isLikelyMeasureColumn);
  return (
    columnNames.find((columnName) => columnName !== measureColumn) ??
    columnNames[0]
  );
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

  const xKey = chooseDimensionColumn(columnNames, numericColumns, rows);

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

/**
 * Repairs the most common axis inversion from a visualization model. A
 * numeric grouping field such as `year` is still a dimension, while an
 * aggregate such as `unicorn_count` is a measure.
 */
export function repairChartAxisMapping(config: Config, rows: Result[]): Config {
  if (config.countMode || rows.length === 0) {
    return config;
  }

  const columnNames = Object.keys(rows[0] ?? {});
  const numericColumns = columnNames.filter((columnName) =>
    rows.some((row) => isNumericValue(row[columnName])),
  );
  const inferredXKey = chooseDimensionColumn(columnNames, numericColumns, rows);
  const configuredXIsMeasure = isLikelyMeasureColumn(config.xKey);
  const inferredXIsDimension =
    !numericColumns.includes(inferredXKey) ||
    isLikelyTemporalColumn(
      inferredXKey,
      rows.map((row) => row[inferredXKey]),
    );

  if (
    config.xKey === inferredXKey ||
    !configuredXIsMeasure ||
    !inferredXIsDimension ||
    !config.yKeys.includes(inferredXKey)
  ) {
    return config;
  }

  return {
    ...config,
    xKey: inferredXKey,
    yKeys: [config.xKey, ...config.yKeys.filter((key) => key !== inferredXKey)],
  };
}
