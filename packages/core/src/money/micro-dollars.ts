import { z } from "zod";

export const MICRO_DOLLARS_PER_USD = 1_000_000;

/**
 * Money is an integer count of millionths of a dollar, never a float.
 *
 * A single model call can cost fractions of a cent, and a run sums thousands of them. Floats
 * accumulate representation error across that many additions, so two paths that spend the same
 * amount can disagree on whether a cap was reached. Integers make the ledger exact and its
 * assertions stable.
 *
 * The brand exists because dollars and micro-dollars are both `number`: mixing them is a
 * 1,000,000x error that no amount of care reliably prevents, and that the compiler catches for free.
 */
export const microDollarsSchema = z.int().brand<"MicroDollars">();

export type MicroDollars = z.infer<typeof microDollarsSchema>;

/** Costs are never negative; a budget remainder is, once a run overspends its cap. */
export const nonNegativeMicroDollarsSchema = microDollarsSchema.refine(
  (value) => value >= 0,
  "cost may not be negative",
);

export const ZERO_MICRO_DOLLARS = toBranded(0);

/** Entry point from user-facing dollars (`cap: 5.00`) into the internal representation. */
export function usdToMicroDollars(usd: number): MicroDollars {
  return microDollarsSchema.parse(Math.round(usd * MICRO_DOLLARS_PER_USD));
}

export function microDollarsToUsd(amount: MicroDollars): number {
  return amount / MICRO_DOLLARS_PER_USD;
}

export function sumMicroDollars(...amounts: MicroDollars[]): MicroDollars {
  return toBranded(amounts.reduce<number>((total, amount) => total + amount, 0));
}

export function subtractMicroDollars(from: MicroDollars, amount: MicroDollars): MicroDollars {
  return toBranded(from - amount);
}

// Arithmetic on two integers cannot produce a non-integer, so re-validating here would cost a
// schema parse per ledger operation to prove something the inputs already guarantee.
function toBranded(value: number): MicroDollars {
  return value as MicroDollars;
}
