## Semantic Layer Materialization (DuckDB Node API)

This document explains how explores defined in `semantic-layer/models` are materialized into DuckDB tables using the in-process DuckDB Node API, and how those tables are used by the app.

### Concepts & Files

- **Models directory**: `semantic-layer/models`
  - `*.yml` / `*.yaml` explore files (e.g. `unicorns.yml`) describe explores, dimensions, and measures.
  - `sources.yml` maps **source names** to physical tables and connection metadata (e.g. `main.unicorns` with DuckDB attachment config).
- **Runtime types**: `semantic-layer/types.ts`
  - `ExploreDef`, `DimensionDef`, `MeasureDef`, `DataModel`, etc.
- **Materializer**: `src/lib/materialization/semantic-layer.ts`
  - Exposes `materializeSemanticLayer`, `listMaterializations`, and `applyMaterializationsToDataModel`.
- **DuckDB Node runtime**: `src/lib/duckdb/duckdb-node.ts`
  - `getDuckDbInstance`, `runSqlAndGetRowObjectsJson`, `getMaterializationDbPath`.

### Runtime storage configuration

Materialization uses DuckDB in-process (no external HTTP server required).

- `DUCKDB_PERSIST_PATH` (optional): path to a DuckDB file for persistence across process restarts.
  - Example: `DUCKDB_PERSIST_PATH=./data/materialized.duckdb`
- If unset, materialization runs against an in-memory DuckDB instance.

MotherDuck credentials for attachments are read from process environment (`MOTHERDUCK_TOKEN`) by DuckDB in-process.

### What materialization does

The main entry point is:

```ts
import { materializeSemanticLayer } from "@/lib/materialization/semantic-layer";

await materializeSemanticLayer({
  // optional overrides:
  // modelsDir?: string;
  // exploreName?: string;
  // targetSchema?: string;
});
```

Key behavior in `src/lib/materialization/semantic-layer.ts`:

- **Model & sources loading**
  - `loadModelsFromDirectory(modelsDir)` loads explores from YAML files in `semantic-layer/models`.
  - `loadSources(modelsDir)` reads `sources.yml` and returns `SourceEntry[]` with `name`, `table`, and `connection` metadata.
- **Target schema**
  - By default, materialized tables are written into schema: `semantic_materialized`.
  - For explore `unicorns`, the target logical table is `semantic_materialized.unicorns`.
- **Tracking table**
  - A tracking table is created (if needed) in `main.semantic_materialization_runs`:

    ```sql
    CREATE TABLE IF NOT EXISTS main.semantic_materialization_runs (
      explore_name TEXT PRIMARY KEY,
      model_hash   TEXT NOT NULL,
      target_table TEXT NOT NULL,
      row_count    BIGINT,
      updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    ```

  - Each materialization run updates this table with the explore name, hash, target table, row count and timestamp.

- **Change detection using hashes**
  - For each explore, `readModelContent` loads the YAML file.
  - `computeModelHash` hashes:
    - The raw YAML content, and
    - The corresponding `SourceEntry` from `sources.yml`.
  - The materializer looks up the existing hash for the explore in `semantic_materialization_runs`.
  - If the hash is unchanged, the explore is **skipped** (no rebuild).

- **Building the target table**
  - `buildTargetTable(exploreName, targetSchema)`:
    - Sanitizes the explore name into a valid identifier.
    - Builds:
      - `display`: `<schema>.<sanitizedName>` (e.g. `semantic_materialized.unicorns`)
      - `qualified`: `"semantic_materialized"."unicorns"` (quoted)
  - This is the table that will be created/overwritten.

- **Source attachment (from `sources.yml`)**
  - Each `SourceEntry` in `sources.yml` has:
    - `name` – logical source name (e.g. `unicorns`)
    - `table` – physical table path (e.g. `main.unicorns`)
    - `connection` – optional `SourceConnectionConfig` (type, identifier, alias, readOnly, DuckDB extension)
  - `buildAttachmentPlan(source.connection)` turns this into:
    - A set of `ATTACH`/`LOAD` statements as needed.
    - An `alias` used to qualify the source tables.
  - `buildSourceReference`:
    - Splits `source.table` into parts (schema, table).
    - Applies quoting and, if an attachment alias is present, prefixes with the alias.
    - This ensures the `SELECT` reads from the correct attached database/schema.

- **Executed SQL statements**

For each explore, the materializer builds and runs a sequence of statements on a single in-process DuckDB connection:

1. Ensure target schema exists:

   ```sql
   CREATE SCHEMA IF NOT EXISTS "semantic_materialized";
   ```

2. Optionally detach and re-attach sources based on `SourceEntry.connection` (if present):
   - A defensive `DETACH IF EXISTS` for the alias.
   - The necessary `LOAD`/`ATTACH` statements from `buildAttachmentPlan`.
3. **Core materialization query**:

   ```sql
   CREATE OR REPLACE TABLE "semantic_materialized"."<explore>"
   AS SELECT * FROM <sourceReference>;
   ```

   - For `main.unicorns` defined in `sources.yml`, `sourceReference` typically resolves to something like:
     - `"main"."unicorns"` or
     - `"alias"."main"."unicorns"` (if attached with an alias).

