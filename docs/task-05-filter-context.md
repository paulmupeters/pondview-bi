# Task 5: Filter Context Provider

**Goal**: Create React Context for dashboard filter state management

**Dependencies**: Task 1 (types), Task 3 (dimensions API)

**Estimated Lines**: ~150 lines

---

## Files to Create

- `src/app/dashboards/[dashboardId]/filter-context.tsx`

---

## Deliverables

### 1. Create Filter Context and Provider

Create `src/app/dashboards/[dashboardId]/filter-context.tsx`:

```typescript
"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import type { Filter } from "@/semantic-layer/types";
import type { AvailableDimension } from "@/lib/types/filters";

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
  children,
}: {
  dashboardId: string;
  children: ReactNode;
}) {
  const [filters, setFilters] = useState<Filter[]>([]);
  const [availableDimensions, setAvailableDimensions] = useState<
    AvailableDimension[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load available dimensions from API on mount
  useEffect(() => {
    let cancelled = false;

    async function loadDimensions() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/dashboard/${dashboardId}/dimensions`);
        if (!res.ok) {
          throw new Error(`Failed to load dimensions: ${res.statusText}`);
        }

        const data = await res.json();

        if (!cancelled) {
          setAvailableDimensions(data.dimensions || []);

          if (data.message) {
            console.log(`[Filters] ${data.message}`);
          }
        }
      } catch (error) {
        console.error("[Filters] Failed to load dimensions:", error);

        if (!cancelled) {
          setAvailableDimensions([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadDimensions();

    return () => {
      cancelled = true;
    };
  }, [dashboardId]);

  // Load filters from localStorage on mount
  useEffect(() => {
    const key = `dashboard_${dashboardId}_filters`;
    const saved = localStorage.getItem(key);

    if (saved) {
      try {
        const parsed = JSON.parse(saved);

        if (Array.isArray(parsed)) {
          setFilters(parsed);
          console.log(`[Filters] Loaded ${parsed.length} saved filter(s)`);
        }
      } catch (error) {
        console.error("[Filters] Failed to parse saved filters:", error);
        // Clear invalid data
        localStorage.removeItem(key);
      }
    }
  }, [dashboardId]);

  // Persist filters to localStorage whenever they change
  useEffect(() => {
    const key = `dashboard_${dashboardId}_filters`;

    if (filters.length > 0) {
      try {
        localStorage.setItem(key, JSON.stringify(filters));
        console.log(`[Filters] Saved ${filters.length} filter(s) to localStorage`);
      } catch (error) {
        console.error("[Filters] Failed to save filters:", error);
      }
    } else {
      // Remove from localStorage when no filters
      localStorage.removeItem(key);
    }
  }, [filters, dashboardId]);

  // Filter management functions
  const addFilter = (filter: Filter) => {
    setFilters((prev) => {
      const next = [...prev, filter];
      console.log("[Filters] Added filter:", filter);
      return next;
    });
  };

  const removeFilter = (index: number) => {
    setFilters((prev) => {
      const removed = prev[index];
      const next = prev.filter((_, i) => i !== index);
      console.log("[Filters] Removed filter:", removed);
      return next;
    });
  };

  const updateFilter = (index: number, filter: Filter) => {
    setFilters((prev) => {
      const next = prev.map((f, i) => (i === index ? filter : f));
      console.log("[Filters] Updated filter at index", index, "to:", filter);
      return next;
    });
  };

  const clearFilters = () => {
    const count = filters.length;
    setFilters([]);
    console.log(`[Filters] Cleared ${count} filter(s)`);
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
    throw new Error("useFilters must be used within a FilterProvider");
  }

  return context;
}
```

---

## Acceptance Criteria

- ✅ Context provides all filter management functions
- ✅ Filters persist across page reloads via localStorage
- ✅ Dimensions are loaded from API on mount
- ✅ `useFilters()` hook throws helpful error when used incorrectly
- ✅ No memory leaks (cleanup in useEffect return functions)
- ✅ Loading state managed correctly
- ✅ Invalid localStorage data handled gracefully
- ✅ Console logs provide helpful debugging information
- ✅ Type-safe (all TypeScript types correct)

---

## Testing

### Test Case 1: Provider initialization

**Setup**: Wrap component with `<FilterProvider dashboardId="test">`

**Expected**:
- `isLoading` starts as `true`
- API call made to `/api/dashboard/test/dimensions`
- After response, `isLoading` becomes `false`
- `availableDimensions` populated with API data

### Test Case 2: Add filter

**Action**: Call `addFilter({ field: "test.field", op: "eq", values: ["test"] })`

**Expected**:
- Filter added to `filters` array
- localStorage updated with key `dashboard_{id}_filters`
- Console log: "Added filter: ..."

### Test Case 3: Remove filter

**Setup**: Add 3 filters

**Action**: Call `removeFilter(1)` to remove middle filter

**Expected**:
- Filter at index 1 removed
- `filters` array has 2 items
- localStorage updated
- Console log: "Removed filter: ..."

### Test Case 4: Clear filters

**Setup**: Add multiple filters

**Action**: Call `clearFilters()`

**Expected**:
- `filters` array becomes empty
- localStorage key removed
- Console log: "Cleared N filter(s)"

### Test Case 5: Filter persistence

**Setup**: Add filters and reload page

**Expected**:
- Filters loaded from localStorage on mount
- `filters` array populated with saved values
- Console log: "Loaded N saved filter(s)"

### Test Case 6: Invalid localStorage data

**Setup**: Manually set localStorage to invalid JSON

**Expected**:
- Error caught and logged
- Invalid data removed from localStorage
- `filters` remains empty array
- No crashes

### Test Case 7: Hook without provider

**Action**: Use `useFilters()` outside of `FilterProvider`

**Expected**:
- Throws error: "useFilters must be used within a FilterProvider"

### Test Case 8: Component unmount

**Action**: Unmount component with FilterProvider

**Expected**:
- No console warnings about memory leaks
- Cleanup functions called
- API requests cancelled if in-flight

---

## Usage Example

```typescript
import { FilterProvider, useFilters } from "./filter-context";

// Wrap your dashboard
function Dashboard({ dashboardId }) {
  return (
    <FilterProvider dashboardId={dashboardId}>
      <DashboardContent />
    </FilterProvider>
  );
}

// Use in child components
function FilterPanel() {
  const { filters, addFilter, removeFilter, clearFilters, isLoading } = useFilters();

  if (isLoading) {
    return <div>Loading filters...</div>;
  }

  return (
    <div>
      <h3>Active Filters: {filters.length}</h3>
      <button onClick={() => addFilter({...})}>Add Filter</button>
      <button onClick={clearFilters}>Clear All</button>
    </div>
  );
}
```

---

## localStorage Schema

**Key**: `dashboard_{dashboardId}_filters`

**Value**: JSON stringified array of Filter objects

```json
[
  {
    "field": "unicorns.Country",
    "op": "eq",
    "values": ["China"]
  },
  {
    "field": "unicorns.year",
    "op": "gt",
    "values": [2020]
  }
]
```

---

## Notes

- The context uses React's built-in state management (no external library needed)
- localStorage is the storage mechanism (could be upgraded to database in future)
- All state changes trigger re-renders of consuming components
- The provider is dashboard-scoped (each dashboard has independent filter state)
- Console logging helps with debugging during development
