# Dashboard Filters Implementation Plan

## Executive Summary

This document outlines a plan to implement dashboard-level filters with cross-chart filtering capabilities, leveraging the existing semantic layer infrastructure in `semantic-layer/`.

## Current State Analysis

### What We Have

1. **Semantic Layer Infrastructure** (`semantic-layer/`)
   - ✅ Query builder that compiles QueryAST to DuckDB SQL (`query-builder.ts`)
   - ✅ Filter types: eq, neq, in, not_in, gt, gte, lt, lte, between, contains, starts_with, is_null, is_not_null
   - ✅ TimeDim support for time-based filtering with grain options
   - ✅ Model loader that reads YAML model definitions
   - ✅ DataModel with explores containing dimensions, measures, joins, segments
   - ✅ SQL extraction that auto-updates models from chart SQL
   - ✅ Source management for connected tables

2. **Dashboard Architecture**
   - Charts stored in SQLite (`dashboardCharts` table)
   - Each chart has: `sql`, `dbIdentifier`, `chartConfigJson`, `position`
   - Charts executed independently via `/api/dashboard/[dashboardId]/data`
   - Mock filter UI exists in `src/app/dashboards/[dashboardId]/page.tsx` (lines 504-607)

3. **Chart Data Flow**
   ```
   Dashboard Page → API Route → listChartsByDashboard() → runSqlNormalized()
   ```

### Current Limitations

- ❌ No filter state management at dashboard level
- ❌ No relationship between charts and semantic layer queries
- ❌ Charts store only raw SQL, not semantic layer metadata
- ❌ No way to apply filters across multiple charts
- ❌ No auto-discovery of filterable dimensions

## Architecture Options Evaluated

### Option 1: SQL Rewriting Approach
**Description**: Parse and modify raw SQL on the fly when filters are applied.

**Pros**:
- Works with existing charts
- No schema changes needed

**Cons**:
- Complex SQL parsing and manipulation
- Fragile - easy to break with complex queries
- Hard to validate filters apply correctly
- No type safety

**Verdict**: ❌ Not recommended - too fragile

### Option 2: Full Semantic Layer Migration
**Description**: Replace all chart SQL with QueryAST JSON.

**Pros**:
- Clean architecture
- Type-safe
- Easy to apply filters
- Leverages query builder fully

**Cons**:
- Breaking change
- Requires migration of all existing charts
- Loses raw SQL flexibility for ad-hoc queries

**Verdict**: ❌ Not recommended - too disruptive

### Option 3: Hybrid Approach ✅ RECOMMENDED
**Description**: Store both SQL and optional semantic layer metadata side-by-side.

**Pros**:
- ✅ Backward compatible with existing charts
- ✅ Flexible - supports both raw SQL and semantic layer
- ✅ Clear migration path
- ✅ Can gradually adopt semantic layer features
- ✅ Enables intelligent cross-chart filtering

**Cons**:
- More complex schema (one extra field)
- Need to handle both code paths

**Verdict**: ✅ **RECOMMENDED** - Best balance of flexibility and power

### Option 4: SQL Parameters
**Description**: Add filter values as parameters to SQL queries.

**Pros**:
- Simple to implement
- Works with raw SQL

**Cons**:
- Manual filter definition per chart
- No auto-discovery
- No cross-chart intelligence
- Doesn't leverage semantic layer

**Verdict**: ❌ Not recommended - doesn't leverage existing infrastructure

## Recommended Implementation: Hybrid Approach

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Dashboard Page                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Dashboard Filter State (React Context or Local State)      │ │
│  │  - Active filters: Filter[]                                │ │
│  │  - Available dimensions from all charts' models            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              ↓                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │   Chart 1   │  │   Chart 2   │  │   Chart 3   │            │
│  │ (Semantic)  │  │ (Semantic)  │  │ (Raw SQL)   │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
└─────────────────────────────────────────────────────────────────┘
         ↓                   ↓                   ↓