4. **Tracking table update**:

   ```sql
   INSERT OR REPLACE INTO main.semantic_materialization_runs (
     explore_name,
     model_hash,
     target_table,
     row_count,
     updated_at
   )
   SELECT
     '<exploreName>',
     '<modelHash>',
     '<schema>.<table>',
     COUNT(*),
     CURRENT_TIMESTAMP
   FROM "semantic_materialized"."<explore>";
   ```

5. **Cleanup**:
   - If an attachment was created, the materializer runs a `DETACH` statement in a `finally` block to clean up.

All statements are run sequentially via `executeStatements` on the same connection, so attachment state is preserved naturally.

### Example: materializing `main.unicorns`

Given:

```yaml
# semantic-layer/models/sources.yml
version: 1
sources:
  - name: unicorns
    table: main.unicorns
```

and an explore:

```yaml
# semantic-layer/models/unicorns.yml
version: 1
explore: unicorns
base: unicorns
# dimensions, measures...
```

When `materializeSemanticLayer({ exploreName: "unicorns" })` runs:

- It finds the `unicorns` explore whose `base` is the `unicorns` source.
- It locates the corresponding `SourceEntry` in `sources.yml` (`table: main.unicorns`).
- It materializes to `semantic_materialized.unicorns` in the materialization DuckDB runtime.
- The run is recorded in `main.semantic_materialization_runs` with `target_table = 'semantic_materialized.unicorns'`.

### When materialization is triggered

Several semantic-layer API routes trigger materialization automatically when models change:

- `src/app/api/semantic-layer/models/[exploreName]/dimensions/route.ts`
- `src/app/api/semantic-layer/models/[exploreName]/measures/route.ts`
- `src/app/api/semantic-layer/models/[exploreName]/joins/route.ts`
- `src/app/api/semantic-layer/models/[exploreName]/segments/route.ts`

Dashboard read routes also trigger targeted materialization-on-read:

- `src/app/api/dashboard/[dashboardId]/data/route.ts`
- `src/app/api/dashboard/[dashboardId]/dimension-values/route.ts`

These routes call `loadMaterializedModel({ exploreNames })`, which invokes `materializeSemanticLayer` for only the explores needed by the request.

Example (dimensions route, simplified):

```ts
const materialization =
  result.added || result.created
    ? await materializeSemanticLayer({ modelsDir, exploreName })
    : [];
```

So adding/removing a dimension, measure, join, or segment will:

1. Update the YAML file on disk.
2. Re-run `materializeSemanticLayer` for that explore.
3. Refresh the corresponding materialized table in DuckDB runtime.

### How dashboards and queries use materialized tables

The materializer exposes helpers to wire materialization into the query layer:

- `listMaterializations()`:
  - Queries `main.semantic_materialization_runs` in the same materialization runtime.
  - Returns an array of `MaterializationRecord` objects with `exploreName`, `targetTable`, `modelHash`, `rowCount`, and `updatedAt`.

- `applyMaterializationsToDataModel(dataModel, records)`:
  - Builds a map from `exploreName` to `targetTable`.
  - Rewrites each `ExploreDef.base` to point to the materialized table if a record exists.
  - Returns a new `DataModel` that the query compiler (`semantic-layer/query-builder.ts`) can use.

Dashboard APIs (e.g. `src/app/api/dashboard/...`) typically:

1. Load the data model from `semantic-layer/models`.
2. Trigger targeted materialization via `loadMaterializedModel({ exploreNames })`.
3. Call `applyMaterializationsToDataModel()` to rewrite explores.
4. Compile semantic queries against the **materialized** tables instead of the raw sources.
5. If semantic compile or semantic execution fails, fallback to stored chart SQL so dashboards remain available.

### Running materialization manually

You can also trigger materialization from any server-side code (e.g. a cron-style job, admin API, or script):

```ts
import { materializeSemanticLayer } from "@/lib/materialization/semantic-layer";

await materializeSemanticLayer({
  // optional:
  // exploreName: "unicorns",       // only this explore
  // targetSchema: "semantic_materialized",
  // modelsDir: join(process.cwd(), "semantic-layer", "models"),
});
```

- **All explores**: omit `exploreName`.
- **Single explore**: set `exploreName` to the explore name.
- **Override schema**: set `targetSchema` to change where tables are written (e.g. `main`).

### Summary

- Explores and sources are defined in YAML under `semantic-layer/models`.
- `materializeSemanticLayer` reads those definitions and creates/refreshes materialized tables (by default `semantic_materialized.<explore>`) using in-process DuckDB.
- Materialization is tracked in `main.semantic_materialization_runs` and automatically integrated into the query layer via `applyMaterializationsToDataModel`.
- The unicorns explore (`base: unicorns` → `main.unicorns`) is materialized to `semantic_materialized.unicorns` when the model changes or when materialization is invoked manually.
- `DUCKDB_PERSIST_PATH` is optional and enables file-backed persistence; without it, materialized state is in-memory.
- DuckDB HTTP remains optional for other query paths, but it is not required for materialization.


