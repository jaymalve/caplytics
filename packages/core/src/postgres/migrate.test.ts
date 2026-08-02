import { describe, expect, test } from "bun:test";
import { migrate } from "./migrate.js";
import { DAILY_ROLLUP_VIEW, EVENTS_TABLE, MIGRATIONS, MIGRATIONS_TABLE } from "./migrations.js";
import type { SqlExecutor } from "./sql-executor.js";

/** Records every statement, and answers "already applied?" from a caller-supplied set. */
function fakeExecutor(alreadyApplied: string[] = []) {
  const statements: string[] = [];
  const params: unknown[][] = [];

  const executor: SqlExecutor = {
    // biome-ignore lint/suspicious/noExplicitAny: the fake stands in for a driver's generic row type
    query: async (sql: string, values?: unknown[]): Promise<any> => {
      statements.push(sql);
      if (values !== undefined) params.push(values);

      if (sql.includes(`FROM ${MIGRATIONS_TABLE} WHERE id`)) {
        const id = String(values?.[0]);
        return { rows: alreadyApplied.includes(id) ? [{ id }] : [] };
      }
      return { rows: [] };
    },
  };

  return { executor, statements, params };
}

describe("applying", () => {
  test("runs every migration on an empty database", async () => {
    const { executor } = fakeExecutor();

    const result = await migrate(executor);

    expect(result.applied).toEqual(MIGRATIONS.map((migration) => migration.id));
    expect(result.skipped).toEqual([]);
  });

  test("records each migration once it has run", async () => {
    const { executor, params } = fakeExecutor();

    await migrate(executor);

    const recorded = params.flat().filter((value) => typeof value === "string");
    expect(recorded).toContain("001_events");
  });

  // Safe to call on every boot is the whole point; re-running must not re-create a hypertable.
  test("skips migrations already applied", async () => {
    const { executor, statements } = fakeExecutor(["001_events"]);

    const result = await migrate(executor);

    expect(result.skipped).toContain("001_events");
    expect(statements.some((sql) => sql.includes("create_hypertable"))).toBe(false);
  });

  test("applies in declared order", async () => {
    const { executor, statements } = fakeExecutor();

    await migrate(executor);

    const tableAt = statements.findIndex((sql) =>
      sql.includes(`CREATE TABLE IF NOT EXISTS ${EVENTS_TABLE}`),
    );
    const rollupAt = statements.findIndex((sql) => sql.includes(DAILY_ROLLUP_VIEW));
    expect(tableAt).toBeLessThan(rollupAt);
  });
});

describe("concurrency", () => {
  // Two processes booting at once must not race to half-create the same schema.
  test("takes and releases an advisory lock around the run", async () => {
    const { executor, statements } = fakeExecutor();

    await migrate(executor);

    expect(statements.some((sql) => sql.includes("pg_advisory_lock"))).toBe(true);
    expect(statements.at(-1)).toContain("pg_advisory_unlock");
  });

  test("releases the lock even when a migration fails", async () => {
    const statements: string[] = [];
    const executor: SqlExecutor = {
      // biome-ignore lint/suspicious/noExplicitAny: the fake stands in for a driver's row type
      query: async (sql: string): Promise<any> => {
        statements.push(sql);
        if (sql.includes("CREATE TABLE IF NOT EXISTS caplytics_events")) {
          throw new Error("disk full");
        }
        return { rows: [] };
      },
    };

    await expect(migrate(executor)).rejects.toThrow("disk full");
    expect(statements.at(-1)).toContain("pg_advisory_unlock");
  });
});

describe("the schema itself", () => {
  const allStatements = MIGRATIONS.flatMap((migration) => migration.statements);

  // TimescaleDB refuses to create a continuous aggregate inside a transaction, so migrations
  // cannot be wrapped in one — every statement has to stand alone.
  test.each(allStatements)("statement %# is individually idempotent", (statement) => {
    const creates = /^\s*CREATE\s+(TABLE|INDEX|MATERIALIZED VIEW|EXTENSION)/i.test(statement);
    expect(!creates || /IF NOT EXISTS/i.test(statement)).toBe(true);
  });

  test("no statement opens a transaction", () => {
    expect(allStatements.some((sql) => /\b(BEGIN|COMMIT)\b/i.test(sql))).toBe(false);
  });

  test("migration ids are unique and ordered", () => {
    const ids = MIGRATIONS.map((migration) => migration.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });

  // (timestamp, id) is both the hypertable's required key and §8.5's cursor tiebreaker.
  test("the primary key carries the partition column and a tiebreaker", () => {
    expect(allStatements.join("\n")).toContain("PRIMARY KEY (timestamp, id)");
  });

  test("money columns are integers, matching the in-memory ledger", () => {
    const create =
      allStatements.find((sql) => sql.includes(`CREATE TABLE IF NOT EXISTS ${EVENTS_TABLE}`)) ?? "";

    for (const column of ["cost_estimate", "cost_actual", "budget_remaining"]) {
      expect(create).toMatch(new RegExp(`${column}\\s+BIGINT`));
    }
    expect(create).not.toMatch(/DOUBLE PRECISION|REAL|FLOAT/i);
  });

  // An uncapped run has no remainder; NOT NULL here would force a lie.
  test("budget_remaining is nullable while costs are not", () => {
    const create =
      allStatements.find((sql) => sql.includes(`CREATE TABLE IF NOT EXISTS ${EVENTS_TABLE}`)) ?? "";

    expect(create).toMatch(/budget_remaining BIGINT,/);
    expect(create).toMatch(/cost_actual\s+BIGINT\s+NOT NULL/);
  });
});
