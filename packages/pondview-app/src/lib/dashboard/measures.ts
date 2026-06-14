import type { DashboardSourceDescriptor } from "@/lib/dashboard/source-descriptor";
import type { SqlBackend } from "@/lib/sql/sql-runtime";
import type { CardConfig, Result } from "@/lib/types";
import type { WorkspaceDashboardMeasure } from "@/lib/workspace/workspace-db";

type DashboardMeasureSourceChart = {
  id: string;
  chartConfigJson: string;
  sql?: string | null;
  title?: string | null;
  dbIdentifier?: string | null;
  catalogContext?: string | null;
  sqlBackend?: SqlBackend | null;
};

export type MeasurePrimitive =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined;

export type MeasureRenderContext = {
  key: string;
  formattedValue: string;
  rawValue?: MeasurePrimitive;
};

export type MeasureRenderContextByName = Record<string, MeasureRenderContext>;

export type MeasureOption = {
  key: string;
  label: string;
  value: string;
  rawValue?: MeasurePrimitive;
  source: "saved" | "legacy";
  measureId?: string;
  sql?: string;
  sourceDescriptor?: DashboardSourceDescriptor | null;
  dbIdentifier?: string | null;
  catalogContext?: string | null;
  sqlBackend?: SqlBackend | null;
  sourceChartId?: string;
};

const MEASURE_TOKEN_PATTERN = /{{\s*([^{}]+?)\s*}}/g;
const IF_BLOCK_PATTERN =
  /{{#if\s+([^{}]+?)}}([\s\S]*?)(?:{{else}}([\s\S]*?))?{{\/if}}/g;
const INVALID_CONDITION_LITERAL = Symbol("invalid-measure-condition-literal");

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
  measures: MeasureRenderContextByName,
  key: string,
): key is keyof MeasureRenderContextByName {
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

export function extractFirstRowMeasurePrimitive(
  rows: Result[],
): MeasurePrimitive {
  const firstRow = rows[0];
  if (!firstRow) {
    return undefined;
  }

  const firstColumnName = Object.keys(firstRow)[0];
  if (!firstColumnName) {
    return undefined;
  }

  return firstRow[firstColumnName] as MeasurePrimitive;
}

export function formatFirstRowMeasureValue(rows: Result[]): string {
  return formatMeasureValue(extractFirstRowMeasurePrimitive(rows));
}

export function extractMeasuresFromMetricCards(
  charts: DashboardMeasureSourceChart[],
  chartData: Record<string, Result[]>,
): MeasureRenderContextByName {
  const measures: MeasureRenderContextByName = {};

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

    measures[key] = {
      key,
      formattedValue: formatFirstRowMeasureValue(rows),
      rawValue: extractFirstRowMeasurePrimitive(rows),
    };
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
      rawValue: extractFirstRowMeasurePrimitive(rows),
      source: "legacy",
      sql: chart.sql ?? undefined,
      sourceDescriptor: null,
      dbIdentifier: chart.dbIdentifier ?? null,
      catalogContext: chart.catalogContext ?? null,
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
  savedRawValuesByMeasureId?: Record<string, MeasurePrimitive>;
  legacyMeasures?: MeasureRenderContextByName;
  legacyMeasureOptions?: MeasureOption[];
}): MeasureOption[] {
  const optionsByKey = new Map<string, MeasureOption>();

  for (const measure of input.savedMeasures) {
    optionsByKey.set(measure.key, {
      key: measure.key,
      label: measure.label,
      value: input.savedValuesByMeasureId[measure.id] ?? "",
      rawValue: input.savedRawValuesByMeasureId?.[measure.id],
      source: "saved",
      measureId: measure.id,
      sql: measure.sql,
      sourceDescriptor: measure.sourceDescriptor ?? null,
      dbIdentifier: measure.dbIdentifier,
      catalogContext: measure.catalogContext ?? null,
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
      value: value.formattedValue,
      rawValue: value.rawValue,
      source: "legacy",
    });
  }

  return Array.from(optionsByKey.values()).sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

export function buildMeasureRenderContextByName(
  measureOptions: MeasureOption[],
): MeasureRenderContextByName {
  return measureOptions.reduce<MeasureRenderContextByName>(
    (accumulator, option) => {
      accumulator[option.key] = {
        key: option.key,
        formattedValue: option.value,
        rawValue: option.rawValue,
      };
      return accumulator;
    },
    {},
  );
}

export function buildMeasuresByName(
  measureOptions: MeasureOption[],
): MeasureRenderContextByName {
  return buildMeasureRenderContextByName(measureOptions);
}

function parseConditionLiteral(
  value: string,
): MeasurePrimitive | typeof INVALID_CONDITION_LITERAL {
  const trimmed = value.trim();
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return INVALID_CONDITION_LITERAL;
}

function toComparableNumber(value: MeasurePrimitive): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeScalarValue(value: MeasurePrimitive): MeasurePrimitive {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

function evaluateMeasureCondition(
  condition: string,
  measures: MeasureRenderContextByName,
): boolean | null {
  const match = condition.match(/^(.*?)\s*(>=|<=|==|!=|>|<)\s*(.+)$/);
  if (!match) {
    return null;
  }

  const [, rawLeft, operator, rawRight] = match;
  const key = normalizeMeasureName(rawLeft);
  if (!key || !hasOwnMeasureKey(measures, key)) {
    return false;
  }

  const right = parseConditionLiteral(rawRight);
  if (right === INVALID_CONDITION_LITERAL) {
    return null;
  }

  const left = measures[key].rawValue;
  if (operator === "==" || operator === "!=") {
    const isEqual = normalizeScalarValue(left) === normalizeScalarValue(right);
    return operator === "==" ? isEqual : !isEqual;
  }

  const leftNumber = toComparableNumber(left);
  const rightNumber = toComparableNumber(right);
  if (leftNumber === null || rightNumber === null) {
    return false;
  }

  switch (operator) {
    case ">":
      return leftNumber > rightNumber;
    case ">=":
      return leftNumber >= rightNumber;
    case "<":
      return leftNumber < rightNumber;
    case "<=":
      return leftNumber <= rightNumber;
    default:
      return null;
  }
}

function renderConditionalBlocks(
  content: string,
  measures: MeasureRenderContextByName,
): string {
  return content.replace(
    IF_BLOCK_PATTERN,
    (match, condition: string, truthyBlock: string, falsyBlock?: string) => {
      const result = evaluateMeasureCondition(condition, measures);
      if (result === null) {
        return match;
      }

      return result ? truthyBlock : (falsyBlock ?? "");
    },
  );
}

export function renderTextTemplate(
  content: string,
  measures: MeasureRenderContextByName,
): string {
  if (!content.includes("{{")) {
    return content;
  }

  const conditionallyRendered = renderConditionalBlocks(content, measures);
  return interpolateMeasurePlaceholders(conditionallyRendered, measures);
}

export function interpolateMeasurePlaceholders(
  content: string,
  measures: MeasureRenderContextByName,
): string {
  if (!content.includes("{{")) {
    return content;
  }

  return content.replace(MEASURE_TOKEN_PATTERN, (match, token: string) => {
    const key = normalizeMeasureName(token);
    if (!key || !hasOwnMeasureKey(measures, key)) {
      return match;
    }

    return measures[key].formattedValue;
  });
}
