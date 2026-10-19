import { z } from "zod";
import type { CaplyticsEventType } from "../event/caplytics-event.js";
import { type MicroDollars, microDollarsToUsd } from "../money/micro-dollars.js";
import { buildWhere, type EventFilter } from "./event-filter.js";
import { EVENTS_TABLE } from "./migrations.js";
import type { SqlExecutor } from "./sql-executor.js";

/** Spend for one model or tool. Dollars, like `SpendSummary`: this is a reporting boundary. */
export type NameSpend = {
  readonly name: string;
  readonly type: CaplyticsEventType;
  readonly totalCost: number;
  readonly callCount: number;
};

const nameRowSchema = z.object({
  name: z.string(),
  type: z.enum(["model_call", "tool_call"]),
  total_cost: z.union([z.string(), z.number(), z.bigint()]).transform(Number),
  call_count: z.union([z.string(), z.number(), z.bigint()]).transform(Number),
});

/**
 * Answers "which models and tools does the money go to", most expensive first.
 *
 * A separate function rather than a field on `SpendSummary`, so §6.2's answer shape stays as
 * designed — see architecture/dashboard-overview-layout.md. Grouped by type as well as name: a tool
 * and a model may share a name, and merging them would attribute one's cost to the other.
 */
export async function querySpendByName(
  sql: SqlExecutor,
  filter: EventFilter = {},
): Promise<NameSpend[]> {
  const where = buildWhere(filter);

  const result = await sql.query(
    `SELECT name, type,
            COALESCE(SUM(cost_actual), 0) AS total_cost,
            COUNT(*)                       AS call_count
       FROM ${EVENTS_TABLE}
      WHERE ${where.sql}
      GROUP BY name, type
      ORDER BY total_cost DESC, name`,
    [...where.params],
  );

  return result.rows.map((row) => {
    const parsed = nameRowSchema.parse(row);
    return {
      name: parsed.name,
      type: parsed.type,
      totalCost: microDollarsToUsd(parsed.total_cost as MicroDollars),
      callCount: parsed.call_count,
    };
  });
}
