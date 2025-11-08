## todos
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