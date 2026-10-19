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

## Auth is checked twice, on purpose

`middleware.ts` only redirects when a session cookie is absent, and imports nothing from `auth.ts`. It is a UX guard: a cookie's presence proves nothing, and middleware-only auth is a known bypass class in Next.js. The authoritative check is `auth()` inside the page, which verifies the session.

Keeping next-auth out of the middleware also keeps its config out of the edge bundle, where `process.env` is a limited proxy rather than the real object. For the same reason `lib/env.ts` reads each key explicitly instead of parsing `process.env` wholesale — Next inlines only statically-referenced keys, and parsing the object yields undefined for everything.

## UI

beUI (`@beui/*` in `components.json`) for the components listed in [architecture/dashboard-overview-layout.md](../../architecture/dashboard-overview-layout.md); shadcn for the rest. Skeleton loaders only — no spinners, anywhere. `useEffect` is for synchronising with an external system, not for fetching data or deriving state (§9.3).

`components/ui/`, `components/motion/`, `components/charts/` and beUI's helpers in `lib/` (`hooks/`, `ease.ts`, `presence-gate.tsx`, `touch.ts`) are vendored: `shadcn add` regenerates them, so they are excluded from linting and this package relaxes `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. Do not hand-edit those files expecting the change to survive.

The table is deliberately not sortable — see [architecture/table-sorting-and-cursors.md](../../architecture/table-sorting-and-cursors.md). A keyset cursor is a position in one ordering, so a sortable column would page through an order the cursor does not describe.
