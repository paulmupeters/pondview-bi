# Task 7: Dashboard Page Integration

**Goal**: Connect all filter pieces in the dashboard page

**Dependencies**: Task 4 (filter API), Task 5 (context), Task 6 (UI component)

**Estimated Lines**: ~100 lines (modifications to existing file)

---

## Files to Modify

- `src/app/dashboards/[dashboardId]/page.tsx`

---

## Deliverables

### 1. Wrap page with FilterProvider

Restructure the component to provide filter context:

```typescript
import { FilterProvider } from "./filter-context";

export default function DashboardDetailPage() {
  const params = useParams<{ dashboardId: string }>();
  const dashboardId = params.dashboardId;

  return (
    <FilterProvider dashboardId={dashboardId}>
      <DashboardDetailPageContent dashboardId={dashboardId} />
    </FilterProvider>
  );
}
```

### 2. Extract content into new component

Move all existing logic to `DashboardDetailPageContent`:

```typescript
function DashboardDetailPageContent({ dashboardId }: { dashboardId: string }) {
  // All existing state and logic from DashboardDetailPage
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [charts, setCharts] = useState<DashboardChart[]>([]);
  // ... etc ...

  // NOW we can use the filter hook
  const { filters } = useFilters();

  // ... rest of component
}
```

### 3. Update data fetching effect

Modify the `useEffect` that fetches chart data to include filters:

```typescript
const { filters } = useFilters();

useEffect(() => {
  let cancelled = false;
  (async () => {
    // Build query string with filters if present
    const filtersParam = filters.length > 0
      ? `?filters=${encodeURIComponent(JSON.stringify(filters))}`
      : "";

    const res = await fetch(
      `/api/dashboard/${dashboardId}/data${filtersParam}`,
      { cache: "no-store" }
    );

    if (!res.ok) return;
    const data = (await res.json()) as {
      charts: (DashboardChart & { rows: Result[]; filtersApplied?: boolean })[];
    };
    if (cancelled) return;

    const sortedCharts = [...data.charts].sort(
      (a, b) => a.position - b.position
    );
    setCharts(sortedCharts);

    const map: Record<string, Result[]> = {};
    for (const c of data.charts) map[c.id] = c.rows;
    setChartData(map);
  })();

  return () => {
    cancelled = true;
  };
}, [dashboardId, filters]); // Add filters to dependency array
```

### 4. Replace mock filter pane

Replace the existing filter pane content (lines 504-607) with the real component:

```typescript
import { DashboardFilterPane } from "@/components/dashboard-filter-pane";

// ... in the return statement ...

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
```

### 5. Add visual filter indicators

Add badge to charts when filters are applied:

```typescript
// In SortableChartCard component, update the props type:
type SortableChartCardProps = {
  chart: DashboardChart & { filtersApplied?: boolean };
  config: Config | CardConfig | null;
  rows: Result[];
  onConfigChange: (newChartJson: string) => Promise<void>;
  onDelete: () => Promise<void>;
};

// In the component return, add filter badge:
function SortableChartCard({
  chart,
  config,
  rows,
  onConfigChange,
  onDelete,
}: SortableChartCardProps) {
  const { filters } = useFilters();

  // ... existing code ...

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative flex flex-col rounded-xl bg-card p-4 md:p-2"
    >
      {/* Existing drag/view buttons */}
      <div className="absolute left-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {/* ... existing buttons ... */}
      </div>

      {/* NEW: Filter indicator badge */}
      {chart.filtersApplied && filters.length > 0 && (
        <div className="absolute left-1/2 top-2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            {filters.length} filter{filters.length !== 1 ? "s" : ""} applied
          </span>
        </div>
      )}

      {/* Existing config/delete buttons */}
      {config && rows.length > 0 && !isCardConfig(config) ? (
        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {/* ... existing buttons ... */}
        </div>
      ) : /* ... */}

      {/* Existing chart content */}
      {/* ... */}
    </div>
  );
}
```

### 6. Update imports

Add necessary imports at the top of the file:

```typescript
import { FilterProvider, useFilters } from "./filter-context";
import { DashboardFilterPane } from "@/components/dashboard-filter-pane";
```

---

## Full Code Changes Summary

### Changes to make:

1. **Split component**: `DashboardDetailPage` → wrapper with provider + `DashboardDetailPageContent` with logic
2. **Add imports**: FilterProvider, useFilters, DashboardFilterPane
3. **Use filter hook**: `const { filters } = useFilters()` in content component
4. **Update data fetch**: Add filters to URL params and dependency array
5. **Replace mock UI**: Lines 504-607 with `<DashboardFilterPane />`
6. **Add filter badges**: Show filter count on filtered charts
7. **Update types**: Add `filtersApplied?: boolean` to chart type

