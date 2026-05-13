# SQL Runtime Backends

BI Chat can run SQL on three backends:

- `duckdb-wasm` (browser-local DuckDB)
- `bridge` (remote Pondview bridge endpoints)
- `duckdb-http` (remote DuckDB `httpserver`)

Backend selection is controlled by Settings and resolved by `resolveSqlBackend(...)`.

## Backend overview

| Backend       | Where execution happens   | Typical use                                                            |
| ------------- | ------------------------- | ---------------------------------------------------------------------- |
| `duckdb-wasm` | Browser                   | Local uploads, local exploration, no remote DB attachment.             |
| `bridge`      | Remote service (Pondview) | Remote/external data, extension attachment flows, bridge-managed auth. |
| `duckdb-http` | Remote DuckDB HTTP server | Remote DuckDB query execution from browser with host/port config.      |

Quack Remote DuckDB is modeled as a connected source rather than a fourth SQL runtime. The active remote runtime installs/loads DuckDB's `quack` extension and attaches the Quack server as a catalog. Bridge is preferred for Quack because it can keep the Quack token in the Bridge secret store.

## Selection rules

Backend resolution combines the saved user preference and runtime availability:

1. Settings always lets you save an explicit runtime preference, including `bridge`, even if the bridge health probe currently reports unavailable.
2. If preference is `bridge` but bridge is not query-ready, query execution falls back to `duckdb-wasm` until the bridge becomes available.
3. If preference is `duckdb-http` but HTTP config is missing, query execution falls back to `duckdb-wasm`.
4. If preference is `auto`, Pondview picks `bridge` when query-ready, otherwise `duckdb-wasm`.

The Settings page distinguishes the selected runtime preference from the active runtime. For example, you may see `Bridge` in the selector while the active runtime shows DuckDB WASM; after bridge health/config/auth become ready, the same saved preference resolves to Bridge automatically.

In `runQuery(...)`, `md:` identifiers are a special case: they route to `/api/duckdb/query` and return backend label `bridge`.

## Availability and health

### Bridge

- Availability for query execution: bridge health is `online`, bridge config is discoverable, and either auth is not required or a session secret exists.
- Health probe: `pingBridge()` against `/ping`
- Config probe: `refreshBridgeConfig()` against `/api/duckdb/config`
- Endpoint: defaults to the current app origin. When running only the Vite/frontend app against a separately started bridge, set the Bridge endpoint in Settings to the bridge URL, for example `http://127.0.0.1:17817`.
- Secret: session-only via Settings (`setSessionSecret(...)`)
- Server-side secrets: Bridge stores data-source, AI provider, and S3 backup credentials in `${XDG_CONFIG_HOME:-~/.config}/pondview/secrets.json`, or `PONDVIEW_SECRETS_PATH` when set. The directory is created with `0700` permissions and the file with `0600`.
- Secret-backed browser state stores opaque references such as `connectionId` and non-secret metadata only. Bridge status endpoints report whether secrets are configured but do not return secret values.

#### CLI autostart

Bridge-backed CLI commands share the same bridge runtime state as the local UI.
When no local bridge is running, these commands automatically start
`pondview bridge`, wait for it to become healthy, and retry the original
request:

```bash
pondview attach ./stations.duckdb --as stations
pondview list-sources
pondview detach stations
pondview query "SELECT 42 AS answer"
```

Autostart runs the API bridge only; it does not run `pondview serve` or open the
browser. Use `--no-autostart` to keep the old fail-fast behavior. Passing an
explicit `--url` also disables autostart, because Pondview should not guess how
to start a custom or remote endpoint.

To stop an auto-started local bridge, run:

```bash
pondview stop
```

For the full CLI command reference, including `pondview serve` for the bundled
local UI, see [Pondview CLI](/guide/cli).

### DuckDB over HTTP

- Availability for selection fallback: config exists (`host`, `port`)
- Health probe: `pingDuckDbHttp(...)`
- Auth: optional session auth stored in session storage

### DuckDB WASM

- Always available as local fallback
- Rejects remote identifiers via `assertWasmCompatibleDbIdentifier(...)`
- Does not provide a server-side secret boundary. Credentials required by browser-local execution must be browser-visible, so external source attachment remains a Bridge/HTTP-runtime workflow.

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

- Query unexpectedly ran in WASM: check selected backend availability and fallback conditions. A saved Bridge preference can still execute on WASM while Bridge is not query-ready.
- Bridge selected but unavailable in a frontend-only dev server: set the Bridge endpoint in Settings to the separately running bridge origin, then verify `/ping` and `/api/duckdb/config` are reachable from the browser.
- Bridge selected but offline: verify the endpoint, session secret, and bridge `/ping`.
- Remote identifier error in WASM: switch runtime to Bridge or DuckDB over HTTP.