┌─────────────────────────────────────────────────────────────────┐
│              API: /api/dashboard/[id]/data                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ For each chart:                                            │ │
│  │   if (chart.semanticQueryJson) {                           │ │
│  │     1. Parse QueryAST from semanticQueryJson               │ │
│  │     2. Append dashboard filters to query.filters           │ │
│  │     3. Compile to SQL using compileToDuckdb()              │ │
│  │     4. Execute compiled SQL                                │ │
│  │   } else {                                                 │ │
│  │     Execute chart.sql as-is (no filters)                   │ │
│  │   }                                                        │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Semantic Layer                                │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ compileToDuckdb(dataModel, queryAST, filters)              │ │
│  │   - Resolve fields from model                              │ │
│  │   - Plan joins                                             │ │
│  │   - Apply filters to WHERE clause                          │ │
│  │   - Generate optimized SQL                                 │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation Phases

## Phase 1: Schema & Infrastructure (Day 1-2)

### 1.1 Database Schema Changes

**File**: `src/lib/db/schema.ts`

Add new fields to `dashboardCharts`:
```typescript
export const dashboardCharts = sqliteTable("dashboard_charts", {
  // ... existing fields ...
  semanticQueryJson: text("semantic_query_json"), // Store QueryAST
  exploreName: text("explore_name"), // Which model/explore this uses
});
```

**File**: `src/lib/db/schema.ts` (new table)

Add new table for dashboard filters:
```typescript
export const dashboardFilters = sqliteTable("dashboard_filters", {
  id: text("id").primaryKey(),
  dashboardId: text("dashboard_id")
    .notNull()
    .references(() => dashboards.id, { onDelete: "cascade" }),
  filterJson: text("filter_json").notNull(), // Serialized Filter object
  createdAt: integer("created_at").notNull(),
});
```

**Migration**: Create migration script to add columns (with default null values)

### 1.2 Enhanced Chart Creation

**File**: `src/app/api/dashboard/[dashboardId]/charts/route.ts`

Enhance to store semantic query metadata:

```typescript
// After extracting semantic layer metadata
const metadata = extractSemanticLayerFromSQL(body.sql);

// Build QueryAST from metadata
const queryAST: QueryAST = {
  explore: metadata.exploreName,
  fields: [
    ...metadata.dimensions.map(d => `${metadata.exploreName}.${d.name}`),
    ...metadata.measures.map(m => `${metadata.exploreName}.${m.name}`)
  ],
  // Extract filters, orderBy, limit from original SQL if possible
  filters: [], // Could be extracted from WHERE clause
  orderBy: [], // Could be extracted from ORDER BY  `
  limit: extractLimitFromSQL(body.sql),
};

// Store both SQL and semantic query
await addChartToDashboard({
  // ... existing fields ...
  semanticQueryJson: JSON.stringify(queryAST),
  exploreName: metadata.exploreName,
});
```

### 1.3 Filter Type Definitions

**File**: `src/lib/types.ts` (new file or add to existing)

```typescript
import type { Filter as SemanticFilter } from "@/semantic-layer/types";

// Re-export semantic layer filter types
export type { SemanticFilter };

// Dashboard filter state
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

## Phase 2: Backend - Filter Application (Day 2-3)

### 2.1 Filter-Aware Query Execution

**File**: `src/app/api/dashboard/[dashboardId]/data/route.ts`

Replace current implementation with filter-aware execution:

```typescript
import { loadModelsFromDirectory } from "@/semantic-layer/model-loader";
import { compileToDuckdb } from "@/semantic-layer/query-builder";
import type { QueryAST, Filter } from "@/semantic-layer/types";
import { join } from "node:path";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> }
) {
  const { dashboardId } = await params;
  const { searchParams } = new URL(req.url);

  // Parse filters from query params (or could be from DB)
  const filtersParam = searchParams.get("filters");
  const dashboardFilters: Filter[] = filtersParam
    ? JSON.parse(filtersParam)
    : [];

  // Load semantic layer models
  const modelsDir = join(process.cwd(), "semantic-layer", "models");
  const dataModel = loadModelsFromDirectory(modelsDir);

  const charts = await listChartsByDashboard(dashboardId);

  const results = await Promise.all(
    charts.map(async (chart) => {
      try {
        let sqlToExecute = chart.sql;

        // If chart has semantic metadata, apply filters
        if (chart.semanticQueryJson) {
          const queryAST: QueryAST = JSON.parse(chart.semanticQueryJson);

          // Merge dashboard filters with chart filters
          const mergedQuery: QueryAST = {
            ...queryAST,
            filters: [
              ...(queryAST.filters || []),
              ...dashboardFilters,
            ],
          };

          // Compile to SQL with filters
          const compiled = compileToDuckdb(dataModel, mergedQuery);
          sqlToExecute = compiled.sql;

          console.log(`[Dashboard] Applied ${dashboardFilters.length} filters to chart ${chart.id}`);
        }

        // Execute SQL
        const rows = await runSqlNormalized(
          chart.dbIdentifier || "md:my_db",
          sqlToExecute
        );

        return {
          ...chart,
          rows,
          filtersApplied: !!chart.semanticQueryJson,
        };
      } catch (e) {
        console.error(`Error executing chart ${chart.id}:`, e);
        return { ...chart, rows: [], filtersApplied: false };
      }
    })
  );

  return Response.json({ charts: results });
}
```

