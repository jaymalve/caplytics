# @caplytics/core

Shared between the SDK and the dashboard: event schema, cost model, budget ledger, query layer. Root [CLAUDE.md](../../CLAUDE.md) covers everything not specific to this package.

## The rule that defines this package

**The root entry stays pure.** No database driver, no network client, and no framework may be reachable from `src/index.ts`. Persistence lives behind `src/postgres/` and ships as the `@caplytics/core/postgres` subpath export — see [architecture/core-subpath-exports.md](../../architecture/core-subpath-exports.md).

`caplytics` imports the root entry for enforcement and must not gain a Postgres dependency by doing so. A boundary test fails the build if the pure entry's import graph reaches a driver; when you add persistence code, put it behind the subpath rather than relaxing that test.

Everything in the root entry is pure and synchronous where it can be: given the same inputs it returns the same outputs, with no I/O. That is what makes the cost model and ledger testable without a database and reusable by the v2 framework adapters.

## Money

Costs are stored as **integer micro-dollars** (1 USD = 1_000_000). Floating-point dollars accumulate error across thousands of events and make equality assertions flaky. Convert to a decimal only at display boundaries.

## Tests

Runner: `bun test`. Colocated as `src/thing.test.ts`.

Every exported function in this package needs unit tests — it holds the pure logic, so there is no excuse for an untested branch here. Cost calculation and the budget ledger additionally need table-driven cases covering the boundaries: zero cost, unknown price, exactly-at-cap, and concurrent reservations.
