import type { Filter } from "@/lib/types/filters";
import { isFilterOperator } from "@/lib/types/filters";

type LegacyOp =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "greater_or_equal"
  | "less_than"
  | "less_or_equal";

const LEGACY_OP_TO_FILTER_OP: Record<LegacyOp, Filter["op"]> = {
  equals: "eq",
  not_equals: "neq",
  greater_than: "gt",
  greater_or_equal: "gte",
  less_than: "lt",
  less_or_equal: "lte",
};

export interface NormalizeFilterOptions {
  defaultTable?: string;
}

export function normalizeFilterPayload(
  payload: unknown,
  options: NormalizeFilterOptions = {}
): Filter[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  const normalized: Filter[] = [];
  for (const value of payload) {
    const filter = normalizeFilter(value, options);
    if (filter) {
      normalized.push(filter);
    }
  }
  return normalized;
}

export function normalizeFilter(
  value: unknown,
  options: NormalizeFilterOptions = {}
): Filter | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const field = normalizeField(record.field, options.defaultTable);
  if (!field) {
    return null;
  }

  const op = normalizeOperator(record.op);
  if (!op) {
    return null;
  }

  const rawValues = record.values;
  const values = Array.isArray(rawValues)
    ? rawValues
    : rawValues === undefined
      ? []
      : [rawValues];

  return {
    field,
    op,
    values,
  };
}

function normalizeField(fieldValue: unknown, defaultTable?: string): string | null {
  if (typeof fieldValue !== "string") {
    return null;
  }
  const trimmed = fieldValue.trim();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }
  if (parts.length === 1) {
    return defaultTable ? `${defaultTable}.${parts[0]}` : null;
  }
  if (parts.length === 2) {
    return `${parts[0]}.${parts[1]}`;
  }

  return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
}

function normalizeOperator(opValue: unknown): Filter["op"] | null {
  if (isFilterOperator(opValue)) {
    return opValue;
  }
  if (typeof opValue !== "string") {
    return null;
  }
  const lower = opValue.toLowerCase() as LegacyOp;
  if (lower in LEGACY_OP_TO_FILTER_OP) {
    return LEGACY_OP_TO_FILTER_OP[lower];
  }
  return null;
}
