import { z } from "zod";
import { microDollarsSchema, nonNegativeMicroDollarsSchema } from "../money/micro-dollars.js";

/**
 * One event per model call and per tool call — the single record enforcement, console output, and
 * the dashboard all read from (§3). There is no separate reporting shape to keep in sync.
 *
 * Two fields extend §3 as written; see architecture/event-schema-completions.md.
 */
export const caplyticsEventSchema = z.object({
  id: z.uuid(),
  runId: z.string().min(1),
  agentId: z.string().min(1),
  type: z.enum(["model_call", "tool_call"]),
  name: z.string().min(1),

  costEstimate: nonNegativeMicroDollarsSchema,
  costActual: nonNegativeMicroDollarsSchema,
  /** True when no price was known for this call, so its cost is reported but not enforced. */
  priceUnknown: z.boolean(),

  tokensIn: z.int().nonnegative().optional(),
  tokensOut: z.int().nonnegative().optional(),

  /** Signed: a run that overspends mid-stream ends below zero, and §4.2 requires reporting that. */
  budgetRemaining: microDollarsSchema,

  timestamp: z.iso.datetime(),
  metadata: z.record(z.string(), z.string()),
});

export type CaplyticsEvent = z.infer<typeof caplyticsEventSchema>;

export type CaplyticsEventType = CaplyticsEvent["type"];
