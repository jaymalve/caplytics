# The query layer's write-path integration test is not yet green

**Relates to:** §6.2, §8.5
**Status:** Open — production code verified directly, harness not

## What is verified

- `buildWhere`, `toCaplyticsEvent`, cursor construction and the aggregate shape: 28 unit tests.
- Against a real TimescaleDB, by direct diagnostic script rather than the test suite:
  - the combined `timestamp >= $1 AND timestamp < $2 AND metadata @> $3::jsonb` clause returns the
    right rows,
  - `insertEvents` writes a three-row batch correctly, with metadata and BIGINT costs intact,
  - `jsonb` returns as raw text under Bun's driver and as an object under `pg` — both narrowed.

## What is not

An integration test for `listEvents` / `querySpend` / `insertEvents` against the real database.
Building it surfaced two harness problems and one unresolved one:

1. **Fixed:** the schema tests drop the events table to prove creation, and Bun runs test files in
   parallel, so they destroyed the query tests' seed mid-run. The schema tests now run in a Postgres
   schema of their own.
2. **Fixed:** seeded data collided across runs. Agent ids and a metadata marker are namespaced per
   run so nothing needs deleting.
3. **Unresolved:** through the test file's `SqlExecutor` bridge over Bun's `SQL.unsafe`, a
   multi-row `INSERT` lands only its first row — 25 events in, 1 row out. The identical call
   through a standalone script writes every row. So this is the bridge or Bun's parameter binding
   at that size, not `insertEvents`.

## What to do

Re-add the test with `pg` rather than `Bun.SQL` as the integration driver. `pg` is what the
dashboard will use anyway, so the harness would then exercise the same path production does — which
is the more useful test regardless of this bug. Bun's SQL was chosen only to avoid a devDependency.

Until then the write path is verified by inspection and by a script, not by CI.
