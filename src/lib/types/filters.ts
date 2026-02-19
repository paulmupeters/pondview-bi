export type Op =
  | "eq"
  | "neq"
  | "in"
  | "not_in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "contains"
  | "starts_with"
  | "is_null"
  | "is_not_null";

export const FILTER_OPERATORS = [
  "eq",
  "neq",
  "in",
  "not_in",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "contains",
  "starts_with",
  "is_null",
  "is_not_null",
] as const satisfies readonly Op[];

export type Filter = {
  field: string; // table.column
  op: Op;
  values?: unknown[];
};

// Backward-compatible alias for existing imports.
export type SemanticFilter = Filter;

export function isFilterOperator(value: unknown): value is Op {
  return (
    typeof value === "string" &&
    (FILTER_OPERATORS as readonly string[]).includes(value)
  );
}

export interface DashboardFilterState {
  filters: Filter[];
  availableDimensions: AvailableDimension[];
}

export interface AvailableDimension {
  exploreName: string;
  field: string; // e.g., "orders.region"
  displayName: string; // e.g., "Region"
  type: "string" | "number" | "boolean" | "time";
  conformKey?: string; // For cross-chart filtering
}


