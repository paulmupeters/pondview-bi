import { formatCell } from "../shared/visual-body";
import type { VisualKind, VisualPayload } from "./visual-payload";

const SUMMARY_ROW_LIMIT = 10;
const SUMMARY_CELL_LIMIT = 40;

// Builds the prompt for "Ask Claude about this": the visual's title, query, the
// point the user clicked (if any) and a compact preview of its rows. The model
// never sees the iframe, so this is all it has to go on.
export function summarizeVisual(
  payload: VisualPayload,
  kind: VisualKind,
  point?: Record<string, unknown> | null,
): string {
  const columns = payload.columns.map((column) => column.name);
  const rows = payload.rows
    .slice(0, SUMMARY_ROW_LIMIT)
    .map((row) =>
      columns.map((column) => truncate(formatCell(row[column]))).join(" | "),
    );
  const shown =
    payload.rowCount > rows.length
      ? `first ${rows.length} of ${payload.rowCount.toLocaleString()} rows`
      : `${rows.length} rows`;

  return [
    point
      ? `Tell me about this point in the Pondview ${kind} visual "${payload.title}": ${describePoint(point)}`
      : `Tell me about the Pondview ${kind} visual "${payload.title}".`,
    payload.description ? `Description: ${payload.description}` : null,
    `SQL:\n${payload.sql}`,
    `Data (${shown}):`,
    columns.join(" | "),
    ...rows,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function describePoint(point: Record<string, unknown>): string {
  return Object.entries(point)
    .map(([key, value]) => `${key} = ${truncate(formatCell(value))}`)
    .join(", ");
}

function truncate(value: string): string {
  return value.length > SUMMARY_CELL_LIMIT
    ? `${value.slice(0, SUMMARY_CELL_LIMIT - 1)}…`
    : value;
}
