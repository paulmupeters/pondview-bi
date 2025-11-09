# Task 4: Filter-Aware Data Fetching API

**Goal**: Modify data fetching to apply filters to semantic queries

**Dependencies**: Task 1 (types), Task 2 (semantic metadata stored), Task 3 (dimensions discoverable)

**Estimated Lines**: ~150 lines

---

## Files to Modify

- `src/app/api/dashboard/[dashboardId]/data/route.ts`

---

## Deliverables

### 1. Replace existing GET handler

Replace the current implementation in `src/app/api/dashboard/[dashboardId]/data/route.ts`:

```typescript
import type { NextRequest } from "next/server";
import { listChartsByDashboard } from "@/lib/repositories/dashboard";
import { runSqlNormalized } from "@/lib/db/router";
import { loadModelsFromDirectory } from "@/semantic-layer/model-loader";
import { compileToDuckdb } from "@/semantic-layer/query-builder";
import type { QueryAST, Filter } from "@/semantic-layer/types";
import { join } from "node:path";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> }
) {
  const { dashboardId } = await params;
  const { searchParams } = new URL(req.url);

  // Parse filters from query params
  const filtersParam = searchParams.get("filters");
  let dashboardFilters: Filter[] = [];

  if (filtersParam) {
    try {
      dashboardFilters = JSON.parse(filtersParam);

      // Validate filters structure
      if (!Array.isArray(dashboardFilters)) {
        return Response.json(
          { error: "Filters must be an array" },
          { status: 400 }
        );
      }
    } catch (error) {
      console.error("[Dashboard Data] Failed to parse filters:", error);
      return Response.json(
        { error: "Invalid filters JSON" },
        { status: 400 }
      );
    }
  }

  // Load semantic layer models once (will be reused for all charts)
  const modelsDir = join(process.cwd(), "semantic-layer", "models");
  let dataModel;

  try {
    dataModel = loadModelsFromDirectory(modelsDir);
  } catch (error) {
    console.error("[Dashboard Data] Failed to load models:", error);
    // Continue without semantic layer - raw SQL charts will still work
    dataModel = null;
  }

  // Fetch all charts for this dashboard
  const charts = await listChartsByDashboard(dashboardId);

  // Execute each chart's query (with or without filters)
  const results = await Promise.all(
    charts.map(async (chart) => {
      try {
        let sqlToExecute = chart.sql;
        let filtersApplied = false;

        // If chart has semantic metadata and we have a data model, apply filters
        if (chart.semanticQueryJson && dataModel && dashboardFilters.length > 0) {
          try {
            // Parse the stored QueryAST
            const queryAST: QueryAST = JSON.parse(chart.semanticQueryJson);

            // Merge dashboard filters with chart's existing filters
            const mergedQuery: QueryAST = {
              ...queryAST,
              filters: [
                ...(queryAST.filters || []),
                ...dashboardFilters,
              ],
            };

            // Compile QueryAST to SQL with filters applied
            const compiled = compileToDuckdb(dataModel, mergedQuery);
            sqlToExecute = compiled.sql;
            filtersApplied = true;

            console.log(
              `[Dashboard Data] Applied ${dashboardFilters.length} filter(s) to chart ${chart.id} (${chart.exploreName})`
            );
          } catch (compileError) {
            // If query compilation fails, fall back to raw SQL
            console.error(
              `[Dashboard Data] Failed to compile query for chart ${chart.id}:`,
              compileError
            );
            console.log(`[Dashboard Data] Falling back to raw SQL for chart ${chart.id}`);
            sqlToExecute = chart.sql;
            filtersApplied = false;
          }
        }

        // Execute the SQL (either filtered or raw)
        const rows = await runSqlNormalized(
          chart.dbIdentifier || "md:my_db",
          sqlToExecute
        );

        return {
          ...chart,
          rows,
          filtersApplied,
        };
      } catch (executionError) {
        console.error(
          `[Dashboard Data] Error executing chart ${chart.id}:`,
          executionError
        );

        // Return chart with empty rows on error (don't break entire dashboard)
        return {
          ...chart,
          rows: [] as any[],
          filtersApplied: false,
          error: executionError instanceof Error
            ? executionError.message
            : String(executionError),
        };
      }
    })
  );

  return Response.json({ charts: results });
}
```

