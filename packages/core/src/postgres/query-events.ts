import type { CaplyticsEvent } from "../event/caplytics-event.js";
import { buildWhere, type EventFilter } from "./event-filter.js";
import { toCaplyticsEvent } from "./event-row.js";
import { EVENTS_TABLE } from "./migrations.js";
import type { SqlExecutor } from "./sql-executor.js";

/** Where the last page ended. Opaque to callers; both halves are needed (§8.5). */
export type EventCursor = {
  readonly timestamp: string;
  readonly id: string;
};

export type EventPage = {
  readonly events: readonly CaplyticsEvent[];
  /** Absent once the last page has been read. */
  readonly nextCursor?: EventCursor;
};

export type ListEventsOptions = EventFilter & {
  readonly limit?: number;
  readonly cursor?: EventCursor;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

/**
 * Lists events newest first, paged by keyset (§8.5).
 *
 * The cursor is `(timestamp, id)`, not `timestamp` alone. Parallel tool calls routinely share a
 * timestamp, and a page boundary landing inside such a group would silently skip the rest of it —
 * which is the very failure §8.5 chose keyset pagination to avoid.
 *
 * Offset pagination is not offered: its cost grows with depth on an append-only table, and rows
 * shift under a reader as new events insert mid-browse.
 */
export async function listEvents(
  sql: SqlExecutor,
  options: ListEventsOptions = {},
): Promise<EventPage> {
  const limit = Math.min(Math.max(1, options.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const where = buildWhere(options);
  const params = [...where.params];

  const conditions = [where.sql];
  if (options.cursor !== undefined) {
    // Row-value comparison, so Postgres can walk the (timestamp, id) index directly rather than
    // evaluating an OR of two ranges.
    conditions.push(`(timestamp, id) < ($${params.length + 1}, $${params.length + 2})`);
    params.push(options.cursor.timestamp, options.cursor.id);
  }

  // One extra row tells us whether another page exists without a second COUNT query.
  params.push(limit + 1);

  const result = await sql.query(
    `SELECT id, timestamp, run_id, agent_id, type, name, cost_estimate, cost_actual,
            price_unknown, tokens_in, tokens_out, budget_remaining, metadata
       FROM ${EVENTS_TABLE}
      WHERE ${conditions.join(" AND ")}
      ORDER BY timestamp DESC, id DESC
      LIMIT $${params.length}`,
    params,
  );

  const rows = result.rows.slice(0, limit);
  const events = rows.map(toCaplyticsEvent);
  const last = events.at(-1);

  return result.rows.length > limit && last !== undefined
    ? { events, nextCursor: { timestamp: last.timestamp, id: last.id } }
    : { events };
}
