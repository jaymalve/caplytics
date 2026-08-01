import { type BudgetState, budgetRemaining } from "./budget-state.js";

/** §2.1's `onLimit`. `degrade` is §5's ladder and is not yet implemented. */
export type LimitPolicy = "warn" | "block" | "degrade";

export type LimitAction = "allow" | "warn" | "block";

/**
 * Decides what a call should do given the budget it is about to draw on (§4.1).
 *
 * Pure and separate from the ledger, which reports `exceedsCap` without acting on it: one set of
 * numbers, and the policy that reads them is swappable and testable on its own.
 */
export function decideLimit(state: BudgetState, policy: LimitPolicy): LimitAction {
  const remaining = budgetRemaining(state);

  // An uncapped run has nothing to exceed.
  if (remaining === null) return "allow";
  if (remaining > 0) return "allow";

  // §10 item 2: warning is the default, so a new agent never dies silently on its first run.
  // `degrade` behaves as `warn` until §5's ladder lands — never as `block`, since silently
  // upgrading a soft policy to a hard stop would kill runs the user did not ask to have killed.
  return policy === "block" ? "block" : "warn";
}

/**
 * True once nothing is left, regardless of policy. Reported separately from the action so callers
 * can log a breach they chose not to act on.
 */
export function isExhausted(state: BudgetState): boolean {
  const remaining = budgetRemaining(state);
  return remaining !== null && remaining <= 0;
}
