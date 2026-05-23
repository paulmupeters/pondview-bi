# SQL Runtime Backends

Pondview runs SQL on two backends:

- `duckdb-wasm` for browser-local DuckDB execution
- `bridge` for Pondview Bridge execution

Backend selection is controlled by Settings and resolved by `resolveSqlBackend(...)`.

## Backend overview

| Backend       | Where execution happens | Typical use                                                            |
| ------------- | ----------------------- | ---------------------------------------------------------------------- |
| `duckdb-wasm` | Browser                 | Local uploads, local exploration, HTTPS remote DuckDB file attachment. |
| `bridge`      | Pondview Bridge         | Remote/external data, extension attachment flows, bridge-managed auth. |

Remote DuckDB sources are attached data sources, not separate query runtimes.
The Connect Data dialog exposes one **Remote DuckDB** option with two attach
modes:

- HTTPFS file attachment for HTTPS/S3-compatible DuckDB files
- Quack endpoint attachment for DuckDB servers exposed through Quack

## Selection rules

Runtime resolution combines the saved user preference and runtime availability:

1. Settings lets you save `duckdb-wasm` or `bridge`.
2. If preference is `bridge` but Bridge is not query-ready, query execution falls
   back to `duckdb-wasm` until Bridge becomes available.
3. If preference is `auto`, Pondview picks `bridge` when query-ready, otherwise
   `duckdb-wasm`.

The Settings page distinguishes the selected runtime preference from the active
runtime. For example, you may see `Bridge` in the selector while the active
runtime shows DuckDB WASM; after bridge health/config/auth become ready, the
same saved preference resolves to Bridge automatically.

## Bridge

- Availability for query execution: bridge health is `online`, bridge config is
  discoverable, and either auth is not required or a session secret exists.
- Health probe: `pingBridge()` against `/ping`
- Config probe: `refreshBridgeConfig()` against `/api/duckdb/config`
- Endpoint: defaults to the current app origin. When running only the
  Vite/frontend app against a separately started bridge, set the Bridge endpoint
  in Settings to the bridge URL, for example `http://127.0.0.1:17817`.
- Secret: session-only via Settings (`setSessionSecret(...)`)
- Server-side secrets: Bridge stores data-source, AI provider, and S3 backup
  credentials in `${XDG_CONFIG_HOME:-~/.config}/pondview/secrets.json`, or
  `PONDVIEW_SECRETS_PATH` when set.

## DuckDB WASM

- Always available as local fallback
- Rejects remote identifiers via `assertWasmCompatibleDbIdentifier(...)`
- Can attach browser-compatible HTTPS remote DuckDB files
- Does not provide a server-side secret boundary

## Runtime fingerprints

`resolveSqlRuntimeFingerprint(...)` gives a backend-specific fingerprint used by
runtime-sensitive cache logic:

- WASM: `duckdb-wasm:local`
- Bridge: `bridge:<host>:<port>` (or `bridge:unknown`)

When runtime changes, cache keys tied to this fingerprint should be treated as
different execution contexts.

## Troubleshooting checklist

- Query unexpectedly ran in WASM: check selected backend availability and
  fallback conditions. A saved Bridge preference can still execute on WASM while
  Bridge is not query-ready.
- Bridge selected but unavailable in a frontend-only dev server: set the Bridge
  endpoint in Settings to the separately running bridge origin, then verify
  `/ping` and `/api/duckdb/config` are reachable from the browser.
- Bridge selected but offline: verify the endpoint, session secret, and bridge
  `/ping`.
- Remote identifier error in WASM: switch runtime to Bridge.
