import type { SqlBackend } from "@/lib/sql/sql-runtime";
import type { CardConfig, Result } from "@/lib/types";
import type { WorkspaceDashboardMeasure } from "@/lib/workspace/workspace-db";

type DashboardMeasureSourceChart = {
  id: string;
  chartConfigJson: string;
  sql?: string | null;
  title?: string | null;
  dbIdentifier?: string | null;
  sqlBackend?: SqlBackend | null;
};

export type MeasurePrimitive =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined;
export type MeasuresByName = Record<string, string>;
export type MeasureOption = {
  key: string;
  label: string;
  value: string;
  source: "saved" | "legacy";
  measureId?: string;
  sql?: string;
  dbIdentifier?: string | null;
  sqlBackend?: SqlBackend | null;
  sourceChartId?: string;
};

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

function coerceCardConfig(config: unknown): CardConfig | null {
  if (!isCardConfig(config)) {
    return null;
  }

  return config as CardConfig;
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

export function formatFirstRowMeasureValue(rows: Result[]): string {
  const firstRow = rows[0];
  if (!firstRow) {
    return "";
  }

  const firstColumnName = Object.keys(firstRow)[0];
  if (!firstColumnName) {
    return "";
  }

  return formatMeasureValue(firstRow[firstColumnName] as MeasurePrimitive);
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

    measures[key] = formatFirstRowMeasureValue(rows);
  }

  return measures;
}

function formatLegacyMeasureLabel(input: {
  config: CardConfig | null;
  chartTitle?: string | null;
  firstColumnName: string;
}): string {
  const configTitle = input.config?.title?.trim();
  if (configTitle) {
    return configTitle;
  }

  const chartTitle = input.chartTitle?.trim();
  if (chartTitle) {
    return chartTitle;
  }

  return input.firstColumnName
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(" ");
}

export function extractLegacyMeasureOptionsFromMetricCards(
  charts: DashboardMeasureSourceChart[],
  chartData: Record<string, Result[]>,
): MeasureOption[] {
  const optionsByKey = new Map<string, MeasureOption>();

  for (const chart of charts) {
    const parsedConfig = parseChartConfig(chart.chartConfigJson);
    const config = coerceCardConfig(parsedConfig);
    if (!config) {
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
    if (!key || optionsByKey.has(key)) {
      continue;
    }

    optionsByKey.set(key, {
      key,
      label: formatLegacyMeasureLabel({
        config,
        chartTitle: chart.title,
        firstColumnName,
      }),
      value: formatFirstRowMeasureValue(rows),
      source: "legacy",
      sql: chart.sql ?? undefined,
      dbIdentifier: chart.dbIdentifier ?? null,
      sqlBackend: chart.sqlBackend ?? null,
      sourceChartId: chart.id,
    });
  }

  return Array.from(optionsByKey.values()).sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

export function buildMeasureOptions(input: {
  savedMeasures: WorkspaceDashboardMeasure[];
  savedValuesByMeasureId: Record<string, string>;
  legacyMeasures?: MeasuresByName;
  legacyMeasureOptions?: MeasureOption[];
}): MeasureOption[] {
  const optionsByKey = new Map<string, MeasureOption>();

  for (const measure of input.savedMeasures) {
    optionsByKey.set(measure.key, {
      key: measure.key,
      label: measure.label,
      value: input.savedValuesByMeasureId[measure.id] ?? "",
      source: "saved",
      measureId: measure.id,
      sql: measure.sql,
      dbIdentifier: measure.dbIdentifier,
      sqlBackend: measure.sqlBackend,
    });
  }

  for (const measure of input.legacyMeasureOptions ?? []) {
    if (optionsByKey.has(measure.key)) {
      continue;
    }

    optionsByKey.set(measure.key, measure);
  }

  for (const [key, value] of Object.entries(input.legacyMeasures ?? {})) {
    if (optionsByKey.has(key)) {
      continue;
    }

    optionsByKey.set(key, {
      key,
      label: key
        .split("_")
        .filter(Boolean)
        .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
        .join(" "),
      value,
      source: "legacy",
    });
  }

  return Array.from(optionsByKey.values()).sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

export function buildMeasuresByName(
  measureOptions: MeasureOption[],
): MeasuresByName {
  return measureOptions.reduce<MeasuresByName>((accumulator, option) => {
    accumulator[option.key] = option.value;
    return accumulator;
  }, {});
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
