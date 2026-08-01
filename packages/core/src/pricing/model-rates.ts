import { z } from "zod";

/**
 * A price per million tokens — a rate, not an amount.
 *
 * Branded separately from [MicroDollars] because both are integer micro-dollars: adding a rate to a
 * cost, or passing one where the other belongs, is otherwise a silent 1,000,000x error of exactly
 * the kind the money brand exists to prevent.
 */
export const microDollarsPerMillionTokensSchema = z
  .int()
  .nonnegative()
  .brand<"MicroDollarsPerMillionTokens">();

export type MicroDollarsPerMillionTokens = z.infer<typeof microDollarsPerMillionTokensSchema>;

export const TOKENS_PER_MILLION = 1_000_000;

export function usdPerMillionTokens(usd: number): MicroDollarsPerMillionTokens {
  return microDollarsPerMillionTokensSchema.parse(Math.round(usd * 1_000_000));
}

export type ModelRates = {
  uncachedInput: MicroDollarsPerMillionTokens;
  cacheReadInput: MicroDollarsPerMillionTokens;
  cacheWrite5mInput: MicroDollarsPerMillionTokens;
  cacheWrite1hInput: MicroDollarsPerMillionTokens;
  output: MicroDollarsPerMillionTokens;
};

/**
 * Anthropic prices cache traffic as fixed multiples of a model's input rate, so the registry states
 * the two published numbers and derives the rest. Naming the vendor is the point: these multipliers
 * are not universal, and a future provider's table must not inherit them by looking similar.
 */
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_5M_MULTIPLIER = 1.25;
const CACHE_WRITE_1H_MULTIPLIER = 2;

export function anthropicRates(inputUsd: number, outputUsd: number): ModelRates {
  return {
    uncachedInput: usdPerMillionTokens(inputUsd),
    cacheReadInput: usdPerMillionTokens(inputUsd * CACHE_READ_MULTIPLIER),
    cacheWrite5mInput: usdPerMillionTokens(inputUsd * CACHE_WRITE_5M_MULTIPLIER),
    cacheWrite1hInput: usdPerMillionTokens(inputUsd * CACHE_WRITE_1H_MULTIPLIER),
    output: usdPerMillionTokens(outputUsd),
  };
}
