import { z } from "zod";
import { type MicroDollars, microDollarsToUsd } from "../money/micro-dollars.js";
import { buildWhere, type EventFilter } from "./event-filter.js";
import { EVENTS_TABLE } from "./migrations.js";
import type { SqlExecutor } from "./sql-executor.js";

/**
 * §6.2's answer shape. Costs are dollars here, not micro-dollars: this is a reporting boundary, and
 * §6.2's own example reads `totalCost: 42.18`.
 */
export type SpendSummary = {
  readonly totalCost: number;
  readonly callCount: number;
  readonly byAgent: Readonly<Record<string, number>>;
  /**
   * Calls whose model had no known price, so their cost is missing from the total.
   *
   * Reported alongside rather than folded in: a total that silently omits unpriced calls looks
   * complete and is not, which is the false precision §4.2 rules out.
   */
  readonly unpricedCount: number;
};

const summaryRowSchema = z.object({
  agent_id: z.string(),
  total_cost: z.union([z.string(), z.number(), z.bigint()]).transform(Number),
  call_count: z.union([z.string(), z.number(), z.bigint()]).transform(Number),
  unpriced_count: z.union([z.string(), z.number(), z.bigint()]).transform(Number),
});

/**
 * Answers "how much did we spend for this customer / category / window" (§6.2).
 *
 * Aggregated in the database rather than by summing fetched rows: the point of the query layer is
 * to answer without moving a month of events across the wire.
 */
export async function querySpend(
  sql: SqlExecutor,
  filter: EventFilter = {},
): Promise<SpendSummary> {
  const where = buildWhere(filter);

  const result = await sql.query(
    `SELECT agent_id,
            COALESCE(SUM(cost_actual), 0)          AS total_cost,
            COUNT(*)                                AS call_count,
            COUNT(*) FILTER (WHERE price_unknown)   AS unpriced_count
       FROM ${EVENTS_TABLE}
      WHERE ${where.sql}
      GROUP BY agent_id`,
    [...where.params],
  );

  const byAgent: Record<string, number> = {};
  let totalMicroDollars = 0;
  let callCount = 0;
  let unpricedCount = 0;

  for (const row of result.rows) {
    const parsed = summaryRowSchema.parse(row);
    byAgent[parsed.agent_id] = microDollarsToUsd(parsed.total_cost as MicroDollars);
    totalMicroDollars += parsed.total_cost;
    callCount += parsed.call_count;
    unpricedCount += parsed.unpriced_count;
  }

  // Summed as integers and converted once, so the total matches the per-agent figures exactly
  // rather than accumulating rounding across them.
  return {
    totalCost: microDollarsToUsd(totalMicroDollars as MicroDollars),
    callCount,
    byAgent,
    unpricedCount,
  };
}
