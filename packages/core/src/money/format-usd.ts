import { type MicroDollars, microDollarsToUsd } from "./micro-dollars.js";

const SUB_CENT_FRACTION_DIGITS = 6;
const CENT_FRACTION_DIGITS = 2;

/**
 * Renders money for humans — hard-stop messages (§4.2), console warnings, dashboard cells.
 *
 * Sub-cent amounts widen instead of rounding: a single call routinely costs less than a cent, and
 * reporting real spend as "$0.00" is exactly the false precision §4.2 rules out.
 */
export function formatUsd(amount: MicroDollars): string {
  const usd = microDollarsToUsd(amount);
  const isSubCent = usd !== 0 && Math.abs(usd) < 0.01;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: CENT_FRACTION_DIGITS,
    maximumFractionDigits: isSubCent ? SUB_CENT_FRACTION_DIGITS : CENT_FRACTION_DIGITS,
  }).format(usd);
}
