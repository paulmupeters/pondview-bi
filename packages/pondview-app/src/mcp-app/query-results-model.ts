export type QueryResultColumn = {
  name: string;
  type?: string;
};

export type QueryResultPayload = {
  columns: QueryResultColumn[];
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  rowsChanged?: number;
  sql?: string;
};

export type QueryResultSort = {
  column: string;
  direction: "ascending" | "descending";
};

export type QueryResultParseResult =
  | { ok: true; value: QueryResultPayload }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseQueryResultPayload(
  value: unknown,
): QueryResultParseResult {
  if (!isRecord(value)) {
    return { ok: false, error: "The query returned no structured result." };
  }

  if (!Array.isArray(value.columns) || !Array.isArray(value.rows)) {
    return {
      ok: false,
      error: "The query result is missing its columns or rows.",
    };
  }

  const columns: QueryResultColumn[] = [];
  for (const column of value.columns) {
    if (!isRecord(column) || typeof column.name !== "string") {
      return {
        ok: false,
        error: "The query returned invalid column metadata.",
      };
    }
    columns.push({
      name: column.name,
      ...(typeof column.type === "string" ? { type: column.type } : {}),
    });
  }

  const rows: Array<Record<string, unknown>> = [];
  for (const row of value.rows) {
    if (!isRecord(row)) {
      return { ok: false, error: "The query returned an invalid row." };
    }
    rows.push(row);
  }

  const rowCount =
    typeof value.rowCount === "number" &&
    Number.isFinite(value.rowCount) &&
    value.rowCount >= 0
      ? value.rowCount
      : rows.length;
  const rowsChanged =
    typeof value.rowsChanged === "number" && Number.isFinite(value.rowsChanged)
      ? value.rowsChanged
      : undefined;
  const sql =
    typeof value.sql === "string" && value.sql.trim().length > 0
      ? value.sql
      : undefined;

  return {
    ok: true,
    value: {
      columns,
      rows,
      rowCount,
      ...(rowsChanged === undefined ? {} : { rowsChanged }),
      ...(sql === undefined ? {} : { sql }),
    },
  };
}

export function formatQueryCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "string") {
    return value;
  }
  if (
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function filterQueryRows(
  rows: Array<Record<string, unknown>>,
  columns: QueryResultColumn[],
  query: string,
): Array<Record<string, unknown>> {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) {
    return rows;
  }

  return rows.filter((row) => {
    const values =
      columns.length > 0
        ? columns.map((column) => row[column.name])
        : Object.values(row);
    return values.some((value) =>
      formatQueryCell(value).toLocaleLowerCase().includes(needle),
    );
  });
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function compareQueryValues(left: unknown, right: unknown): number {
  const leftEmpty = left === null || left === undefined;
  const rightEmpty = right === null || right === undefined;
  if (leftEmpty || rightEmpty) {
    if (leftEmpty && rightEmpty) return 0;
    return leftEmpty ? 1 : -1;
  }

  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }
  return collator.compare(formatQueryCell(left), formatQueryCell(right));
}

export function sortQueryRows(
  rows: Array<Record<string, unknown>>,
  sort: QueryResultSort | null,
): Array<Record<string, unknown>> {
  if (!sort) {
    return rows;
  }

  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const comparison = compareQueryValues(
        left.row[sort.column],
        right.row[sort.column],
      );
      if (comparison === 0) {
        return left.index - right.index;
      }
      return sort.direction === "ascending" ? comparison : -comparison;
    })
    .map(({ row }) => row);
}

export function nextQuerySort(
  current: QueryResultSort | null,
  column: string,
): QueryResultSort | null {
  if (!current || current.column !== column) {
    return { column, direction: "ascending" };
  }
  if (current.direction === "ascending") {
    return { column, direction: "descending" };
  }
  return null;
}
