import { type MicroDollars, sumMicroDollars, ZERO_MICRO_DOLLARS } from "../money/micro-dollars.js";
import { findModelRates } from "./model-price-registry.js";
import {
  type MicroDollarsPerMillionTokens,
  type ModelRates,
  TOKENS_PER_MILLION,
} from "./model-rates.js";
import type { TokenUsage } from "./token-usage.js";

export type PricedCall = {
  cost: MicroDollars;
  /** Maps straight onto the event field of the same name (§8.3). */
  priceUnknown: boolean;
};

/**
 * Prices one model call from its token usage.
 *
 * An unrecognised model yields zero cost with `priceUnknown: true` rather than a guess — the caller
 * records the call but does not deduct it from a budget, since there is no honest amount to deduct.
 */
export function priceModelCall(modelId: string, usage: TokenUsage, at: string): PricedCall {
  const rates = findModelRates(modelId, at);
  if (rates === undefined) {
    return { cost: ZERO_MICRO_DOLLARS, priceUnknown: true };
  }

  return { cost: priceUsage(usage, rates), priceUnknown: false };
}

export function priceUsage(usage: TokenUsage, rates: ModelRates): MicroDollars {
  const cacheWriteRate =
    usage.cacheWriteTtl === "1h" ? rates.cacheWrite1hInput : rates.cacheWrite5mInput;

  return sumMicroDollars(
    costOf(usage.uncachedInput, rates.uncachedInput),
    costOf(usage.cacheReadInput, rates.cacheReadInput),
    costOf(usage.cacheWriteInput, cacheWriteRate),
    costOf(usage.output, rates.output),
  );
}

// Rounded per bucket rather than once at the end: each bucket is a separately billed line item, and
// rounding the sum of exact fractions would drift from what the provider actually charges.
function costOf(tokens: number, rate: MicroDollarsPerMillionTokens): MicroDollars {
  return Math.round((tokens * rate) / TOKENS_PER_MILLION) as MicroDollars;
}
