# @caplytics/core splits its Postgres client behind a subpath export

**Implements:** §8.1
**Status:** Accepted — refines §8.1

## Decision

`@caplytics/core` publishes two entrypoints:

| Entrypoint | Contains | Imported by |
|---|---|---|
| `@caplytics/core` | Event schema, cost model, budget ledger, `query()` argument and result types | `caplytics`, `caplytics-dashboard` |
| `@caplytics/core/postgres` | `query()` implementation, DB client, migrations | `caplytics-dashboard`, and `caplytics` only when a Postgres sink is configured |

The three package names in §8.1 are unchanged.

## Rationale

§8.1 places "event schema, `query()` logic, DB client" in one package imported by both the SDK and the dashboard. Taken literally, `caplytics` — which §8.1 also requires to stay dependency-light — would transitively install a Postgres driver for every user, including the majority who only want in-memory per-run caps and never persist anything.

That is a real cost, not a theoretical one: agent code frequently runs in serverless and edge-adjacent runtimes where an unused native driver is dead weight in the bundle and a source of build failures.

Splitting on a subpath keeps §8.1's actual guarantee — *one* query layer, two consumers, no schema drift — while letting the import graph reflect what each consumer needs. The dashboard imports both; the SDK imports the pure entry and only reaches for `/postgres` when the user configures persistence.

Per §9.4 (KISS), this is one line of build config and one extra entry in `exports`, not a new package.

## Consequences

- The Postgres sink is loaded dynamically when configured, so the driver stays out of the graph for users who never enable it.
- `query()`'s argument and result *types* live in the pure entry, so the dashboard's filter bar (§8.4) can map onto them without importing the driver into a client component.
- CI must assert the boundary rather than trust it: a test fails the build if the pure entry's resolved import graph reaches a database driver. Convention alone would erode.

## Alternatives considered

- **A fourth package, `@caplytics/store-postgres`** — rejected. §8.1 fixes the package set at three, and a separate package would need its own version, release, and `CLAUDE.md` for what is one module.
- **Ship it all in one entry as §8.1 literally reads** — rejected. Contradicts §8.1's own "no Next.js/React deps" spirit for the SDK, one paragraph above.
