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

/**
 * Pricing feeds quote dollars per single token, as floats small enough to carry visible binary
 * error (a $0.20/M cache read arrives as 1.9999999999999998e-7). Scaling to integer micro-dollars
 * per million and rounding once is what stops that error reaching the ledger.
 */
export function usdPerTokenToRate(usdPerToken: number): MicroDollarsPerMillionTokens {
  return microDollarsPerMillionTokensSchema.parse(Math.round(usdPerToken * 1e12));
}

export type ModelRates = {
  uncachedInput: MicroDollarsPerMillionTokens;
  cacheReadInput: MicroDollarsPerMillionTokens;
  cacheWrite5mInput: MicroDollarsPerMillionTokens;
  cacheWrite1hInput: MicroDollarsPerMillionTokens;
  output: MicroDollarsPerMillionTokens;
};
