# Task 8: Visual Enhancements & Polish

**Goal**: Add polish and advanced features to improve UX

**Dependencies**: Task 7 (fully integrated filters)

**Estimated Lines**: ~250 lines (new components + enhancements)

**Priority**: Optional - These are "nice-to-have" improvements

---

## Files to Create

- `src/components/filter-suggestions.tsx` (optional)

## Files to Modify

- `src/components/dashboard-filter-pane.tsx` (enhancements)
- `src/app/dashboards/[dashboardId]/page.tsx` (polish)

---

## Enhancement 1: Cross-Chart Filter Suggestions

### Goal
Show suggested filters that apply to multiple charts (via conformKey)

### Implementation

Add to `src/components/dashboard-filter-pane.tsx`:

```typescript
// Add after Active Filters section, before Add Filter button

{/* Cross-Chart Filter Suggestions */}
{availableDimensions.length > 0 && (() => {
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
    .slice(0, 3); // Show max 3 suggestions

  if (crossChartDimensions.length === 0) return null;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground">
        Suggested Cross-Chart Filters
      </label>
      <div className="space-y-1">
        {crossChartDimensions.map(([conformKey, dimensions]) => (
          <button
            key={conformKey}
            onClick={() => {
              setNewFilterField(dimensions[0].field);
              setIsAddingFilter(true);
            }}
            className="w-full rounded-md border border-dashed border-muted-foreground/25 p-2 text-left text-sm transition-colors hover:border-muted-foreground/50 hover:bg-muted/50"
          >
            <div className="font-medium">{dimensions[0].displayName}</div>
            <div className="text-xs text-muted-foreground">
              Applies to {dimensions.length} chart{dimensions.length !== 1 ? "s" : ""}: {dimensions.map(d => d.exploreName).join(", ")}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
})()}
```

**Acceptance Criteria**:
- ✅ Shows dimensions that exist in multiple explores
- ✅ Max 3 suggestions (avoid clutter)
- ✅ Clicking suggestion opens add filter form with field pre-selected
- ✅ Hidden when no cross-chart dimensions exist

---

## Enhancement 2: Filter Stats

### Goal
Show helpful statistics about filtering capability

### Implementation

Add to `src/components/dashboard-filter-pane.tsx` at the top:

```typescript
{/* Filter Stats */}
<div className="rounded-md bg-muted/50 p-3 text-sm">
  <div className="flex items-center justify-between">
    <span className="text-muted-foreground">Charts with filters enabled</span>
    <span className="font-medium">
      {availableDimensions.reduce((acc, dim) => {
        const explores = new Set();
        availableDimensions.forEach(d => explores.add(d.exploreName));
        return explores.size;
      }, 0)}
    </span>
  </div>
  {filters.length > 0 && (
    <div className="mt-1 flex items-center justify-between">
      <span className="text-muted-foreground">Active filters</span>
      <span className="font-medium">{filters.length}</span>
    </div>
  )}
</div>
```

**Acceptance Criteria**:
- ✅ Shows count of unique explores (charts with semantic layer)
- ✅ Shows active filter count when filters applied
- ✅ Subtle styling (not prominent)

---

## Enhancement 3: Improved Empty States

### Goal
Make empty states more helpful and actionable

### Implementation

Replace empty state in `src/components/dashboard-filter-pane.tsx`:

```typescript
{/* Enhanced Empty State */}
{availableDimensions.length === 0 && (
  <div className="rounded-md border border-dashed p-6 text-center">
    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
      <FunnelIcon className="h-6 w-6 text-muted-foreground" />
    </div>
    <h3 className="mb-1 text-sm font-medium">No filterable dimensions</h3>
    <p className="mb-3 text-xs text-muted-foreground">
      Charts created from SQL queries with semantic layer metadata can be filtered.
    </p>
    <p className="text-xs text-muted-foreground">
      Add a chart to this dashboard to enable filtering.
    </p>
  </div>
)}
```

**Acceptance Criteria**:
- ✅ Clear visual hierarchy
- ✅ Explains what's needed to enable filtering
- ✅ Friendly, not error-like tone

---

## Enhancement 4: Loading Optimizations

### Goal
Better loading feedback and debouncing

### Implementation

Add debounce to filter changes in `src/app/dashboards/[dashboardId]/page.tsx`:

```typescript
import { useCallback, useRef } from "react";

function DashboardDetailPageContent({ dashboardId }: { dashboardId: string }) {
  const { filters } = useFilters();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout>();

  const fetchChartData = useCallback(async () => {
    setIsRefreshing(true);

    const filtersParam = filters.length > 0
      ? `?filters=${encodeURIComponent(JSON.stringify(filters))}`
      : "";

    const res = await fetch(
      `/api/dashboard/${dashboardId}/data${filtersParam}`,
      { cache: "no-store" }
    );

    if (!res.ok) {
      setIsRefreshing(false);
      return;
    }

    const data = await res.json();
    const sortedCharts = [...data.charts].sort(
      (a, b) => a.position - b.position
    );
    setCharts(sortedCharts);

    const map: Record<string, Result[]> = {};
    for (const c of data.charts) map[c.id] = c.rows;
    setChartData(map);
    setIsRefreshing(false);
  }, [dashboardId, filters]);

  useEffect(() => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce for 300ms
    debounceTimerRef.current = setTimeout(() => {
      fetchChartData();
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [fetchChartData]);

  // Add loading indicator
  return (
    <div className="relative">
      {isRefreshing && (
        <div className="absolute right-6 top-2 z-10">
          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-sm">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            <span>Updating...</span>
          </div>
        </div>
      )}
      {/* Rest of dashboard content */}
    </div>
  );
}
```

