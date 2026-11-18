// Temporary copy of packages/pondview-app/src/lib/types/filters.ts, which uses `@/` aliases
// the CLI cannot resolve. Unify into a shared package in phase 3 (specs/mcp-app.md).
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

export function isFilterOperator(value: unknown): value is Op {
  return (
    typeof value === "string" &&
    (FILTER_OPERATORS as readonly string[]).includes(value)
  );
}
