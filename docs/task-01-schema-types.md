# Task 1: Database Schema & Type Definitions

**Goal**: Add database columns and TypeScript types for filter support

**Dependencies**: None (foundational task)

**Estimated Lines**: ~50 lines

---

## Files to Create

- `src/lib/types/filters.ts` - Filter type definitions

## Files to Modify

- `src/lib/db/schema.ts` - Add columns to dashboardCharts table
- `src/lib/repositories/dashboard.ts` - Update TypeScript types

---

## Deliverables

### 1. Add to `dashboardCharts` table schema

In `src/lib/db/schema.ts`, add these columns:

```typescript
export const dashboardCharts = sqliteTable("dashboard_charts", {
  // ... existing fields ...
  semanticQueryJson: text("semantic_query_json"), // Store QueryAST
  exploreName: text("explore_name"), // Which model/explore this uses
});
```

### 2. Create `src/lib/types/filters.ts`

```typescript
import type { Filter as SemanticFilter } from "@/semantic-layer/types";

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
```

### 3. Update TypeScript types

In `src/lib/repositories/dashboard.ts`:

- Add `semanticQueryJson?: string | null` to `DbDashboardChart` type inference
- Add `exploreName?: string | null` to `DbDashboardChart` type inference

These should automatically infer from the schema, but verify the types are correct.

---

## Acceptance Criteria

- ✅ Schema compiles without errors
- ✅ Types are properly exported and importable
- ✅ No breaking changes to existing functionality
- ✅ Optional fields don't require migration of existing data
- ✅ TypeScript has no errors when importing new types

---

## Testing

Run these commands:

```bash
# Check TypeScript compilation
npx tsc --noEmit

# Verify imports work
node -e "require('./src/lib/types/filters')"
```

---

## Notes

- These are **optional** fields (nullable), so existing charts continue working
- No database migration needed yet - SQLite will add columns with NULL values
- Filter logic will be implemented in later tasks