**Acceptance Criteria**:
- ✅ 300ms debounce prevents rapid API calls
- ✅ Loading indicator shows during refresh
- ✅ Smooth transition (no flash)

---

## Enhancement 5: Keyboard Shortcuts

### Goal
Add keyboard shortcuts for common actions

### Implementation

Add to `src/app/dashboards/[dashboardId]/page.tsx`:

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // 'f' to open filters (when not in input field)
    if (
      e.key === "f" &&
      !e.metaKey &&
      !e.ctrlKey &&
      document.activeElement?.tagName !== "INPUT" &&
      document.activeElement?.tagName !== "TEXTAREA"
    ) {
      e.preventDefault();
      setIsFiltersPaneOpen(true);
    }

    // Escape to close filters
    if (e.key === "Escape" && isFiltersPaneOpen) {
      setIsFiltersPaneOpen(false);
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [isFiltersPaneOpen]);
```

Update Filters button to show shortcut:

```typescript
<Button
  variant="outline"
  size="default"
  onClick={() => setIsFiltersPaneOpen(true)}
>
  <FunnelIcon className="h-4 w-4" />
  Filters
  <kbd className="ml-2 hidden rounded border bg-muted px-1 text-xs lg:inline-block">
    F
  </kbd>
</Button>
```

**Acceptance Criteria**:
- ✅ 'f' key opens filter pane (when not focused in input)
- ✅ Escape closes filter pane
- ✅ Keyboard shortcut shown in button (on desktop)
- ✅ Doesn't interfere with typing in inputs

---

## Enhancement 6: Filter Persistence Indicator

### Goal
Show feedback when filters are saved

### Implementation

Add toast notification in `src/app/dashboards/[dashboardId]/filter-context.tsx`:

```typescript
import { useEffect, useState } from "react";

// Add state for toast
const [showSavedToast, setShowSavedToast] = useState(false);

// Modify persistence effect
useEffect(() => {
  const key = `dashboard_${dashboardId}_filters`;

  if (filters.length > 0) {
    try {
      localStorage.setItem(key, JSON.stringify(filters));

      // Show toast briefly
      setShowSavedToast(true);
      const timer = setTimeout(() => setShowSavedToast(false), 2000);
      return () => clearTimeout(timer);
    } catch (error) {
      console.error("[Filters] Failed to save filters:", error);
    }
  } else {
    localStorage.removeItem(key);
  }
}, [filters, dashboardId]);
```

Add toast to provider return:

```typescript
return (
  <FilterContext.Provider value={{...}}>
    {children}
    {showSavedToast && (
      <div className="fixed bottom-4 right-4 z-50 rounded-md bg-foreground px-4 py-2 text-sm text-background shadow-lg">
        Filters saved
      </div>
    )}
  </FilterContext.Provider>
);
```

**Acceptance Criteria**:
- ✅ Toast appears when filters saved
- ✅ Auto-dismisses after 2 seconds
- ✅ Not annoying (subtle)

---

## Enhancement 7: Better Error Handling

### Goal
Show user-friendly errors when things go wrong

### Implementation

Add error state to filter context:

```typescript
const [error, setError] = useState<string | null>(null);

// In dimension loading:
catch (error) {
  const message = "Failed to load filter options. Please try refreshing the page.";
  setError(message);
  console.error("[Filters]", error);
}

// In provider return:
{error && (
  <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
    {error}
    <button
      onClick={() => setError(null)}
      className="ml-2 underline"
    >
      Dismiss
    </button>
  </div>
)}
```

**Acceptance Criteria**:
- ✅ Errors shown in friendly format
- ✅ User can dismiss errors
- ✅ Doesn't break UI

---

## Optional Enhancement: Date Range Picker

### Goal
Specialized UI for time dimensions

### Implementation (if time allows)

Create `src/components/date-range-filter.tsx`:

```typescript
"use client";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: [Date?, Date?];
  onChange: (range: [Date, Date]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start text-left">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value[0] ? (
            value[1] ? (
              <>
                {format(value[0], "LLL dd, y")} - {format(value[1], "LLL dd, y")}
              </>
            ) : (
              format(value[0], "LLL dd, y")
            )
          ) : (
            <span>Pick a date range</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={{ from: value[0], to: value[1] }}
          onSelect={(range) => {
            if (range?.from && range?.to) {
              onChange([range.from, range.to]);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
```

Integrate into filter pane for time dimensions.

---

## Testing All Enhancements

### Manual Test Checklist

- [ ] Cross-chart suggestions appear when applicable
- [ ] Clicking suggestion pre-fills filter form
- [ ] Filter stats show correct counts
- [ ] Empty state displays when no dimensions
- [ ] Loading indicator shows during refetch
- [ ] Debounce prevents rapid API calls
- [ ] 'f' key opens filter pane
- [ ] Escape key closes filter pane
- [ ] Keyboard shortcut shown on desktop
- [ ] Toast appears when filters saved
- [ ] Errors display with dismiss button
- [ ] All enhancements work together without conflicts

---

## Performance Validation

After implementing enhancements:

1. Test with 10+ filters → should remain responsive
2. Test rapid filter changes → debounce should work
3. Test with 20+ charts → loading indicator helpful
4. Monitor console for excessive re-renders

---

## Notes

- These enhancements are **optional** - core functionality works without them
- Implement incrementally - don't need to do all at once
- Focus on most impactful improvements first:
  1. Loading optimizations (debounce)
  2. Cross-chart suggestions
  3. Keyboard shortcuts
  4. Everything else
- Date range picker requires additional dependencies (date-fns, calendar component)
- Consider user feedback before implementing all enhancements
