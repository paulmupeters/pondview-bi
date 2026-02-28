# todos
- semantic model
    - yaml structure
    - charts bind to dataset not table.column
    - Filters are defined at the dataset level and translate to SQL WHEREs/joins once
    - query builder that takes (dataset, chart spec, filters) → SQL
    - Re-run queries on filter changes; don’t filter post-aggregated chart rows
- DuckDB‑Wasm’s role
    - Keep it as a client cache/accelerator, not the source of truth.
    - Prefer caching per‑dataset, not per‑chart, at the correct grain (e.g., fact + key dimensions), and only needed columns.
    - Store columnar (Parquet) in OPFS when volumes grow; hydrate tables as needed. Evict by LRU/size.
    - For simple filters that do not change aggregation semantics, you can do instant local filtering; otherwise requery.
- Cross‑visual filtering
    - Filters are applied once at the dataset and fan out to all bound charts.
    - If a dashboard has multiple datasets, use the relationship graph to determine where a filter applies or requires bridging; otherwise, disable ambiguous filters.


- handling multiple charts, when second chart is generated in same chat it keeps old title, description etc in the chart config. also only the last chart is available when we reopen a chat, so we might need to store all chartconfigs as well
- imporve prompt: sometimes it doesnt generate a chart/card


## Semantic Materialization Reliability

- [ ] Decide production policy for semantic charts: strict semantic mode (fail if materialization fails) vs fallback mode.
- [ ] If fallback mode is kept, add per-chart execution mode visibility (`materialized` vs `raw_fallback`) and alert on fallback usage.

## Context + Joins Migration Notes

- [x] Remove semantic model editor UI and model-edit API routes.
- [x] Add global `semantic-layer/joins.yml` and join path resolver utilities.
- [x] Replace explore materialization with table-based materialization into `mat.*`.
- [x] Implement CTE-based dashboard filter injection over materialized tables.
- [x] Keep `sources.yml` as the source mapping and attachment metadata file.
- [ ] Add rollout metric for charts that still execute fallback raw SQL.
