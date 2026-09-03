# caplytics-dashboard

The Next.js app for viewing and filtering spend events (§8). Root [CLAUDE.md](../../CLAUDE.md) covers everything not specific to this package.

## The rule that defines this package

**It never reimplements query logic.** Every read goes through `@caplytics/core/postgres` — the same `query()` the SDK's own consumers use. §8.1's guarantee is one query layer with two consumers, and it holds by construction rather than by review: if a filter cannot be expressed through `EventFilter`, the fix belongs in core, not in a route handler here.

`pg.Pool` satisfies core's `SqlExecutor` structurally, so the app hands the query layer the client it already has. There is no adapter between them to drift.

## Imports

Next's bundler does not resolve `.js` specifiers for `.ts` sources, so local imports here are **extensionless** — unlike the two library packages, which keep the extension for Node ESM. Do not "fix" one to match the other.

## Environment

Read and narrowed once in `lib/env.ts` (§9.2). A dashboard that boots with a missing secret and fails on first sign-in is worse than one that refuses to start: the failure reaches a user instead of whoever deployed it.

`ALLOWED_EMAIL_DOMAINS` is unset by default, which §8.6 accepts for a single-team tool — but unset means any Google account can sign in. The domain check lives in the `signIn` callback, not the UI: a check that only hides a button is not a check.

## Tests

Runner: `bun test`, colocated. Pure logic only — URL/filter mapping and cursor encoding. Components are not unit-tested here; the query layer they render is covered by core's integration tests against a real database.

## UI

shadcn components for anything shadcn provides. Skeleton loaders only — no spinners, anywhere. `useEffect` is for synchronising with an external system, not for fetching data or deriving state (§9.3).

`components/ui/` is vendored: `shadcn add` regenerates it, so it is excluded from linting and this package relaxes `exactOptionalPropertyTypes`. Do not hand-edit those files expecting the change to survive.

The table is deliberately not sortable — see [architecture/table-sorting-and-cursors.md](../../architecture/table-sorting-and-cursors.md). A keyset cursor is a position in one ordering, so a sortable column would page through an order the cursor does not describe.
