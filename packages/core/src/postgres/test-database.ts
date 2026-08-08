import { Pool } from "pg";
import type { SqlExecutor } from "./sql-executor.js";

/**
 * A real `pg.Pool` for integration tests, or undefined when no database is configured.
 *
 * `pg` rather than Bun's built-in SQL deliberately: `Pool` satisfies `SqlExecutor` structurally
 * with no adapter at all, so the tests exercise exactly the path the dashboard will — which is both
 * a better test and the reason this file has no bridge to get wrong.
 */
export const TEST_DATABASE_URL = process.env.CAPLYTICS_TEST_DATABASE_URL;

export function createTestPool(
  schema?: string,
): (SqlExecutor & { end(): Promise<void> }) | undefined {
  if (TEST_DATABASE_URL === undefined) return undefined;

  // The search path is set per *connection*, not per query: a pool hands out a different connection
  // each time, so a `SET search_path` statement would apply to whichever one happened to run it.
  return new Pool({
    connectionString: TEST_DATABASE_URL,
    max: 4,
    ...(schema === undefined ? {} : { options: `-c search_path=${schema},public` }),
  });
}

/** Unique per run, so seeded rows cannot collide with a previous run or a sibling test file. */
export function testNamespace(): string {
  return crypto.randomUUID().slice(0, 8);
}
