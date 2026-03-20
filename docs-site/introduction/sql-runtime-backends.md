# SQL Runtime Backends

BI Chat can run SQL on three backends:

- `duckdb-wasm` (browser-local DuckDB)
- `bridge` (remote Pondview bridge endpoints)
- `duckdb-http` (remote DuckDB `httpserver`)

Backend selection is controlled by Settings and resolved by `resolveSqlBackend(...)`.

## Backend overview

| Backend | Where execution happens | Typical use |
| --- | --- | --- |
| `duckdb-wasm` | Browser | Local uploads, local exploration, no remote DB attachment. |
| `bridge` | Remote service (Pondview) | Remote/external data, extension attachment flows, bridge-managed auth. |
| `duckdb-http` | Remote DuckDB HTTP server | Remote DuckDB query execution from browser with host/port config. |

## Selection rules

Backend resolution combines user preference and runtime availability:

1. If `dbIdentifier` is explicitly local (`wasm:local` or empty), force `duckdb-wasm`.
2. If preference is `bridge` but bridge is unavailable, fallback to `duckdb-wasm`.
3. If preference is `duckdb-http` but HTTP config is missing, fallback to `duckdb-wasm`.
4. If preference is `auto`, pick `bridge` when available, otherwise `duckdb-wasm`.

In `runQuery(...)`, `md:` identifiers are a special case: they route to `/api/duckdb/query` and return backend label `bridge`.

## Availability and health

### Bridge

- Availability: session secret exists and bridge health is `online`
- Health probe: `pingBridge()` against `/ping`
- Secret: session-only via Settings (`setSessionSecret(...)`)

### DuckDB over HTTP

- Availability for selection fallback: config exists (`host`, `port`)
- Health probe: `pingDuckDbHttp(...)`
- Auth: optional session auth stored in session storage

### DuckDB WASM

- Always available as local fallback
- Rejects remote identifiers via `assertWasmCompatibleDbIdentifier(...)`

## Backend preference storage

Query runtime preference is stored in local storage key:

- `bi.sql.backend.preference`

Runtime config/state also uses browser storage and events for reactive UI updates.

## Runtime fingerprints and caches

`resolveSqlRuntimeFingerprint(...)` gives a backend-specific fingerprint used by runtime-sensitive cache logic:

- WASM: `duckdb-wasm:local`
- HTTP: `duckdb-http:<host>:<port>` (or `duckdb-http:unknown`)
- Bridge: `bridge:<host>:<port>` (or `bridge:unknown`)

When runtime changes, cache keys tied to this fingerprint should be treated as different execution contexts.

## Troubleshooting checklist

- Query unexpectedly ran in WASM: check selected backend availability and fallback conditions.
- Bridge selected but offline: verify session secret and bridge `/ping`.
- HTTP selected but unavailable: verify host/port config and auth, then test connection.
- Remote identifier error in WASM: switch runtime to Bridge or DuckDB over HTTP.