### 2.2 Filter Discovery API

**File**: `src/app/api/dashboard/[dashboardId]/dimensions/route.ts` (new file)

Create endpoint to discover available filterable dimensions:

```typescript
import { loadModelsFromDirectory } from "@/semantic-layer/model-loader";
import { listChartsByDashboard } from "@/lib/repositories/dashboard";
import { join } from "node:path";
import type { NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> }
) {
  const { dashboardId } = await params;

  // Get all charts for this dashboard
  const charts = await listChartsByDashboard(dashboardId);

  // Extract unique explore names
  const exploreNames = new Set(
    charts
      .map(c => c.exploreName)
      .filter((name): name is string => !!name)
  );

  // Load models
  const modelsDir = join(process.cwd(), "semantic-layer", "models");
  const dataModel = loadModelsFromDirectory(modelsDir);

  // Build available dimensions list
  const availableDimensions = [];

  for (const exploreName of exploreNames) {
    const explore = dataModel.explores.find(e => e.name === exploreName);
    if (!explore) continue;

    for (const dim of explore.dimensions) {
      availableDimensions.push({
        exploreName: explore.name,
        field: `${explore.name}.${dim.name}`,
        displayName: dim.name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
        type: dim.type,
        conformKey: dim.conformKey,
      });
    }
  }

  // Group by conform key for cross-chart filtering
  const conformGroups = new Map<string, typeof availableDimensions>();
  for (const dim of availableDimensions) {
    if (dim.conformKey) {
      const group = conformGroups.get(dim.conformKey) || [];
      group.push(dim);
      conformGroups.set(dim.conformKey, group);
    }
  }

  return Response.json({
    dimensions: availableDimensions,
    conformGroups: Object.fromEntries(conformGroups),
  });
}
```

## Phase 3: Frontend - Filter UI (Day 3-5)

### 3.1 Dashboard Filter Context

**File**: `src/app/dashboards/[dashboardId]/filter-context.tsx` (new file)

```typescript
"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { Filter } from "@/semantic-layer/types";
import type { AvailableDimension } from "@/lib/types";

interface FilterContextValue {
  filters: Filter[];
  availableDimensions: AvailableDimension[];
  addFilter: (filter: Filter) => void;
  removeFilter: (index: number) => void;
  updateFilter: (index: number, filter: Filter) => void;
  clearFilters: () => void;
  isLoading: boolean;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({
  dashboardId,
  children
}: {
  dashboardId: string;
  children: ReactNode
}) {
  const [filters, setFilters] = useState<Filter[]>([]);
  const [availableDimensions, setAvailableDimensions] = useState<AvailableDimension[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load available dimensions on mount
  useEffect(() => {
    async function loadDimensions() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/dashboard/${dashboardId}/dimensions`);
        if (res.ok) {
          const data = await res.json();
          setAvailableDimensions(data.dimensions);
        }
      } catch (error) {
        console.error("Failed to load dimensions:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadDimensions();
  }, [dashboardId]);

  // Persist filters to localStorage
  useEffect(() => {
    const key = `dashboard_${dashboardId}_filters`;
    if (filters.length > 0) {
      localStorage.setItem(key, JSON.stringify(filters));
    } else {
      localStorage.removeItem(key);
    }
  }, [filters, dashboardId]);

  // Load filters from localStorage on mount
  useEffect(() => {
    const key = `dashboard_${dashboardId}_filters`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        setFilters(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved filters:", e);
      }
    }
  }, [dashboardId]);

  const addFilter = (filter: Filter) => {
    setFilters(prev => [...prev, filter]);
  };

  const removeFilter = (index: number) => {
    setFilters(prev => prev.filter((_, i) => i !== index));
  };

  const updateFilter = (index: number, filter: Filter) => {
    setFilters(prev => prev.map((f, i) => i === index ? filter : f));
  };

  const clearFilters = () => {
    setFilters([]);
  };

  return (
    <FilterContext.Provider
      value={{
        filters,
        availableDimensions,
        addFilter,
        removeFilter,
        updateFilter,
        clearFilters,
        isLoading,
      }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error("useFilters must be used within FilterProvider");
  }
  return context;
}
```

### 3.2 Filter Pane Component

**File**: `src/components/dashboard-filter-pane.tsx` (new file)

```typescript
"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFilters } from "@/app/dashboards/[dashboardId]/filter-context";
import type { Filter, Op } from "@/semantic-layer/types";

