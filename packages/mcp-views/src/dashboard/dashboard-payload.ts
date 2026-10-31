// Shape of `structuredContent.dashboard` returned by the show_dashboard and
// get_dashboard_data tools. Keep in sync with the "Phase 2 contract" in
// specs/mcp-app.md and the server's dashboard payload builder.
import type { Filter } from "@/lib/types/filters";
import type { VisualPayload } from "../visual/visual-payload";

export type DashboardLayout = { x: number; y: number; w: number; h: number };

export type DashboardCard =
  | {
      kind: "visual";
      id: string;
      title: string;
      layout: DashboardLayout;
      visual: VisualPayload | null;
      error: string | null;
    }
  | {
      kind: "text";
      id: string;
      layout: DashboardLayout;
      title: string;
      content: string /* markdown */;
    };

export type DashboardSlicer = {
  id: string;
  field: string;
  title: string | null;
  options: Array<string | number | boolean | null>; // distinct values, capped at the slicer's limit
};

export type DashboardPayload = {
  id: string;
  title: string;
  columns: number;
  cards: DashboardCard[];
  slicers: DashboardSlicer[];
  filters: Filter[]; // active filters applied to this payload
  skippedFilters: Array<{ visualId: string; field: string; reason: string }>;
};

export function readDashboardPayload(
  structuredContent: unknown,
): DashboardPayload | null {
  if (!structuredContent || typeof structuredContent !== "object") {
    return null;
  }
  const dashboard = (structuredContent as { dashboard?: unknown }).dashboard;
  if (!dashboard || typeof dashboard !== "object") {
    return null;
  }
  const candidate = dashboard as Partial<DashboardPayload>;
  if (
    typeof candidate.id !== "string" ||
    !Array.isArray(candidate.cards) ||
    !Array.isArray(candidate.slicers) ||
    !Array.isArray(candidate.filters)
  ) {
    return null;
  }
  // Tolerate a server that omits the optional-looking bits rather than
  // refusing to render the whole dashboard.
  return {
    ...(candidate as DashboardPayload),
    title: typeof candidate.title === "string" ? candidate.title : "",
    columns:
      typeof candidate.columns === "number" && candidate.columns > 0
        ? candidate.columns
        : 1,
    skippedFilters: Array.isArray(candidate.skippedFilters)
      ? candidate.skippedFilters
      : [],
  };
}
