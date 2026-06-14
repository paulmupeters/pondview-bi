import { DuckdbWasmClient as DuckdbWasmClientClass } from "@/lib/duckdb/duckdb-wasm-client";

type WasmTableField = {
  name?: string;
  type?: {
    toString?: () => string;
  };
};

type WasmQueryTable = {
  toArray: () => unknown[];
  schema?: {
    fields?: WasmTableField[];
  };
};

type WasmClient = {
  execute: (options: {
    sql: string;
    signal?: AbortSignal;
  }) => Promise<WasmQueryTable>;
};

export type RunQueryWasmOptions = {
  sql: string;
  signal?: AbortSignal;
  dbIdentifier?: string;
};

export type RunQueryWasmResult = {
  rows: Record<string, unknown>[];
  columns: { name: string; type?: string }[];
  durationMs: number;
};

type RunQueryWasmDeps = {
  getClient: () => WasmClient;
  now: () => number;
};

let sharedClient: DuckdbWasmClientClass | null = null;

function nowMs(): number {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }
  return Date.now();
}

function getSharedClient(): WasmClient {
  if (!sharedClient) {
    sharedClient = new DuckdbWasmClientClass();
  }
  return sharedClient as unknown as WasmClient;
}

function normalizeWasmValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeWasmValue(item));
  }

  if (value && typeof value === "object" && !(value instanceof Date)) {
    const normalizedObject: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      normalizedObject[key] = normalizeWasmValue(entryValue);
    }
    return normalizedObject;
  }

  return value;
}

export function normalizeWasmRows(rows: unknown[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const source =
      row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      normalized[key] = normalizeWasmValue(value);
    }
    return normalized;
  });
}

export function extractColumnsFromWasmTable(
  table: WasmQueryTable,
  rows: Record<string, unknown>[],
): { name: string; type?: string }[] {
  const fields = table.schema?.fields ?? [];
  if (fields.length > 0) {
    const columns: { name: string; type?: string }[] = [];
    for (const field of fields) {
      const name = (field.name ?? "").trim();
      if (!name) {
        continue;
      }

      const rawType = field.type?.toString?.();
      const type = rawType?.trim();
      if (type && type !== "[object Object]") {
        columns.push({ name, type });
      } else {
        columns.push({ name });
      }
    }
    return columns;
  }

  return Object.keys(rows[0] ?? {}).map((name) => ({ name }));
}

export function createRunQueryWasm(
  partialDeps: Partial<RunQueryWasmDeps> = {},
) {
  const deps: RunQueryWasmDeps = {
    getClient: getSharedClient,
    now: nowMs,
    ...partialDeps,
  };

  return async function runQueryWasm({
    sql,
    signal,
  }: RunQueryWasmOptions): Promise<RunQueryWasmResult> {
    const trimmedSql = sql.trim();
    if (!trimmedSql) {
      throw new Error("SQL query is required");
    }

    const startedAt = deps.now();
    const table = (await deps.getClient().execute({
      sql: trimmedSql,
      signal,
    })) as WasmQueryTable;

    const normalizedRows = normalizeWasmRows(table.toArray());
    const columns = extractColumnsFromWasmTable(table, normalizedRows);

    return {
      rows: normalizedRows,
      columns,
      durationMs: Math.max(0, Math.round(deps.now() - startedAt)),
    };
  };
}

export const runQueryWasm = createRunQueryWasm();
