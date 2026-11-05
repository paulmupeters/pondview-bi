import type { Filter } from "@/lib/types/filters";
import type { DashboardPayload, DashboardSlicer } from "./dashboard-payload";

export type SlicerValue = DashboardSlicer["options"][number];

// Slicers own the `in` filters on their fields; any other active filter (for
// example one passed to show_dashboard by the model) is carried through as is.
export function slicerSelection(
  filters: Filter[],
  field: string,
): SlicerValue[] {
  const filter = filters.find(
    (candidate) => candidate.field === field && candidate.op === "in",
  );
  return (filter?.values ?? []) as SlicerValue[];
}

export function withSlicerSelection(
  payload: DashboardPayload,
  field: string,
  values: SlicerValue[],
): Filter[] {
  const others = payload.filters.filter(
    (filter) => !(filter.field === field && filter.op === "in"),
  );
  return values.length > 0 ? [...others, { field, op: "in", values }] : others;
}

export function describeFilters(payload: DashboardPayload): string {
  const heading = `Pondview dashboard "${payload.title}" (${payload.id})`;
  if (payload.filters.length === 0) {
    return `${heading} is shown with no filters.`;
  }
  const lines = payload.filters.map(
    (filter) =>
      `- ${filter.field} ${filter.op}${
        filter.values ? ` ${filter.values.map(formatValue).join(", ")}` : ""
      }`,
  );
  return [`${heading} is filtered by:`, ...lines].join("\n");
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "(empty)";
  return String(value);
}

export function valueKey(value: SlicerValue): string {
  return JSON.stringify(value);
}
