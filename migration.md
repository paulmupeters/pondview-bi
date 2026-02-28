# Next.js -> Vite Migration Plan

## Goal

Migrate the UI from Next.js static export to a Vite-based React SPA while keeping the current extension-server architecture:

- Static UI files served by the extension HTTP server
- All backend behavior behind extension `/api/*` endpoints
- Sidecar-file persistence in extension runtime
- No regression in chat, dashboards, uploads, DuckDB workflows

## Current Baseline

- Next app already exports static files to `out/`
- Extension server serves static files and proxies/handles `/api/*`
- UI routes currently include:
  - `/`
  - `/chat?id=...`
  - `/dashboards`
  - `/dashboards/view?id=...`
  - `/data`
  - `/settings`
  - `/shell`
- Frontend already has a shared API boundary (`src/lib/api/client.ts`)

## Migration Strategy

Use a **parallel-run migration** (low risk):

1. Add Vite app alongside existing Next app
2. Port routes/components incrementally
3. Validate parity route-by-route
4. Switch extension server static root from `out/` to Vite `dist/`
5. Remove Next once parity is complete

Do **not** rewrite backend APIs during this migration.

---

## Phase 0 - Preparation

- Freeze UI feature work during migration window (except urgent fixes)
- Create migration branch
- Capture baseline behavior:
  - screenshots and flows for key pages
  - API contract checks for critical endpoints
- Add acceptance checklist (see bottom) and mark baseline status

## Phase 1 - Scaffold Vite App (Parallel)

- Add Vite + React + TypeScript setup (new app entrypoint in same repo)
- Add scripts:
  - `dev:vite`
  - `build:vite`
  - `preview:vite`
- Configure build output to `dist/` (or `out/` if you want zero server change)
- Keep existing Next build untouched until final cutover

Deliverable: blank Vite app builds and serves static assets.

## Phase 2 - Runtime Foundations

- Add `react-router-dom` and define routes matching current UX paths
- Introduce SPA fallback handling in extension server for Vite routes
- Replace Next-only primitives:
  - `next/link` -> router links
  - `next/navigation` -> router hooks
  - `next/font` -> CSS/fontsource/self-hosted fonts
  - `next/image` -> standard image handling
- Preserve API usage through existing `apiFetch`/`apiFetchJson`

Deliverable: app shell + navigation parity, no broken deep links.

## Phase 3 - Page and Feature Porting

Port in this order:

1. `/` (landing/new chat entry)
2. `/chat` (thread UI, message flows, streaming behavior)
3. `/dashboards` and `/dashboards/view`
4. `/data`
5. `/settings`
6. `/shell`

For each page:

- Port route component
- Reuse existing shared business logic/hooks where possible
- Validate API calls and state behavior
- Compare against baseline screenshots/flows

Deliverable: all user-visible pages running in Vite with parity.

## Phase 4 - Remove Next Coupling

- Stop importing any Next-specific modules
- Move remaining app-level concerns to Vite/React equivalents
- Ensure no dependency on Next build/runtime conventions
- Update path aliases and TS config for new app layout

Deliverable: frontend compiles without Next APIs.

## Phase 5 - Extension Server Cutover

- Point extension static serving root to Vite output (`dist/` or chosen dir)
- Keep `/api/*` contract unchanged
- Keep legacy URL rewrites that still matter
- Validate SPA fallback + static asset MIME handling

Deliverable: extension server serves Vite build in dev/prod smoke tests.

## Phase 6 - Verification and Hardening

- Automated checks:
  - typecheck
  - lint
  - production build
- Runtime smoke checks against extension server:
  - chat create/load/update/delete
  - dashboard create/edit/reorder/delete
  - DuckDB query + table discovery
  - semantic-layer source actions
  - upload/download flows
- Basic perf comparison (bundle size + first load)

Deliverable: parity checklist fully green.

## Phase 7 - Final Cleanup

- Remove Next app/router files and scripts
- Remove unused Next dependencies
- Update docs and onboarding commands
- Tag release and keep rollback instructions

Deliverable: Vite-only frontend with documented operations.

---

## Work Breakdown Checklist

- [x] Vite scaffold merged
- [x] Routing foundation merged
- [x] Page parity: `/`
- [x] Page parity: `/chat`
- [x] Page parity: `/dashboards`
- [x] Page parity: `/dashboards/view`
- [x] Page parity: `/data`
- [x] Page parity: `/settings`
- [x] Page parity: `/shell`
- [x] Extension static-root cutover
- [x] Full parity smoke tests passed
- [x] Next removed from runtime surface

## Acceptance Criteria

- All listed routes work via extension server
- No Next.js runtime dependency for production UI
- `/api/*` contract remains backward compatible
- Sidecar persistence behavior unchanged
- Static build artifacts are produced and served successfully

## Risks and Mitigations

- **Routing regressions** -> keep route-by-route parity tests + legacy redirects
- **Styling drift** -> baseline screenshots + targeted visual checks
- **Streaming/chat behavior changes** -> verify incremental message flow with real API calls
- **Bundle/perf regression** -> compare build output and initial load metrics before cutover

## Suggested Timeline

- Phase 0-2: 1-2 days
- Phase 3: 3-5 days (depends on dashboard complexity)
- Phase 4-6: 1-2 days
- Phase 7: <1 day

Total: ~1-2 weeks with validation buffer.
