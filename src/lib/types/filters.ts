import type { Filter as SemanticFilter } from "@/../semantic-layer/types";

export type { SemanticFilter };

export interface DashboardFilterState {
  filters: SemanticFilter[];
  availableDimensions: AvailableDimension[];
}

export interface AvailableDimension {
  exploreName: string;
  field: string; // e.g., "orders.region"
  displayName: string; // e.g., "Region"
  type: "string" | "number" | "boolean" | "time";
  conformKey?: string; // For cross-chart filtering
}


