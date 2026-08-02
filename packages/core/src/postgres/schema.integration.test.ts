import { afterAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { migrate } from "./migrate.js";
import { DAILY_ROLLUP_VIEW, EVENTS_TABLE, MIGRATIONS_TABLE } from "./migrations.js";
import type { SqlExecutor } from "./sql-executor.js";

/**
 * Runs against a real TimescaleDB — `docker compose up -d`, then set the URL.
 *
 * Skipped without one so `bun test` stays runnable with nothing installed, but the schema is only
 * genuinely verified here: statements that parse fine as strings still fail against a real
 * hypertable, which is exactly what §10's open item 5 asked to settle.
 */
const DATABASE_URL = process.env.CAPLYTICS_TEST_DATABASE_URL;

const describeWithDatabase = DATABASE_URL === undefined ? describe.skip : describe;

const db = DATABASE_URL === undefined ? undefined : new SQL(DATABASE_URL);

const sql: SqlExecutor = {
  // biome-ignore lint/suspicious/noExplicitAny: bridging Bun's SQL to the driver-agnostic shape
  query: async (text: string, params?: unknown[]): Promise<any> => {
    const rows = await (db as SQL).unsafe(text, (params ?? []) as never);
    return { rows: Array.isArray(rows) ? rows : [] };
  },
};

afterAll(async () => {
  await db?.close();
});

describeWithDatabase("against a real TimescaleDB", () => {
  test("applies cleanly from empty", async () => {
    // Start from scratch so the run proves creation, not just idempotency.
    await sql.query(`DROP MATERIALIZED VIEW IF EXISTS ${DAILY_ROLLUP_VIEW} CASCADE`);
    await sql.query(`DROP TABLE IF EXISTS ${EVENTS_TABLE} CASCADE`);
    await sql.query(`DROP TABLE IF EXISTS ${MIGRATIONS_TABLE}`);

    const result = await migrate(sql);

    expect(result.applied).toEqual(["001_events", "002_daily_rollup"]);
  });

  // The property that makes it safe to run on every boot.
  test("is idempotent on a second run", async () => {
    const result = await migrate(sql);

    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(["001_events", "002_daily_rollup"]);
  });

  test("creates a hypertable partitioned on timestamp", async () => {
    const result = await sql.query<{ hypertable_name: string }>(
      `SELECT hypertable_name FROM timescaledb_information.hypertables
       WHERE hypertable_name = $1`,
      [EVENTS_TABLE],
    );

    expect(result.rows).toHaveLength(1);
  });

  test("creates the continuous aggregate §7 chose Timescale for", async () => {
    const result = await sql.query<{ view_name: string }>(
      `SELECT view_name FROM timescaledb_information.continuous_aggregates
       WHERE view_name = $1`,
      [DAILY_ROLLUP_VIEW],
    );

    expect(result.rows).toHaveLength(1);
  });

  test("stores and reads back an event without losing precision", async () => {
    const id = crypto.randomUUID();
    await sql.query(
      `INSERT INTO ${EVENTS_TABLE}
        (id, timestamp, run_id, agent_id, type, name, cost_estimate, cost_actual,
         price_unknown, tokens_in, tokens_out, budget_remaining, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        "2026-08-01T10:00:00.000Z",
        "run_1",
        "support-agent",
        "model_call",
        "claude-opus-4-8",
        5700,
        5700,
        false,
        1000,
        100,
        994300,
        JSON.stringify({ customerId: "cus_18213" }),
      ],
    );

    const result = await sql.query<{ cost_actual: string; metadata: unknown }>(
      `SELECT cost_actual, metadata FROM ${EVENTS_TABLE} WHERE id = $1`,
      [id],
    );

    // BIGINT round-trips exactly; the whole point of storing micro-dollars as integers.
    expect(Number(result.rows[0]?.cost_actual)).toBe(5700);

    // Drivers disagree on jsonb: `pg` parses it into an object, Bun's SQL returns the raw text.
    // The query layer has to narrow both (§9.2) rather than assume one — noted here because that
    // is PR 14's problem and this is where it first shows up.
    const metadata = result.rows[0]?.metadata;
    const parsed = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
    expect(parsed).toEqual({ customerId: "cus_18213" });
  });

  test("rejects a negative cost at the database, not just in TypeScript", async () => {
    const insert = sql.query(
      `INSERT INTO ${EVENTS_TABLE}
        (id, timestamp, run_id, agent_id, type, name, cost_estimate, cost_actual, price_unknown)
       VALUES ($1, now(), 'r', 'a', 'model_call', 'm', 0, -1, false)`,
      [crypto.randomUUID()],
    );

    await expect(insert).rejects.toThrow();
  });

  test("rejects an unknown event type", async () => {
    const insert = sql.query(
      `INSERT INTO ${EVENTS_TABLE}
        (id, timestamp, run_id, agent_id, type, name, cost_estimate, cost_actual, price_unknown)
       VALUES ($1, now(), 'r', 'a', 'sub_agent_call', 'm', 0, 0, false)`,
      [crypto.randomUUID()],
    );

    await expect(insert).rejects.toThrow();
  });

  // An uncapped run has no remainder to record.
  test("accepts a null budget_remaining", async () => {
    const id = crypto.randomUUID();
    await sql.query(
      `INSERT INTO ${EVENTS_TABLE}
        (id, timestamp, run_id, agent_id, type, name, cost_estimate, cost_actual,
         price_unknown, budget_remaining)
       VALUES ($1, now(), 'r', 'a', 'model_call', 'm', 0, 0, false, NULL)`,
      [id],
    );

    const result = await sql.query(`SELECT id FROM ${EVENTS_TABLE} WHERE id = $1`, [id]);
    expect(result.rows).toHaveLength(1);
  });

  test("two events sharing a timestamp both survive, which §8.5's cursor depends on", async () => {
    const timestamp = "2026-08-02T12:00:00.000Z";
    for (const _ of [0, 1]) {
      await sql.query(
        `INSERT INTO ${EVENTS_TABLE}
          (id, timestamp, run_id, agent_id, type, name, cost_estimate, cost_actual, price_unknown)
         VALUES ($1, $2, 'r', 'parallel-tools', 'tool_call', 't', 0, 0, false)`,
        [crypto.randomUUID(), timestamp],
      );
    }

    const result = await sql.query(
      `SELECT id FROM ${EVENTS_TABLE} WHERE agent_id = 'parallel-tools' AND timestamp = $1`,
      [timestamp],
    );

    expect(result.rows).toHaveLength(2);
  });
});
