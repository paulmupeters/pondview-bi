# Task 2: Enhanced Chart Creation API

**Goal**: Store semantic query metadata when charts are created

**Dependencies**: Task 1 (schema and types)

**Estimated Lines**: ~80 lines

---

## Files to Modify

- `src/app/api/dashboard/[dashboardId]/charts/route.ts`
- `src/lib/repositories/dashboard.ts` (addChartToDashboard function)

---

## Deliverables

### 1. Update POST handler in chart creation API

In `src/app/api/dashboard/[dashboardId]/charts/route.ts`:

After the existing call to `updateModelFromSQL()`, extract metadata and build QueryAST:

```typescript
import type { QueryAST } from "@/semantic-layer/types";

// ... existing code ...

// After: updateModelFromSQL(body.sql, modelsDir)
try {
  const metadata = extractSemanticLayerFromSQL(body.sql);

  // Build QueryAST from extracted metadata
  const queryAST: QueryAST = {
    explore: metadata.exploreName,
    fields: [
      ...metadata.dimensions.map(d => `${metadata.exploreName}.${d.name}`),
      ...metadata.measures.map(m => `${metadata.exploreName}.${m.name}`)
    ],
    filters: [], // Initially empty - filters added at dashboard level
    orderBy: [], // Could be extracted from SQL if needed in future
    limit: undefined, // Could be extracted from SQL if needed in future
  };

  const semanticQueryJson = JSON.stringify(queryAST);
  const exploreName = metadata.exploreName;

  // Pass to addChartToDashboard
  const { id } = await addChartToDashboard({
    dashboardId: params.dashboardId,
    title: body.title ?? null,
    description: body.description ?? null,
    sql: body.sql,
    dbIdentifier: body.dbIdentifier ?? null,
    chartConfigJson: body.chartConfigJson,
    semanticQueryJson,
    exploreName,
    now,
  });

  console.log(`[Semantic Layer] Stored semantic query for chart ${id}, explore: ${exploreName}`);

} catch (error) {
  // If semantic extraction fails, still create the chart without semantic metadata
  console.error("[Semantic Layer] Failed to extract semantic metadata:", error);

  const { id } = await addChartToDashboard({
    dashboardId: params.dashboardId,
    title: body.title ?? null,
    description: body.description ?? null,
    sql: body.sql,
    dbIdentifier: body.dbIdentifier ?? null,
    chartConfigJson: body.chartConfigJson,
    semanticQueryJson: null,
    exploreName: null,
    now,
  });
}
```

### 2. Update `addChartToDashboard` function

In `src/lib/repositories/dashboard.ts`:

```typescript
export async function addChartToDashboard(input: {
  dashboardId: string;
  title?: string | null;
  description?: string | null;
  sql: string;
  dbIdentifier?: string | null;
  chartConfigJson: string;
  semanticQueryJson?: string | null;  // NEW
  exploreName?: string | null;        // NEW
  now?: number;
}) {
  const db = getDb();
  const now = input.now ?? Date.now();
  const id = nanoid();

  const [{ value: maxPosition } = { value: -1 }] = await db
    .select({ value: sql<number>`coalesce(max(${dashboardCharts.position}), -1)` })
    .from(dashboardCharts)
    .where(eq(dashboardCharts.dashboardId, input.dashboardId));

  const position = (maxPosition ?? -1) + 1;

  await db.insert(dashboardCharts).values({
    id,
    dashboardId: input.dashboardId,
    title: input.title ?? null,
    description: input.description ?? null,
    sql: input.sql,
    dbIdentifier: input.dbIdentifier ?? null,
    chartConfigJson: input.chartConfigJson,
    semanticQueryJson: input.semanticQueryJson ?? null,  // NEW
    exploreName: input.exploreName ?? null,              // NEW
    position,
    createdAt: now,
    updatedAt: now,
  });

  await db
    .update(dashboards)
    .set({ updatedAt: now })
    .where(eq(dashboards.id, input.dashboardId));

  return { id };
}
```

---

## Acceptance Criteria

- ✅ New charts store semantic metadata alongside SQL
- ✅ Existing chart creation still works (optional fields)
- ✅ Console logs show successful semantic query storage
- ✅ If semantic extraction fails, chart is still created (graceful fallback)
- ✅ No breaking changes to existing functionality
- ✅ QueryAST is valid JSON when stored

---

## Testing

### Manual Test

1. Create a new chart via the UI with SQL:
   ```sql
   SELECT Country, COUNT(*) as count FROM unicorns GROUP BY Country
   ```

2. Check console logs - should see:
   ```
   [Semantic Layer] Stored semantic query for chart <id>, explore: unicorns
   ```

3. Query the database:
   ```sql
   SELECT id, exploreName, semanticQueryJson FROM dashboard_charts ORDER BY createdAt DESC LIMIT 1;
   ```

4. Verify:
   - `exploreName` = "unicorns"
   - `semanticQueryJson` contains valid JSON with explore, fields, filters

### Error Handling Test

1. Create chart with invalid SQL (should still create chart, but without semantic metadata)
2. Verify chart is created and console shows error message

---

## Notes

- The QueryAST structure follows the semantic layer types in `semantic-layer/types.ts`
- We store the full QueryAST (not just metadata) for flexibility in future enhancements
- Charts created before this task will have `null` for semantic fields - that's expected
