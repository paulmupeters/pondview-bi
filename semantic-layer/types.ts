export type DimType = "string" | "number" | "boolean" | "time";

export type DimensionDef = {
  name: string;
  sql: string;
  type: DimType;
  primaryKey?: boolean;
  conformKey?: string; // e.g., "customer_id" or "region"
};

export type MeasureDef = {
  name: string;
  sql: string; // expression over columns
  agg: "sum" | "avg" | "min" | "max" | "count" | "count_distinct";
};

export type JoinRel = "many_to_one" | "one_to_one";

export type JoinDef = {
  name: string;
  to: string; // explore or source
  type: JoinRel;
  on: string; // SQL condition using aliases
  required?: boolean;
};

export type SegmentDef = { name: string; sql: string };

export type ExploreDef = {
  name: string;
  base: string; // source name
  joins?: JoinDef[];
  dimensions: DimensionDef[];
  measures?: MeasureDef[];
  segments?: SegmentDef[];
};

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

export type Filter = {
  field: string; // e.g., "orders.region" or "orders.created_at"
  op: Op;
  values?: unknown[]; // positional; for between => [start, end]
};

export type TimeDim = {
  field: string; // "orders.created_at"
  grain?: "day" | "week" | "month" | "quarter" | "year";
  range?: [string, string]; // ISO dates
  timezone?: string; // "UTC", "Europe/Paris"
};

export type QueryAST = {
  explore: string; // "orders"
  fields: string[]; // dims and measures; e.g., ["orders.region", "orders.revenue"]
  filters?: Filter[];
  timeDimensions?: TimeDim[];
  orderBy?: { field: string; dir: "asc" | "desc" }[];
  limit?: number;
  offset?: number;
};

// Data Model type - collection of explores
export type DataModel = {
  explores: ExploreDef[];
};

// Resolved field definition used during query compilation
export type FieldDef = {
  kind: "dimension" | "measure";
  alias: string;
  sqlExpr: string;
  dimension?: DimensionDef;
  measure?: MeasureDef;
  exploreName: string;
};
