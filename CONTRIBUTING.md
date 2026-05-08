# Contributing to Pondview

Thanks for helping improve Pondview.

## Before you start

Please open an issue or discussion for larger changes so we can align on scope first.

## Setup

1. Install dependencies with `bun install`.
2. Start the app with `bun dev`.
3. Run checks with `bun run lint`, `bun run typecheck`, and `bun run test` before opening a pull request.

## Repository layout

Pondview is a Bun workspace monorepo. The current web app intentionally still
lives at the repository root in `src/`, while shared/runtime packages live under
`packages/*`.

- Keep browser app code in `src/` unless there is a specific reason to extract it.
- Keep bridge-only implementation in `packages/bridge`.
- Keep shared bridge request/response contracts in `packages/bridge-protocol`.
- Move code into a package when it has multiple real consumers.
- Do not move the web app to `apps/web` until the package boundaries are stable enough to justify the churn.

## Workflow

1. Create a branch for your change.
2. Keep commits focused and easy to review.
3. Update docs when your change affects behavior or setup.
4. Open a pull request with a short summary and any relevant screenshots or reproduction steps.

## Review

We may ask for changes, clarification, or additional tests before merging. Please keep follow-up commits scoped to the requested fix.
