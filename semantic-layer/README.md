# Context and Join Configuration

The semantic model/editor stack has been removed.

This directory now contains lightweight configuration used by the app:

- `context/context.md`: business/domain context for AI SQL generation.
- `joins.yml`: global join graph used for cross-table filter injection.
- `models/sources.yml`: source-to-physical-table mapping and optional attachment metadata.

## joins.yml

```yaml
version: 1
joins:
  - left_table: orders
    left_column: customer_id
    right_table: customers
    right_column: id
    type: left
```

Supported keys:

- `left_table`, `left_column`
- `right_table`, `right_column`
- `type` (`left`, `inner`, `right`, `full`; defaults to `left`)

## sources.yml

```yaml
version: 1
sources:
  - name: orders
    table: main.orders
    connection:
      type: motherduck
      identifier: md:my_db
      alias: orders_source
      readOnly: true
      duckdbExtension: motherduck
```

`sources.yml` is updated via `/api/semantic-layer/sources` and consumed by `table-materializer.ts`.
