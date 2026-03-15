import type { Result } from "@/lib/types";

type DashboardMeasureSourceChart = {
  id: string;
  chartConfigJson: string;
};

export type MeasurePrimitive = string | number | boolean | Date | null | undefined;
export type MeasuresByName = Record<string, string>;

const MEASURE_TOKEN_PATTERN = /{{\s*([^{}]+?)\s*}}/g;

function parseChartConfig(chartConfigJson: string): unknown | null {
  try {
    return JSON.parse(chartConfigJson);
  } catch {
    return null;
  }
}

function isCardConfig(config: unknown): boolean {
  if (!config || typeof config !== "object") {
    return false;
  }

  const candidate = config as Record<string, unknown>;
  if ("configType" in candidate) {
    return candidate.configType === "card";
  }

  return (
    !("yKeys" in candidate) &&
    !("type" in candidate) &&
    !("xKey" in candidate) &&
    "title" in candidate &&
    "description" in candidate
  );
}

function hasOwnMeasureKey(
  measures: MeasuresByName,
  key: string,
): key is keyof MeasuresByName {
  return Object.hasOwn(measures, key);
}

export function normalizeMeasureName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export function formatMeasureValue(value: MeasurePrimitive): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toLocaleString() : "";
  }

  if (typeof value === "boolean") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toLocaleString();
  }

  return String(value);
}

export function extractMeasuresFromMetricCards(
  charts: DashboardMeasureSourceChart[],
  chartData: Record<string, Result[]>,
): MeasuresByName {
  const measures: MeasuresByName = {};

  for (const chart of charts) {
    const config = parseChartConfig(chart.chartConfigJson);
    if (!isCardConfig(config)) {
      continue;
    }

    const rows = chartData[chart.id] ?? [];
    const firstRow = rows[0];
    if (!firstRow) {
      continue;
    }

    const firstColumnName = Object.keys(firstRow)[0];
    if (!firstColumnName) {
      continue;
    }

    const key = normalizeMeasureName(firstColumnName);
    if (!key || hasOwnMeasureKey(measures, key)) {
      continue;
    }

    measures[key] = formatMeasureValue(firstRow[firstColumnName] as MeasurePrimitive);
  }

  return measures;
}

export function interpolateMeasurePlaceholders(
  content: string,
  measures: MeasuresByName,
): string {
  if (!content.includes("{{")) {
    return content;
  }

  return content.replace(MEASURE_TOKEN_PATTERN, (match, token: string) => {
    const key = normalizeMeasureName(token);
    if (!key || !hasOwnMeasureKey(measures, key)) {
      return match;
    }

    return measures[key];
  });
}
