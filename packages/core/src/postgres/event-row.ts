import { z } from "zod";
import { type CaplyticsEvent, caplyticsEventSchema } from "../event/caplytics-event.js";

/**
 * A row on its way out of Postgres, before it is a `CaplyticsEvent`.
 *
 * Two driver disagreements are absorbed here rather than left to every call site:
 *
 * - **BIGINT** arrives as a string in `pg` (it exceeds `Number.MAX_SAFE_INTEGER` in general, so the
 *   driver refuses to guess) and as a number or bigint elsewhere. Micro-dollar amounts are far
 *   below that ceiling, so converting is safe — but it has to happen somewhere deliberate.
 * - **JSONB** is parsed into an object by `pg` and returned as raw text by others. Found against a
 *   real database in PR 13; assuming either one breaks on the other driver.
 */
const numericLike = z.union([z.string(), z.number(), z.bigint()]).transform(Number);

const jsonObject = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .transform((value) => (typeof value === "string" ? JSON.parse(value) : value));

const eventRowSchema = z.object({
  id: z.string(),
  timestamp: z.union([z.string(), z.date()]).transform(toIsoString),
  run_id: z.string(),
  agent_id: z.string(),
  type: z.string(),
  name: z.string(),
  cost_estimate: numericLike,
  cost_actual: numericLike,
  price_unknown: z.boolean(),
  tokens_in: numericLike.nullable().optional(),
  tokens_out: numericLike.nullable().optional(),
  budget_remaining: numericLike.nullable().optional(),
  metadata: jsonObject,
});

/**
 * Narrows a database row to the event type (§9.2), rather than casting.
 *
 * The row is re-validated against the same schema the SDK emits against, so a column that drifts
 * from the type — or a hand-edited row — fails here instead of surfacing as a wrong number in a
 * dashboard cell.
 */
export function toCaplyticsEvent(row: unknown): CaplyticsEvent {
  const parsed = eventRowSchema.parse(row);

  return caplyticsEventSchema.parse({
    id: parsed.id,
    runId: parsed.run_id,
    agentId: parsed.agent_id,
    type: parsed.type,
    name: parsed.name,
    costEstimate: parsed.cost_estimate,
    costActual: parsed.cost_actual,
    priceUnknown: parsed.price_unknown,
    ...(parsed.tokens_in == null ? {} : { tokensIn: parsed.tokens_in }),
    ...(parsed.tokens_out == null ? {} : { tokensOut: parsed.tokens_out }),
    budgetRemaining: parsed.budget_remaining ?? null,
    timestamp: parsed.timestamp,
    metadata: parsed.metadata,
  });
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