---

## Acceptance Criteria

- ✅ Charts with semantic metadata have filters applied when filters are provided
- ✅ Charts without semantic metadata execute raw SQL unchanged
- ✅ Multiple filters are combined correctly (AND logic)
- ✅ Response includes `filtersApplied: boolean` flag per chart
- ✅ Invalid filter JSON returns 400 error with helpful message
- ✅ Query compilation errors don't break entire dashboard (fallback to raw SQL)
- ✅ SQL execution errors don't break dashboard (return empty rows for that chart)
- ✅ Console logs show filter application for debugging
- ✅ Parallel chart execution is maintained (Promise.all)
- ✅ Works when no filters provided (backward compatible)

---

## Testing

### Test Case 1: No filters

**Request**:
```bash
curl "http://localhost:3000/api/dashboard/{dashboardId}/data"
```

**Expected**:
- All charts execute with their original SQL
- `filtersApplied: false` for all charts

### Test Case 2: Single filter

**Request**:
```bash
curl "http://localhost:3000/api/dashboard/{dashboardId}/data?filters=%5B%7B%22field%22%3A%22unicorns.Country%22%2C%22op%22%3A%22eq%22%2C%22values%22%3A%5B%22China%22%5D%7D%5D"
```

(URL decoded filters: `[{"field":"unicorns.Country","op":"eq","values":["China"]}]`)

**Expected**:
- Charts with `exploreName: "unicorns"` have filter applied
- `filtersApplied: true` for those charts
- Other charts execute without filters
- Console shows: "Applied 1 filter(s) to chart..."

### Test Case 3: Multiple filters

**Request**:
```bash
# filters = [
#   {"field":"unicorns.Country","op":"eq","values":["China"]},
#   {"field":"unicorns.year","op":"gt","values":[2020]}
# ]
```

**Expected**:
- Both filters applied with AND logic
- SQL WHERE clause contains both conditions
- Results filtered correctly

### Test Case 4: Invalid filter JSON

**Request**:
```bash
curl "http://localhost:3000/api/dashboard/{dashboardId}/data?filters=invalid"
```

**Expected**:
- 400 status code
- Response: `{"error": "Invalid filters JSON"}`

### Test Case 5: Chart without semantic metadata

**Setup**: Dashboard with chart that has `semanticQueryJson: null`

**Request**: With filters

**Expected**:
- Chart executes raw SQL (no filters)
- `filtersApplied: false`
- No errors

### Test Case 6: Query compilation error

**Setup**: Corrupt `semanticQueryJson` or missing model file

**Request**: With filters

**Expected**:
- Fallback to raw SQL
- `filtersApplied: false`
- Console error logged
- Chart still returns data

### Test Case 7: SQL execution error

**Setup**: Chart with invalid SQL or database connection issue

**Request**: With or without filters

**Expected**:
- Chart returns `rows: []` and `error: "message"`
- Other charts still execute successfully
- Dashboard doesn't break

---

## Filter Application Logic

```
FOR EACH CHART:
  IF has semanticQueryJson AND dataModel loaded AND filters provided:
    TRY:
      Parse QueryAST from semanticQueryJson
      Merge dashboard filters with chart filters
      Compile to SQL using query builder
      Execute compiled SQL
      Set filtersApplied = true
    CATCH compilation error:
      Log error
      Fall back to raw SQL
      Set filtersApplied = false
  ELSE:
    Execute raw SQL (chart.sql)
    Set filtersApplied = false
```

---

## Example Compiled SQL

**Original SQL** (stored in chart):
```sql
SELECT Country, COUNT(*) as count
FROM unicorns
GROUP BY Country
```

**With filter applied** (compiled):
```sql
SELECT
  "Country" AS "unicorns_Country",
  COUNT(*) AS "unicorns_count"
FROM "unicorns" AS t0
WHERE "Country" = $1
GROUP BY "Country"
LIMIT 5000
```

**Parameters**: `[$1 = "China"]`

---

## Notes

- The `compileToDuckdb()` function handles all SQL generation including WHERE clauses
- Filters are applied via parameterized queries (safe from SQL injection)
- The API maintains backward compatibility - works with or without filters
- Parallel execution (`Promise.all`) keeps performance fast even with many charts
- Error handling is defensive - one chart failure doesn't affect others