const operatorLabels: Record<Op, string> = {
  eq: "equals",
  neq: "does not equal",
  in: "is one of",
  not_in: "is not one of",
  gt: "greater than",
  gte: "greater than or equal",
  lt: "less than",
  lte: "less than or equal",
  between: "between",
  contains: "contains",
  starts_with: "starts with",
  is_null: "is null",
  is_not_null: "is not null",
};

export function DashboardFilterPane() {
  const {
    filters,
    availableDimensions,
    addFilter,
    removeFilter,
    clearFilters,
    isLoading
  } = useFilters();

  const [isAddingFilter, setIsAddingFilter] = useState(false);
  const [newFilterField, setNewFilterField] = useState<string>("");
  const [newFilterOp, setNewFilterOp] = useState<Op>("eq");
  const [newFilterValue, setNewFilterValue] = useState<string>("");

  const handleAddFilter = () => {
    if (!newFilterField) return;

    const dimension = availableDimensions.find(d => d.field === newFilterField);
    if (!dimension) return;

    let values: unknown[] = [];

    // Parse value based on dimension type and operator
    if (newFilterOp === "is_null" || newFilterOp === "is_not_null") {
      values = [];
    } else if (newFilterOp === "in" || newFilterOp === "not_in") {
      // Split comma-separated values
      values = newFilterValue.split(",").map(v => v.trim());
    } else if (newFilterOp === "between") {
      // Split into two values
      const parts = newFilterValue.split(",").map(v => v.trim());
      values = parts.slice(0, 2);
    } else {
      // Single value
      if (dimension.type === "number") {
        values = [parseFloat(newFilterValue)];
      } else {
        values = [newFilterValue];
      }
    }

    const filter: Filter = {
      field: newFilterField,
      op: newFilterOp,
      values,
    };

    addFilter(filter);

    // Reset form
    setNewFilterField("");
    setNewFilterOp("eq");
    setNewFilterValue("");
    setIsAddingFilter(false);
  };

  const getOperatorsForType = (type: string): Op[] => {
    switch (type) {
      case "string":
        return ["eq", "neq", "in", "not_in", "contains", "starts_with", "is_null", "is_not_null"];
      case "number":
        return ["eq", "neq", "gt", "gte", "lt", "lte", "between", "in", "not_in", "is_null", "is_not_null"];
      case "time":
        return ["eq", "neq", "gt", "gte", "lt", "lte", "between", "is_null", "is_not_null"];
      case "boolean":
        return ["eq", "neq", "is_null", "is_not_null"];
      default:
        return ["eq", "neq", "is_null", "is_not_null"];
    }
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading filters...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Active Filters */}
      {filters.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Active Filters</label>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-auto p-1 text-xs"
            >
              Clear All
            </Button>
          </div>
          <div className="space-y-2">
            {filters.map((filter, index) => {
              const dimension = availableDimensions.find(d => d.field === filter.field);
              return (
                <div
                  key={index}
                  className="flex items-center gap-2 rounded-md bg-muted p-2 text-sm"
                >
                  <div className="flex-1">
                    <span className="font-medium">{dimension?.displayName || filter.field}</span>
                    <span className="text-muted-foreground"> {operatorLabels[filter.op]} </span>
                    {filter.values && filter.values.length > 0 && (
                      <span className="font-medium">{filter.values.join(", ")}</span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFilter(index)}
                    className="h-auto p-1"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Filter Form */}
      {!isAddingFilter ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsAddingFilter(true)}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Filter
        </Button>
      ) : (
        <div className="space-y-3 rounded-md border p-3">
          <div className="space-y-2">
            <label htmlFor="filter-field" className="text-sm font-medium">
              Field
            </label>
            <Select value={newFilterField} onValueChange={setNewFilterField}>
              <SelectTrigger id="filter-field">
                <SelectValue placeholder="Select field" />
              </SelectTrigger>
              <SelectContent>
                {availableDimensions.map(dim => (
                  <SelectItem key={dim.field} value={dim.field}>
                    {dim.displayName} ({dim.exploreName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {newFilterField && (
            <>
              <div className="space-y-2">
                <label htmlFor="filter-operator" className="text-sm font-medium">
                  Operator
                </label>
                <Select
                  value={newFilterOp}
                  onValueChange={(v) => setNewFilterOp(v as Op)}
                >
                  <SelectTrigger id="filter-operator">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getOperatorsForType(
                      availableDimensions.find(d => d.field === newFilterField)?.type || "string"
                    ).map(op => (
                      <SelectItem key={op} value={op}>
                        {operatorLabels[op]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {newFilterOp !== "is_null" && newFilterOp !== "is_not_null" && (
                <div className="space-y-2">
                  <label htmlFor="filter-value" className="text-sm font-medium">
                    Value
                    {(newFilterOp === "in" || newFilterOp === "not_in" || newFilterOp === "between") && (
                      <span className="text-xs text-muted-foreground"> (comma-separated)</span>
                    )}
                  </label>
                  <Input
                    id="filter-value"
                    value={newFilterValue}
                    onChange={(e) => setNewFilterValue(e.target.value)}
                    placeholder={
                      newFilterOp === "in" || newFilterOp === "not_in"
                        ? "value1, value2, value3"
                        : newFilterOp === "between"
                        ? "min, max"
                        : "Enter value"
                    }
                  />
                </div>
              )}
            </>
          )}

          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handleAddFilter}
              disabled={!newFilterField || (!newFilterValue && newFilterOp !== "is_null" && newFilterOp !== "is_not_null")}
              className="flex-1"
            >
              Add
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsAddingFilter(false);
                setNewFilterField("");
                setNewFilterOp("eq");
                setNewFilterValue("");
              }}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {availableDimensions.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          No filterable dimensions available. Charts must use the semantic layer to enable filtering.
        </p>
      )}
    </div>
  );
}
```

### 3.3 Update Dashboard Page

**File**: `src/app/dashboards/[dashboardId]/page.tsx`

Integrate filter context and update data fetching:

```typescript
// Add imports
import { FilterProvider, useFilters } from "./filter-context";
import { DashboardFilterPane } from "@/components/dashboard-filter-pane";

// Wrap component with FilterProvider
export default function DashboardDetailPage() {
  const params = useParams<{ dashboardId: string }>();
  const dashboardId = params.dashboardId;

  return (
    <FilterProvider dashboardId={dashboardId}>
      <DashboardDetailPageContent dashboardId={dashboardId} />
    </FilterProvider>
  );
}

function DashboardDetailPageContent({ dashboardId }: { dashboardId: string }) {
  const { filters } = useFilters();
  // ... rest of existing code ...

  // Update data fetching effect to include filters
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const filtersParam = filters.length > 0
        ? `?filters=${encodeURIComponent(JSON.stringify(filters))}`
        : "";
      const res = await fetch(
        `/api/dashboard/${dashboardId}/data${filtersParam}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (cancelled) return;
      const sortedCharts = [...data.charts].sort((a, b) => a.position - b.position);
      setCharts(sortedCharts);
      const map: Record<string, Result[]> = {};
      for (const c of data.charts) map[c.id] = c.rows;
      setChartData(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [dashboardId, filters]); // Add filters as dependency

  // Replace mock filter pane content (lines 504-607) with:
  return (
    <Sheet open={isFiltersPaneOpen} onOpenChange={setIsFiltersPaneOpen}>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto p-4">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>
            Apply filters to all charts on this dashboard
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6">
          <DashboardFilterPane />
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

## Phase 4: Enhanced Features (Day 5-7)

### 4.1 Visual Filter Indicators

Add badges to charts showing which filters are applied:

```typescript
// In SortableChartCard component
{chart.filtersApplied && filters.length > 0 && (
  <div className="absolute top-2 left-1/2 -translate-x-1/2">
    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
      {filters.length} filter{filters.length !== 1 ? "s" : ""} applied
    </span>
  </div>
)}
```

### 4.2 Cross-Chart Filter Recommendations

Analyze conform keys to suggest cross-chart filters:

**File**: `src/components/filter-suggestions.tsx` (new file)

```typescript
export function FilterSuggestions() {
  const { availableDimensions, addFilter } = useFilters();

  // Find dimensions with same conform key across multiple explores
  const conformGroups = availableDimensions.reduce((acc, dim) => {
    if (dim.conformKey) {
      if (!acc[dim.conformKey]) acc[dim.conformKey] = [];
      acc[dim.conformKey].push(dim);
    }
    return acc;
  }, {} as Record<string, typeof availableDimensions>);

  const crossChartDimensions = Object.entries(conformGroups)
    .filter(([_, dims]) => dims.length > 1)
    .map(([key, dims]) => ({ conformKey: key, dimensions: dims }));

  if (crossChartDimensions.length === 0) return null;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Suggested Cross-Chart Filters</label>
      <div className="space-y-1">
        {crossChartDimensions.map(({ conformKey, dimensions }) => (
          <button
            key={conformKey}
            onClick={() => {
              // Add filter for the first dimension in the group
              // It will apply to all dimensions with the same conform key
              addFilter({
                field: dimensions[0].field,
                op: "eq",
                values: [],
              });
            }}
            className="w-full text-left rounded-md border p-2 text-sm hover:bg-muted"
          >
            <div className="font-medium">{dimensions[0].displayName}</div>
            <div className="text-xs text-muted-foreground">
              Applies to {dimensions.length} chart{dimensions.length !== 1 ? "s" : ""}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

### 4.3 Date Range Picker

Add specialized date range filter UI for time dimensions:

```typescript
// Use shadcn date picker component
// Automatically convert to TimeDim format
// Support presets: "Last 7 days", "Last 30 days", "This month", etc.
```

### 4.4 Filter Presets

Allow saving and loading filter combinations:

```typescript
// Store in localStorage or database
// Quick access to common filter sets
// Example: "Q4 2024 Sales", "Active Customers", etc.
```

## Phase 5: Migration & Adoption (Ongoing)

### 5.1 Gradual Chart Migration

**Strategy**: New charts automatically use semantic layer, old charts gradually migrated

**File**: `src/components/chart-migration-banner.tsx` (new file)

```typescript
// Show banner on charts without semantic metadata
// Offer "Migrate to enable filters" button
// On click: attempt to extract semantic query from SQL
```

### 5.2 Backward Compatibility

**Ensure**:
- ✅ Charts without `semanticQueryJson` still work (execute raw SQL)
- ✅ Filter pane shows which charts have filters applied
- ✅ No breaking changes to existing functionality

## Testing Plan

### Unit Tests

1. Query builder with filters
2. Filter parsing and serialization
3. Dimension discovery logic
4. SQL compilation with filters

### Integration Tests

1. Create chart → verify semantic metadata stored
2. Apply filter → verify SQL recompiled correctly
3. Cross-chart filtering with conform keys
4. Filter persistence in localStorage

### E2E Tests

1. User creates dashboard with multiple charts
2. User adds filter via UI
3. Verify all compatible charts update
4. Verify filter persists on page reload
5. Verify charts without semantic metadata unaffected

## Performance Considerations

### Optimization Strategies

1. **Cache compiled SQL**: Store compiled SQL with filter hash to avoid recompilation
2. **Parallel execution**: Continue executing chart queries in parallel
3. **Incremental loading**: Load filter dimensions lazily as needed
4. **Debounce filter changes**: Wait 300ms after filter change before refetching data

### Monitoring

- Track query compilation time
- Monitor API response times with filters
- Alert on slow filter operations (>2s)

## Security Considerations

1. **Filter validation**: Validate filter values on backend before SQL compilation
2. **SQL injection prevention**: Use query builder (no raw SQL concatenation)
3. **Access control**: Verify user has access to dashboard before applying filters
4. **Rate limiting**: Limit filter API calls to prevent abuse

## Rollout Plan

### Phase 1: Internal Testing (Week 1)
- Deploy to staging environment
- Test with sample dashboards
- Gather feedback from team

### Phase 2: Beta Release (Week 2)
- Feature flag: `enable_dashboard_filters`
- Invite select users to test
- Monitor error rates and performance

### Phase 3: General Availability (Week 3)
- Enable for all users
- Announce feature in release notes
- Provide documentation and tutorials

## Success Metrics

### Adoption Metrics
- % of charts using semantic layer (target: 80% of new charts)
- % of dashboards with active filters (target: 40%)
- Number of filters created per dashboard (track average)

### Performance Metrics
- Average dashboard load time with filters (target: <2s)
- Query compilation time (target: <100ms)
- Filter dimension discovery time (target: <500ms)

### User Satisfaction
- User feedback score (target: 4+/5)
- Support tickets related to filtering (target: <5/week)
- Feature request closure rate (target: 80%+)

## Future Enhancements

### Phase 6: Advanced Features (Future)

1. **Drilldown**: Click on chart value to filter other charts
2. **Filter by chart selection**: Select data point in Chart A → filter Chart B
3. **Relative time filters**: "Last N days", "Previous month", etc.
4. **Computed filters**: Filter by calculated fields
5. **Filter templates**: Reusable filter patterns across dashboards
6. **Filter history**: Undo/redo filter changes
7. **Export with filters**: Export dashboard data with filters applied
8. **Scheduled reports**: Send dashboard with specific filters on schedule

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Complex queries don't compile correctly | High | Medium | Comprehensive test suite, fallback to raw SQL |
| Performance degradation with many filters | Medium | Low | Caching, query optimization, monitoring |
| User confusion with semantic layer vs SQL | Medium | Medium | Clear UI indicators, documentation |
| Breaking changes to existing charts | High | Low | Backward compatibility, thorough testing |
| SQL injection via filters | High | Low | Use parameterized queries, validation |

## Open Questions

1. **Filter scope**: Should filters be dashboard-level only, or also support chart-level overrides?
   - **Recommendation**: Start with dashboard-level, add chart-level in Phase 6

2. **Filter persistence**: LocalStorage vs database vs URL params?
   - **Recommendation**: LocalStorage for now, add URL params in Phase 6 for sharing

3. **Conform key matching**: Strict or fuzzy matching?
   - **Recommendation**: Strict matching on conform key, fuzzy as future enhancement

4. **Multiple explores**: How to handle dashboards with charts from different explores?
   - **Recommendation**: Show all dimensions, apply to compatible charts only

## Resources & Documentation

### Key Files to Reference

- `semantic-layer/types.ts` - Type definitions for filters, queries
- `semantic-layer/query-builder.ts` - SQL compilation logic
- `semantic-layer/model-loader.ts` - Model loading from YAML
- `src/app/dashboards/[dashboardId]/page.tsx` - Dashboard UI
- `src/app/api/dashboard/[dashboardId]/data/route.ts` - Data fetching API

### External Documentation

- DuckDB SQL reference: https://duckdb.org/docs/sql/introduction
- Looker LookML (inspiration): https://cloud.google.com/looker/docs/what-is-lookml
- Cube.js filters (similar concept): https://cube.dev/docs/product/apis-integrations/rest-api/query-format#filters

## Summary

This plan provides a comprehensive, phased approach to implementing dashboard filters using the semantic layer. The hybrid approach ensures backward compatibility while enabling powerful cross-chart filtering capabilities. The implementation leverages existing infrastructure and provides a clear path for gradual adoption.

**Estimated Timeline**: 5-7 days for core functionality (Phases 1-3), additional 2-3 days for enhanced features (Phase 4)

**Key Benefits**:
- ✅ Backward compatible with existing charts
- ✅ Leverages existing semantic layer infrastructure
- ✅ Enables intelligent cross-chart filtering
- ✅ Type-safe and performant
- ✅ Clear migration path for existing dashboards

**Next Steps**: Review this plan with the team, prioritize phases, and begin implementation with Phase 1 (schema changes).
