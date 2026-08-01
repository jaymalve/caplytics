import { type MicroDollars, sumMicroDollars, ZERO_MICRO_DOLLARS } from "../money/micro-dollars.js";
import { estimateTokenCount } from "./estimate-token-count.js";
import { type ModelRates, TOKENS_PER_MILLION } from "./model-rates.js";
import type { PricedCall } from "./price-model-call.js";

export type ToolResultPricing = {
  result: unknown;
  /** Rates for the model whose next turn will read this result as input tokens. */
  parentRates: ModelRates | undefined;
  /** External per-call price (a paid API, a payment moved) that no instrumentation can observe. */
  declaredCost?: MicroDollars;
};

/**
 * Prices a tool call as the token cost its result imposes on the parent model's next turn, plus any
 * declared external price.
 *
 * See architecture/tool-cost-derivation.md: nothing reports per-tool usage, but a tool's result
 * becomes input tokens on the following call, and that is both the dominant cost and derivable —
 * so chatty tools are charged for their payload without anyone configuring a number.
 */
export function priceToolResult({
  result,
  parentRates,
  declaredCost,
}: ToolResultPricing): PricedCall {
  const serialised = serialise(result);

  if (serialised === undefined || parentRates === undefined) {
    return { cost: declaredCost ?? ZERO_MICRO_DOLLARS, priceUnknown: true };
  }

  const tokens = estimateTokenCount(serialised);
  const tokenCost = Math.round(
    (tokens * parentRates.uncachedInput) / TOKENS_PER_MILLION,
  ) as MicroDollars;

  return {
    cost: sumMicroDollars(tokenCost, declaredCost ?? ZERO_MICRO_DOLLARS),
    priceUnknown: false,
  };
}

// A result that will not serialise is one whose token cost cannot be estimated, which is reported as
// an unknown price rather than silently priced at zero.
function serialise(result: unknown): string | undefined {
  try {
    return JSON.stringify(result) ?? undefined;
  } catch {
    return undefined;
  }
}
