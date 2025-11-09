# Task 3: Filter Discovery API

**Goal**: Create endpoint to discover available filterable dimensions

**Dependencies**: Task 1 (types), Task 2 (charts have exploreName)

**Estimated Lines**: ~120 lines

---

## Files to Create

- `src/app/api/dashboard/[dashboardId]/dimensions/route.ts`

---

## Deliverables

### 1. Create dimensions discovery endpoint

Create `src/app/api/dashboard/[dashboardId]/dimensions/route.ts`:

```typescript
import type { NextRequest } from "next/server";
import { listChartsByDashboard } from "@/lib/repositories/dashboard";
import { loadModelsFromDirectory } from "@/semantic-layer/model-loader";
import type { AvailableDimension } from "@/lib/types/filters";
import { join } from "node:path";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> }
) {
  try {
    const { dashboardId } = await params;

    // Get all charts for this dashboard
    const charts = await listChartsByDashboard(dashboardId);

    // Extract unique explore names from charts with semantic metadata
    const exploreNames = new Set(
      charts
        .map((c) => c.exploreName)
        .filter((name): name is string => !!name)
    );

    // If no charts have semantic metadata, return empty arrays
    if (exploreNames.size === 0) {
      return Response.json({
        dimensions: [],
        conformGroups: {},
        message: "No charts with semantic layer metadata found. Charts must use the semantic layer to enable filtering.",
      });
    }

    // Load semantic layer models
    const modelsDir = join(process.cwd(), "semantic-layer", "models");
    let dataModel;

    try {
      dataModel = loadModelsFromDirectory(modelsDir);
    } catch (error) {
      console.error("[Dimensions API] Failed to load models:", error);
      return Response.json(
        {
          error: "Failed to load semantic layer models",
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 500 }
      );
    }

    // Build available dimensions list
    const availableDimensions: AvailableDimension[] = [];

    for (const exploreName of exploreNames) {
      const explore = dataModel.explores.find((e) => e.name === exploreName);

      if (!explore) {
        console.warn(`[Dimensions API] Explore "${exploreName}" not found in models`);
        continue;
      }

      // Add each dimension from this explore
      for (const dim of explore.dimensions) {
        availableDimensions.push({
          exploreName: explore.name,
          field: `${explore.name}.${dim.name}`,
          displayName: formatDisplayName(dim.name),
          type: dim.type,
          conformKey: dim.conformKey,
        });
      }
    }

    // Group dimensions by conform key for cross-chart filtering
    const conformGroups = new Map<string, AvailableDimension[]>();

    for (const dim of availableDimensions) {
      if (dim.conformKey) {
        const group = conformGroups.get(dim.conformKey) || [];
        group.push(dim);
        conformGroups.set(dim.conformKey, group);
      }
    }

    // Convert Map to object for JSON serialization
    const conformGroupsObj = Object.fromEntries(conformGroups);

    return Response.json({
      dimensions: availableDimensions,
      conformGroups: conformGroupsObj,
    });
  } catch (error) {
    console.error("[Dimensions API] Unexpected error:", error);
    return Response.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Format a field name into a human-readable display name
 * Examples:
 *   "Country" -> "Country"
 *   "total_revenue" -> "Total Revenue"
 *   "user_id" -> "User ID"
 */
function formatDisplayName(fieldName: string): string {
  return fieldName
    .replace(/_/g, " ") // Replace underscores with spaces
    .replace(/\b\w/g, (l) => l.toUpperCase()); // Capitalize first letter of each word
}
```

---

## Acceptance Criteria

- ✅ API returns valid dimension list for dashboards with semantic charts
- ✅ Dimensions include all required fields (exploreName, field, displayName, type)
- ✅ ConformGroups correctly group dimensions with same conformKey
- ✅ Returns 200 with empty array if no semantic charts exist
- ✅ Returns helpful message when no dimensions available
- ✅ Handles missing model files gracefully (500 error with details)
- ✅ Handles missing explores gracefully (logs warning, continues)
- ✅ Display names are properly formatted (spaces, capitalization)

---

## Testing

### Test Case 1: Dashboard with semantic charts

**Setup**: Create dashboard with chart that has `exploreName: "unicorns"`

**Request**:
```bash
curl http://localhost:3000/api/dashboard/{dashboardId}/dimensions
```

**Expected Response**:
```json
{
  "dimensions": [
    {
      "exploreName": "unicorns",
      "field": "unicorns.Country",
      "displayName": "Country",
      "type": "string"
    },
    {
      "exploreName": "unicorns",
      "field": "unicorns.year",
      "displayName": "Year",
      "type": "number"
    }
  ],
  "conformGroups": {}
}
```

### Test Case 2: Dashboard without semantic charts

**Setup**: Dashboard with only raw SQL charts (no exploreName)

**Expected Response**:
```json
{
  "dimensions": [],
  "conformGroups": {},
  "message": "No charts with semantic layer metadata found. Charts must use the semantic layer to enable filtering."
}
```

### Test Case 3: Cross-chart dimensions

**Setup**: Multiple charts with dimensions having the same conformKey

**Expected**:
- `conformGroups` object contains grouped dimensions
- Each group has array of dimensions with matching conformKey

### Test Case 4: Missing model files

**Setup**: Delete or rename model YAML files

**Expected**:
- 500 error response
- Error details in response body
- Console error logged

---

## Example Response Format

```json
{
  "dimensions": [
    {
      "exploreName": "orders",
      "field": "orders.region",
      "displayName": "Region",
      "type": "string",
      "conformKey": "region_id"
    },
    {
      "exploreName": "sales",
      "field": "sales.region",
      "displayName": "Region",
      "type": "string",
      "conformKey": "region_id"
    },
    {
      "exploreName": "orders",
      "field": "orders.order_date",
      "displayName": "Order Date",
      "type": "time"
    }
  ],
  "conformGroups": {
    "region_id": [
      {
        "exploreName": "orders",
        "field": "orders.region",
        "displayName": "Region",
        "type": "string",
        "conformKey": "region_id"
      },
      {
        "exploreName": "sales",
        "field": "sales.region",
        "displayName": "Region",
        "type": "string",
        "conformKey": "region_id"
      }
    ]
  }
}
```

---

## Notes

- The `conformGroups` enable cross-chart filtering - applying a filter to one dimension affects all dimensions with the same conformKey
- Display name formatting makes the UI more user-friendly
- Empty dimensions array is valid (not an error) when no semantic charts exist
- This API is called once when the filter pane opens, then cached in React context
