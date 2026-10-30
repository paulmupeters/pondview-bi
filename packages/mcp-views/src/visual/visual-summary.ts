import { formatCell } from "../shared/visual-body";
import type { VisualKind, VisualPayload } from "./visual-payload";

const SUMMARY_ROW_LIMIT = 10;
const SUMMARY_CELL_LIMIT = 40;

// Builds the prompt for "Ask Claude about this": the visual's title, query and
// a compact preview of its rows. The model never sees the iframe, so this is
// all it has to go on.
export function summarizeVisual(
  payload: VisualPayload,
  kind: VisualKind,
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
    `Tell me about the Pondview ${kind} visual "${payload.title}".`,
    payload.description ? `Description: ${payload.description}` : null,
    `SQL:\n${payload.sql}`,
    `Data (${shown}):`,
    columns.join(" | "),
    ...rows,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function truncate(value: string): string {
  return value.length > SUMMARY_CELL_LIMIT
    ? `${value.slice(0, SUMMARY_CELL_LIMIT - 1)}…`
    : value;
}
