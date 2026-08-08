import { z } from "zod";
import { buildWhere, type EventFilter } from "./event-filter.js";
import { EVENTS_TABLE } from "./migrations.js";
import type { SqlExecutor } from "./sql-executor.js";

const agentRowSchema = z.object({ agent_id: z.string() });

/**
 * Distinct agents that have recorded spend, for §8.2's agent filter.
 *
 * Read from the events themselves rather than a configured list: an agent that has never run has
 * nothing to filter, and one that has run must be selectable even if nobody registered it.
 */
export async function listAgents(sql: SqlExecutor, filter: EventFilter = {}): Promise<string[]> {
  const where = buildWhere(filter);

  const result = await sql.query(
    `SELECT DISTINCT agent_id FROM ${EVENTS_TABLE} WHERE ${where.sql} ORDER BY agent_id`,
    [...where.params],
  );

  return result.rows.map((row) => agentRowSchema.parse(row).agent_id);
}
