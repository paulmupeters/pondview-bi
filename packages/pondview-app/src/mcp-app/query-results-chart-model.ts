import type {
  QueryResultColumn,
  QueryResultPayload,
} from "./query-results-model";

export type QueryChartType = "bar" | "line" | "area" | "pie";

export type QueryChartConfig = {
  type: QueryChartType;
  xKey: string;
  yKey: string;
};

export type QueryChartPoint = {
  id: string;
  label: string;
  value: number;
};

const NUMERIC_TYPE_PATTERN =
  /\b(?:TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL)\b/i;
const TEMPORAL_TYPE_PATTERN = /\b(?:DATE|TIME|TIMESTAMP|INTERVAL)\b/i;

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function isNumericQueryColumn(
  column: QueryResultColumn,
  rows: Array<Record<string, unknown>>,
): boolean {
  if (column.type && NUMERIC_TYPE_PATTERN.test(column.type)) {
    return true;
  }

  const populated = rows
    .map((row) => row[column.name])
    .filter((value) => value !== null && value !== undefined)
    .slice(0, 25);
  return (
    populated.length > 0 &&
    populated.every((value) => finiteNumber(value) !== null)
  );
}

export function suggestQueryChart(
  payload: QueryResultPayload,
): QueryChartConfig | null {
  const numericColumns = payload.columns.filter((column) =>
    isNumericQueryColumn(column, payload.rows),
  );
  const yColumn = numericColumns[0];
  if (!yColumn) return null;

  const xColumn =
    payload.columns.find((column) => column.name !== yColumn.name) ?? null;
  if (!xColumn) return null;

  const isTemporal = Boolean(
    xColumn.type && TEMPORAL_TYPE_PATTERN.test(xColumn.type),
  );
  return {
    type: isTemporal ? "line" : "bar",
    xKey: xColumn.name,
    yKey: yColumn.name,
  };
}

export function queryChartNumericColumns(
  payload: Pick<QueryResultPayload, "columns" | "rows">,
): QueryResultColumn[] {
  return payload.columns.filter((column) =>
    isNumericQueryColumn(column, payload.rows),
  );
}

export function buildQueryChartPoints(
  rows: Array<Record<string, unknown>>,
  config: QueryChartConfig,
  maxPoints = 50,
): QueryChartPoint[] {
  const points: QueryChartPoint[] = [];
  const labelCounts = new Map<string, number>();
  for (const row of rows) {
    const value = finiteNumber(row[config.yKey]);
    if (value === null) continue;

    const rawLabel = row[config.xKey];
    const label =
      rawLabel === null || rawLabel === undefined
        ? "Unknown"
        : String(rawLabel);
    const occurrence = (labelCounts.get(label) ?? 0) + 1;
    labelCounts.set(label, occurrence);
    points.push({ id: `${label}-${occurrence}`, label, value });
    if (points.length >= maxPoints) break;
  }
  return points;
}

export function queryChartTitle(config: QueryChartConfig): string {
  return `${config.yKey} by ${config.xKey}`;
}
