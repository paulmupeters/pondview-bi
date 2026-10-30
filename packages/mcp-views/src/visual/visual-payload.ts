// Shape of `structuredContent.visual` returned by the show_chart and
// create_visual tools. Keep in sync with buildVisualPayload in
// packages/cli/src/mcp.ts.
export type VisualKind = "line" | "bar" | "area" | "pie" | "table" | "card";

export type VisualPayload = {
  title: string;
  description: string | null;
  sql: string;
  visualType: VisualKind;
  config: Record<string, unknown>;
  columns: Array<{ name: string; type: string }>;
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  truncated: boolean;
  saved: {
    dashboardId: string;
    visualId: string;
  } | null;
};

export function readVisualPayload(
  structuredContent: unknown,
): VisualPayload | null {
  if (!structuredContent || typeof structuredContent !== "object") {
    return null;
  }
  const visual = (structuredContent as { visual?: unknown }).visual;
  if (!visual || typeof visual !== "object") {
    return null;
  }
  const candidate = visual as Partial<VisualPayload>;
  if (
    typeof candidate.visualType !== "string" ||
    !Array.isArray(candidate.rows) ||
    !Array.isArray(candidate.columns)
  ) {
    return null;
  }
  return candidate as VisualPayload;
}
