import { formatUsd } from "../money/format-usd.js";
import type { MicroDollars } from "../money/micro-dollars.js";

export type BudgetExceededDetails = {
  readonly runId: string;
  readonly budget: string;
  readonly spent: MicroDollars;
  readonly cap: MicroDollars;
};

/**
 * Thrown when a call is refused because its run has no budget left (§4.1).
 *
 * Propagates as an ordinary call failure, so Mastra's agent loop needs no special handling.
 *
 * The message reports **spend at stop time, not the configured cap** — §4.2 is explicit that a run
 * stopped after $5.02 of a $5.00 cap must say so. Rounding that to the cap would hide the overage
 * the mechanism exists to bound.
 */
export class CaplyticsBudgetExceededError extends Error {
  readonly runId: string;
  readonly budget: string;
  readonly spent: MicroDollars;
  readonly cap: MicroDollars;

  constructor(details: BudgetExceededDetails) {
    super(
      `caplytics: budget "${details.budget}" exhausted — stopped after ` +
        `${formatUsd(details.spent)} of ${formatUsd(details.cap)} (run ${details.runId}).`,
    );

    this.name = "CaplyticsBudgetExceededError";
    this.runId = details.runId;
    this.budget = details.budget;
    this.spent = details.spent;
    this.cap = details.cap;
  }
}
