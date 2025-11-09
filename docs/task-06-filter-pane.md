# Task 6: Filter Pane Component

**Goal**: Build interactive filter UI component

**Dependencies**: Task 1 (types), Task 5 (filter context)

**Estimated Lines**: ~300 lines

---

## Files to Create

- `src/components/dashboard-filter-pane.tsx`

---

## Deliverables

### 1. Create Filter Pane Component

Create `src/components/dashboard-filter-pane.tsx`:

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
    isLoading,
  } = useFilters();

  const [isAddingFilter, setIsAddingFilter] = useState(false);
  const [newFilterField, setNewFilterField] = useState<string>("");
  const [newFilterOp, setNewFilterOp] = useState<Op>("eq");
  const [newFilterValue, setNewFilterValue] = useState<string>("");

  const handleAddFilter = () => {
    if (!newFilterField) return;

    const dimension = availableDimensions.find((d) => d.field === newFilterField);
    if (!dimension) return;

    let values: unknown[] = [];

    // Parse value based on dimension type and operator
    if (newFilterOp === "is_null" || newFilterOp === "is_not_null") {
      values = [];
    } else if (newFilterOp === "in" || newFilterOp === "not_in") {
      // Split comma-separated values
      values = newFilterValue.split(",").map((v) => v.trim()).filter(Boolean);
    } else if (newFilterOp === "between") {
      // Split into two values
      const parts = newFilterValue.split(",").map((v) => v.trim());
      if (parts.length >= 2) {
        values = parts.slice(0, 2);
        // Parse as numbers if dimension is numeric
        if (dimension.type === "number") {
          values = values.map((v) => parseFloat(v as string));
        }
      }
    } else {
      // Single value
      if (dimension.type === "number") {
        const parsed = parseFloat(newFilterValue);
        if (!isNaN(parsed)) {
          values = [parsed];
        }
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
        return [
          "eq",
          "neq",
          "in",
          "not_in",
          "contains",
          "starts_with",
          "is_null",
          "is_not_null",
        ];
      case "number":
        return [
          "eq",
          "neq",
          "gt",
          "gte",
          "lt",
          "lte",
          "between",
          "in",
          "not_in",
          "is_null",
          "is_not_null",
        ];
      case "time":
        return [
          "eq",
          "neq",
          "gt",
          "gte",
          "lt",
          "lte",
          "between",
          "is_null",
          "is_not_null",
        ];
      case "boolean":
        return ["eq", "neq", "is_null", "is_not_null"];
      default:
        return ["eq", "neq", "is_null", "is_not_null"];
    }
  };

  const formatFilterValue = (filter: Filter): string => {
    if (!filter.values || filter.values.length === 0) {
      return "";
    }
    return filter.values.join(", ");
  };

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading filters...
      </div>
    );
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
              const dimension = availableDimensions.find(
                (d) => d.field === filter.field
              );
              return (
                <div
                  key={index}
                  className="flex items-center gap-2 rounded-md bg-muted p-2 text-sm"
                >
                  <div className="flex-1">
                    <span className="font-medium">
                      {dimension?.displayName || filter.field}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      {operatorLabels[filter.op]}{" "}
                    </span>
                    {filter.values && filter.values.length > 0 && (
                      <span className="font-medium">
                        {formatFilterValue(filter)}
                      </span>
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

      {/* Add Filter Button */}
      {!isAddingFilter && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsAddingFilter(true)}
          className="w-full"
          disabled={availableDimensions.length === 0}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Filter
        </Button>
      )}

      {/* Add Filter Form */}
      {isAddingFilter && (
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
                {availableDimensions.map((dim) => (
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
                      availableDimensions.find((d) => d.field === newFilterField)
                        ?.type || "string"
                    ).map((op) => (
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
                    {(newFilterOp === "in" ||
                      newFilterOp === "not_in" ||
                      newFilterOp === "between") && (
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        (comma-separated)
                      </span>
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
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleAddFilter();
                      }
                    }}
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
              disabled={
                !newFilterField ||
                (!newFilterValue &&
                  newFilterOp !== "is_null" &&
                  newFilterOp !== "is_not_null")
              }
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

      {/* Empty State */}
      {availableDimensions.length === 0 && (
        <p className="text-sm italic text-muted-foreground">
          No filterable dimensions available. Charts must use the semantic layer
          to enable filtering.
        </p>
      )}
    </div>
  );
}
```

---

## Acceptance Criteria

- ✅ Can add filters with all operator types
- ✅ Value input adapts to operator (hidden for is_null/is_not_null, comma-separated for in/not_in/between)
- ✅ Filters display correctly in active list with readable formatting
- ✅ Can remove individual filters or clear all
- ✅ Form validation prevents invalid filters (disabled Add button)
- ✅ Uses shadcn/ui components consistently
- ✅ Responsive design (works on mobile and desktop)
- ✅ Loading state while dimensions load
- ✅ Empty state when no dimensions available
- ✅ Keyboard support (Enter to add filter, Escape handled by parent Sheet)
- ✅ Type-specific operators (string, number, time, boolean)
- ✅ Number values parsed correctly
- ✅ Comma-separated values parsed correctly

---

## Testing

### Test Case 1: Add string filter (equals)

**Steps**:
1. Click "Add Filter"
2. Select field: "Country"
3. Select operator: "equals"
4. Enter value: "China"
5. Click "Add"

**Expected**:
- Filter appears in active list: "Country equals China"
- Form resets
- "Add Filter" button visible again

### Test Case 2: Add number filter (greater than)

**Steps**:
1. Add filter
2. Select field: "year" (type: number)
3. Select operator: "greater than"
4. Enter value: "2020"
5. Click "Add"

**Expected**:
- Value parsed as number (not string)
- Filter shows: "Year greater than 2020"

### Test Case 3: Add IN filter (multiple values)

**Steps**:
1. Add filter
2. Select field: "Country"
3. Select operator: "is one of"
4. Enter value: "China, USA, India"
5. Click "Add"

**Expected**:
- Values split by comma
- Filter shows: "Country is one of China, USA, India"
- Three separate values stored in filter.values array

### Test Case 4: Add BETWEEN filter

**Steps**:
1. Add filter
2. Select field: "year"
3. Select operator: "between"
4. Enter value: "2020, 2023"
5. Click "Add"

**Expected**:
- Two values extracted
- Parsed as numbers
- Filter shows: "Year between 2020, 2023"

### Test Case 5: Add IS NULL filter

**Steps**:
1. Add filter
2. Select field: any
3. Select operator: "is null"
4. Click "Add" (no value needed)

**Expected**:
- Value input hidden
- Add button enabled without entering value
- Filter shows: "Field is null"

### Test Case 6: Remove filter

**Setup**: Add 3 filters

**Steps**: Click X button on middle filter

**Expected**:
- That filter removed
- Other filters remain
- Order preserved

### Test Case 7: Clear all filters

**Setup**: Add multiple filters

**Steps**: Click "Clear All"

**Expected**:
- All filters removed
- Active filters section hidden
- "Add Filter" button still visible

### Test Case 8: Operator changes based on type

**Steps**:
1. Add filter
2. Select string field → operators include "contains", "starts with"
3. Switch to number field → operators include "greater than", "between"
4. Switch to boolean field → only "equals", "does not equal", "is null", "is not null"

**Expected**:
- Operator dropdown options change based on field type
- Current operator resets to "equals" when changing fields

### Test Case 9: Form validation

**Steps**:
1. Add filter
2. Don't select field → Add button disabled
3. Select field, select "equals", don't enter value → Add button disabled
4. Enter value → Add button enabled

**Expected**:
- Add button disabled when required fields missing
- Clear visual feedback

### Test Case 10: Empty state

**Setup**: Dashboard with no charts having semantic metadata

**Expected**:
- Helpful message displayed
- Explains why filtering is unavailable
- "Add Filter" button disabled

### Test Case 11: Keyboard shortcuts

**Steps**:
1. Open add filter form
2. Fill in fields
3. Press Enter in value input

**Expected**:
- Filter added (same as clicking Add button)

---

## Component Structure

```
DashboardFilterPane
├── Loading State (if isLoading)
├── Active Filters Section
│   ├── Header with "Clear All" button
│   └── List of filter chips (each with remove button)
├── Add Filter Button (if not adding)
├── Add Filter Form (if isAddingFilter)
│   ├── Field selector
│   ├── Operator selector
│   ├── Value input (conditional)
│   └── Add/Cancel buttons
└── Empty State (if no dimensions)
```

---

## Operator Logic by Type

```typescript
String:    eq, neq, in, not_in, contains, starts_with, is_null, is_not_null
Number:    eq, neq, gt, gte, lt, lte, between, in, not_in, is_null, is_not_null
Time:      eq, neq, gt, gte, lt, lte, between, is_null, is_not_null
Boolean:   eq, neq, is_null, is_not_null
```

---

## Notes

- This component is "dumb" - it only manages form state, not global filter state
- Global filter state managed by FilterContext (Task 5)
- The component uses the `useFilters()` hook to interact with context
- All UI components from shadcn/ui (Button, Input, Select)
- Responsive: stacks vertically on mobile, same layout on desktop
- Value parsing handles both strings and numbers correctly
