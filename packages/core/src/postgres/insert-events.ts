import type { CaplyticsEvent } from "../event/caplytics-event.js";
import { EVENTS_TABLE } from "./migrations.js";
import type { SqlExecutor } from "./sql-executor.js";

const COLUMNS_PER_ROW = 13;

/**
 * Writes events to the hypertable.
 *
 * Batched into a single multi-row `INSERT` rather than one statement per event: the emitter
 * produces events per model call, and a round trip each would put database latency on the agent's
 * critical path.
 *
 * `ON CONFLICT DO NOTHING` makes a retry safe. A sink that re-sends after a timeout it never saw
 * the result of would otherwise double-count spend, and the primary key already identifies an
 * event uniquely.
 */
export async function insertEvents(
  sql: SqlExecutor,
  events: readonly CaplyticsEvent[],
): Promise<number> {
  if (events.length === 0) return 0;

  const params: unknown[] = [];
  const rows = events.map((event, index) => {
    const offset = index * COLUMNS_PER_ROW;
    params.push(
      event.id,
      event.timestamp,
      event.runId,
      event.agentId,
      event.type,
      event.name,
      event.costEstimate,
      event.costActual,
      event.priceUnknown,
      event.tokensIn ?? null,
      event.tokensOut ?? null,
      event.budgetRemaining,
      JSON.stringify(event.metadata),
    );

    const placeholders = Array.from(
      { length: COLUMNS_PER_ROW },
      (_, column) => `$${offset + column + 1}`,
    );
    return `(${placeholders.join(", ")})`;
  });

  await sql.query(
    `INSERT INTO ${EVENTS_TABLE}
       (id, timestamp, run_id, agent_id, type, name, cost_estimate, cost_actual,
        price_unknown, tokens_in, tokens_out, budget_remaining, metadata)
     VALUES ${rows.join(", ")}
     ON CONFLICT (timestamp, id) DO NOTHING`,
    params,
  );

  return events.length;
}