---

## Acceptance Criteria

- ✅ Dashboard wrapped with FilterProvider
- ✅ Filter changes trigger data refetch automatically
- ✅ Filter pane shows available dimensions from charts
- ✅ Can add/remove/clear filters through UI
- ✅ Charts update when filters change
- ✅ Visual indicator shows filtered charts (badge appears on hover)
- ✅ No breaking changes to existing functionality
- ✅ Smooth transitions and loading states
- ✅ TypeScript compiles without errors
- ✅ Charts without semantic metadata still work (show no filter badge)

---

## Testing

### Test Case 1: Filter pane opens

**Steps**:
1. Open dashboard
2. Click "Filters" button

**Expected**:
- Filter pane opens from right
- Shows available dimensions from charts
- "Add Filter" button visible

### Test Case 2: Add filter updates charts

**Steps**:
1. Open filter pane
2. Add filter: Country equals "China"
3. Observe dashboard

**Expected**:
- Filter pane shows active filter
- Dashboard refetches data (loading state briefly visible)
- Charts with semantic metadata update
- Filter badge appears on filtered charts (on hover)

### Test Case 3: Multiple filters

**Steps**:
1. Add first filter: Country equals "China"
2. Add second filter: year greater than 2020
3. Observe

**Expected**:
- Both filters shown in pane
- Charts refetch with both filters
- Badge shows "2 filters applied"
- Results match both conditions (AND logic)

### Test Case 4: Remove filter

**Steps**:
1. Add 2 filters
2. Remove one filter

**Expected**:
- Chart data refetches with remaining filter
- Badge updates to "1 filter applied"

### Test Case 5: Clear all filters

**Steps**:
1. Add multiple filters
2. Click "Clear All"

**Expected**:
- All filters removed
- Charts refetch without filters
- Filter badges disappear
- Original data shown

### Test Case 6: Filter persistence

**Steps**:
1. Add filters
2. Reload page

**Expected**:
- Filters persist (loaded from localStorage)
- Charts automatically fetch with filters
- Filter pane shows saved filters

### Test Case 7: Mixed charts

**Setup**: Dashboard with some charts having semantic metadata, others without

**Steps**: Add filter

**Expected**:
- Semantic charts update with filter
- Non-semantic charts unchanged
- Badge only on filtered charts
- No errors

### Test Case 8: Chart hover states

**Steps**:
1. Add filter
2. Hover over filtered chart

**Expected**:
- Filter badge appears
- Drag handle appears
- Config/delete buttons appear
- All hover elements visible simultaneously without overlap

### Test Case 9: No semantic charts

**Setup**: Dashboard with only raw SQL charts

**Steps**: Open filter pane

**Expected**:
- Helpful message: "No filterable dimensions available..."
- "Add Filter" button disabled
- No errors

---

## Visual Layout

```
┌─────────────────────────────────────────────────────────┐
│ Dashboard Title                     [Settings] [Filters] │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                  │
│  │ [=] [↗] │  │ [=] [↗] │  │ [=] [↗] │                  │
│  │         │  │ [2 filters │  │         │                  │
│  │  Chart  │  │  applied] │  │  Chart  │                  │
│  │    1    │  │         │  │    3    │                  │
│  │         │  │  Chart  │  │         │                  │
│  │         │  │    2    │  │ [⚙] [×] │                  │
│  │ [⚙] [×] │  │         │  │         │                  │
│  └─────────┘  │ [⚙] [×] │  └─────────┘                  │
│               └─────────┘                                │
│                                                           │
└─────────────────────────────────────────────────────────┘
                                        ┌──────────────────┐
                                        │ Filters          │
                                        ├──────────────────┤
                                        │ Active Filters   │
                                        │ • Country = USA  │
                                        │ • Year > 2020 [×]│
                                        │        [Clear All]│
                                        │                  │
                                        │ [+ Add Filter]   │
                                        └──────────────────┘
```

---

## Performance Considerations

- **Debouncing**: Consider adding 300ms debounce if needed (not in this task)
- **Memoization**: Charts re-render only when data changes
- **Parallel queries**: Maintained via Promise.all in API
- **Cache invalidation**: New filters trigger fresh fetch

---

## Notes

- The filter context automatically triggers re-renders when filters change
- No manual event bus or state management library needed
- React's built-in useState + useContext + useEffect handle all reactivity
- The dependency array `[dashboardId, filters]` is key to automatic updates
- Filter badge z-index ensures it appears above chart content
