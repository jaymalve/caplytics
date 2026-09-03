# The query layer's integration harness uses pg, not Bun's SQL

**Relates to:** §6.2, §8.5
**Status:** Resolved

## What happened

The write-path integration test was first written against Bun's built-in `SQL`, bridged to
`SqlExecutor` by a small adapter. Through that bridge a multi-row `INSERT` landed **only its first
row** — 25 events in, 1 row out — while the identical call from a standalone script wrote every
row. The production code was never at fault; the bridge or Bun's parameter binding at that size
was.

## Decision

Integration tests use `pg`.

`pg.Pool` satisfies `SqlExecutor` structurally with **no adapter at all**, which is the point: there
is no bridge left to get wrong, and the tests exercise exactly the path the dashboard will use.
Bun's SQL had been chosen only to avoid a devDependency, and that thrift cost more than it saved —
a harness bug that masqueraded as a query bug for most of PR 14.

`pg` is a devDependency of `@caplytics/core`. The package still declares no runtime driver
dependency, so the purity boundary is unchanged.

## Also fixed while isolating this

- The schema tests drop the events table to prove creation, and Bun runs test files in parallel, so
  they were destroying a sibling file's seed mid-run. They now run in a Postgres schema of their
  own.
- Seeded rows are namespaced per run, so nothing needs deleting and no run can count another's data.

## What this leaves

A test that would have caught the original bug: "writes every row of a batch" asserts 25 rows in and
25 counted back.
