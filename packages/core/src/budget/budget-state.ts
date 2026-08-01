import {
  type MicroDollars,
  subtractMicroDollars,
  sumMicroDollars,
  ZERO_MICRO_DOLLARS,
} from "../money/micro-dollars.js";

/**
 * Identifies one budget pool.
 *
 * Caps are per-run, so `runId` scopes the pool. `budgetKey` is separate because §2.2 lets several
 * agents in one run share a pool by declaring the same key — an orchestrator and its sub-agents
 * drawing on one allowance rather than one each.
 */
export type BudgetScope = {
  readonly runId: string;
  readonly budgetKey: string;
};

export type BudgetState = {
  readonly scope: BudgetScope;
  /** null when the run is uncapped, which §10's `cap: "unlimited"` opt-out maps to. */
  readonly cap: MicroDollars | null;
  /** Actual cost of calls that have completed. */
  readonly settled: MicroDollars;
  /** Estimated cost of calls currently in flight. */
  readonly reserved: MicroDollars;
};

// A composite key rather than nested maps: one lookup, and no partially-populated intermediate
// level to reason about. Length-prefixed rather than separator-joined because `budgetKey` is
// user-supplied (§2.2): any separator can be spelled inside a key, letting one run's pool
// masquerade as another's.
export function scopeId(scope: BudgetScope): string {
  return `${scope.runId.length}:${scope.runId}:${scope.budgetKey}`;
}

/**
 * Everything committed or promised.
 *
 * In-flight reservations count against the budget. Excluding them would let every parallel tool
 * call see the same untouched remainder and collectively blow through the cap — the race this
 * ledger exists to prevent.
 */
export function budgetSpent(state: BudgetState): MicroDollars {
  return sumMicroDollars(state.settled, state.reserved);
}

/** Negative once a run overspends, which §4.2 requires reporting rather than clamping to zero. */
export function budgetRemaining(state: BudgetState): MicroDollars | null {
  if (state.cap === null) return null;
  return subtractMicroDollars(state.cap, budgetSpent(state));
}

/**
 * Fraction of the cap consumed, as §5's degradation ladder compares against.
 *
 * A zero cap has no meaningful ratio, so it reports fully consumed once anything is spent and
 * untouched before that — rather than dividing by zero and handing the ladder a NaN.
 */
export function budgetUsedFraction(state: BudgetState): number | null {
  if (state.cap === null) return null;

  const spent = budgetSpent(state);
  if (state.cap === ZERO_MICRO_DOLLARS) return spent > 0 ? 1 : 0;

  return spent / state.cap;
}
