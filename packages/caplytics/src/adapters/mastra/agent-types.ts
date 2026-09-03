import type { Agent } from "@mastra/core/agent";

/**
 * Mastra declares `Agent` with five generic slots whose defaults are themselves `any`-typed, so
 * matching one structurally requires `any` in the constraint. This is the single upstream-typing
 * exception the root CLAUDE.md allows; narrowing it would stop real agents from matching.
 */
// biome-ignore lint/suspicious/noExplicitAny: matches Mastra's own `Agent<any, ...>` generic slots
export type AnyAgent = Agent<any, any, any, any, any>;

/**
 * Tool names from the agent that was passed in.
 *
 * Verified against `@mastra/core@1.55.0`: `TTools` is the second generic slot, so §2.1's inference
 * compiles as written. A misspelled tool name in `config.tools` is a compile error, not a silent
 * no-op discovered in production.
 */
// biome-ignore lint/suspicious/noExplicitAny: infers through Mastra's `any`-defaulted generic slots
export type ToolNames<T> = T extends Agent<any, infer TTools, any, any, any> ? keyof TTools : never;

export type ToolBudget = {
  cap: number;
  onLimit?: "warn" | "block";
  /**
   * External per-call price this tool incurs — a paid API, a payment moved. Everything else is
   * derived from the result's token cost, so this is only for what nothing can observe.
   */
  cost?: number;
};

/**
 * §2's configuration surface. Caps are in dollars here and converted at the boundary; the ledger
 * works in integer micro-dollars.
 */
export type CaplyticsConfig<T> = {
  /**
   * Overrides the budget key, which otherwise comes from `agent.id` (§2.2). Only needed when
   * several agents deliberately share one pool.
   */
  budget?: string;
  cap?: number | "unlimited";
  onLimit?: "warn" | "block" | "degrade";
  tools?: Partial<Record<ToolNames<T>, ToolBudget>>;
  metadata?: Record<string, string>;
};
