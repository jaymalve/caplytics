export type Migration = {
  readonly id: string;
  /**
   * Applied one at a time, outside any enclosing transaction.
   *
   * TimescaleDB refuses to create a continuous aggregate inside a transaction block, so migrations
   * cannot be wrapped in one. Every statement is therefore written to be idempotent instead.
   */
  readonly statements: readonly string[];
};

export const EVENTS_TABLE = "caplytics_events";
export const DAILY_ROLLUP_VIEW = "caplytics_events_daily";
export const MIGRATIONS_TABLE = "caplytics_migrations";

/**
 * §7's schema, resolving §10's open item 5.
 *
 * Money is `BIGINT` micro-dollars, matching the in-memory ledger exactly. `NUMERIC` would be
 * arbitrary-precision but slower to sum, and a float column would reintroduce the drift the whole
 * money representation exists to avoid.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    id: "001_events",
    statements: [
      `CREATE EXTENSION IF NOT EXISTS timescaledb`,

      `CREATE TABLE IF NOT EXISTS ${EVENTS_TABLE} (
        id               UUID        NOT NULL,
        timestamp        TIMESTAMPTZ NOT NULL,
        run_id           TEXT        NOT NULL,
        agent_id         TEXT        NOT NULL,
        type             TEXT        NOT NULL,
        name             TEXT        NOT NULL,
        cost_estimate    BIGINT      NOT NULL,
        cost_actual      BIGINT      NOT NULL,
        price_unknown    BOOLEAN     NOT NULL,
        tokens_in        INTEGER,
        tokens_out       INTEGER,
        budget_remaining BIGINT,
        metadata         JSONB       NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT ${EVENTS_TABLE}_type_known CHECK (type IN ('model_call', 'tool_call')),
        CONSTRAINT ${EVENTS_TABLE}_cost_non_negative CHECK (cost_estimate >= 0 AND cost_actual >= 0),
        -- A hypertable's unique constraints must include the partition column, and (timestamp, id)
        -- is also §8.5's cursor: timestamp alone drops rows when parallel tool calls share one.
        PRIMARY KEY (timestamp, id)
      )`,

      // Seven days keeps a month of a busy team's events in four or five chunks — small enough that
      // a month-range query prunes to a handful, large enough not to accumulate thousands.
      `SELECT create_hypertable(
        '${EVENTS_TABLE}', 'timestamp',
        chunk_time_interval => INTERVAL '7 days',
        if_not_exists => TRUE
      )`,

      // §8.2's agent filter, and the ordering §8.5 pages by.
      `CREATE INDEX IF NOT EXISTS ${EVENTS_TABLE}_agent_time
        ON ${EVENTS_TABLE} (agent_id, timestamp DESC)`,

      // §6.1's arbitrary metadata keys. jsonb_path_ops is smaller and faster than the default
      // operator class for the containment queries §6.2 issues; it gives up key-existence
      // operators, which the query layer does not use.
      `CREATE INDEX IF NOT EXISTS ${EVENTS_TABLE}_metadata
        ON ${EVENTS_TABLE} USING GIN (metadata jsonb_path_ops)`,

      // §6.2 reports `byAgent`; grouping by run answers "what did that run cost".
      `CREATE INDEX IF NOT EXISTS ${EVENTS_TABLE}_run
        ON ${EVENTS_TABLE} (run_id, timestamp DESC)`,
    ],
  },
  {
    id: "002_daily_rollup",
    statements: [
      // §7's stated reason for choosing Timescale: the §6.2 query shape (sum spend by dimension by
      // time bucket) becomes a continuous aggregate rather than a hand-built rollup pipeline.
      `CREATE MATERIALIZED VIEW IF NOT EXISTS ${DAILY_ROLLUP_VIEW}
        WITH (timescaledb.continuous) AS
        SELECT
          time_bucket(INTERVAL '1 day', timestamp) AS bucket,
          agent_id,
          sum(cost_actual)                          AS total_cost,
          count(*)                                  AS call_count,
          count(*) FILTER (WHERE price_unknown)     AS unpriced_count
        FROM ${EVENTS_TABLE}
        GROUP BY bucket, agent_id
        WITH NO DATA`,

      // Refreshes recent history every hour. The window must span at least two buckets — Timescale
      // rejects a narrower one outright — and reaching back three days also covers an event that
      // arrives after its own day has closed, which a one-bucket window would strand outside the
      // aggregate permanently.
      `SELECT add_continuous_aggregate_policy('${DAILY_ROLLUP_VIEW}',
        start_offset => INTERVAL '3 days',
        end_offset   => INTERVAL '1 hour',
        schedule_interval => INTERVAL '1 hour',
        if_not_exists => TRUE
      )`,
    ],
  },
];
