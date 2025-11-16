import type { HttpDuckDbConfig } from "@/lib/duckdb/duckdb-node";

export type RunQueryOptions = {
  sql: string;
  config?: HttpDuckDbConfig;
  signal?: AbortSignal;
};

export type RunQueryResult = {
  rows: Record<string, unknown>[];
  columns: { name: string; type?: string }[];
  durationMs: number;
};

export async function runQuery({
  sql,
  config,
  signal,
}: RunQueryOptions): Promise<RunQueryResult> {
  const trimmedSql = sql.trim();
  if (!trimmedSql) {
    throw new Error("SQL query is required");
  }

  const startedAt =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

  const response = await fetch("/api/duckdb/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sql: trimmedSql,
      config,
    }),
    signal,
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(errorData.error || `Query failed with ${response.status}`);
  }

  const data = (await response.json()) as { rows: Record<string, unknown>[] };
  const columns =
    data.rows[0] !== undefined
      ? Object.keys(data.rows[0]).map((name) => ({ name }))
      : [];
  const durationMs =
    Math.round(
      (typeof performance !== "undefined" &&
      typeof performance.now === "function"
        ? performance.now()
        : Date.now()) - startedAt,
    ) || 0;

  return {
    rows: data.rows,
    columns,
    durationMs: Math.max(0, durationMs),
  };
}
