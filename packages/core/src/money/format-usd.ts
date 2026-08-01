import { type MicroDollars, microDollarsToUsd } from "./micro-dollars.js";

const PRECISE_FRACTION_DIGITS = 6;
const CENT_FRACTION_DIGITS = 2;

/**
 * Renders money for humans — hard-stop messages (§4.2), console warnings, dashboard cells.
 *
 * Amounts below a dollar widen instead of rounding to cents. Individual calls cost cents or
 * fractions of one, so at two decimal places a table of them collapses: every call between half a
 * cent and one and a half cents reads "$0.01", and the rows stop summing to the total. Trailing
 * zeros are still trimmed, so round amounts keep their familiar "$0.50" shape.
 */
export function formatUsd(amount: MicroDollars): string {
  const usd = microDollarsToUsd(amount);
  const isSubDollar = Math.abs(usd) < 1;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: CENT_FRACTION_DIGITS,
    maximumFractionDigits: isSubDollar ? PRECISE_FRACTION_DIGITS : CENT_FRACTION_DIGITS,
  }).format(usd);
}
