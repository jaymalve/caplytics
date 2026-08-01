import type { MicroDollars } from "../money/micro-dollars.js";
import type { BudgetScope, BudgetState } from "./budget-state.js";

export type Reservation = {
  readonly id: string;
  readonly scope: BudgetScope;
  readonly amount: MicroDollars;
};

export type ReserveOutcome = {
  readonly reservation: Reservation;
  readonly state: BudgetState;
  /**
   * Whether this reservation took the pool past its cap.
   *
   * Reported, not enforced. Whether that warns, blocks, or degrades is policy (§4, §5), and a
   * ledger that decided it could not serve all three.
   */
  readonly exceedsCap: boolean;
};

/**
 * Tracks spend for one budget pool through a call's lifecycle.
 *
 * Three operations rather than one, because enforcement happens before a call (§4.1) while actual
 * cost is only known after it: `reserve` books an estimate, `settle` corrects it to the real
 * figure, `release` returns it when the call never happened.
 *
 * Every method is synchronous, and that is load-bearing rather than incidental — read-modify-write
 * in a single synchronous block is what makes a reservation atomic against the parallel tool calls
 * Mastra issues. A persistent or windowed store (v2) cannot inherit that guarantee and will need
 * its own atomicity strategy at the database level, so treat this interface as the shape of the
 * in-process contract rather than as one a remote store drops into unchanged.
 */
export type BudgetStore = {
  /**
   * Starts tracking a pool, or returns the existing one.
   *
   * Idempotent, and the first cap wins: a later call cannot raise a running pool's cap, which would
   * silently undo enforcement partway through a run.
   */
  open(scope: BudgetScope, cap: MicroDollars | null): BudgetState;

  /** Books an estimate against the pool. Throws if the pool was never opened. */
  reserve(scope: BudgetScope, amount: MicroDollars): ReserveOutcome;

  /** Replaces a reservation with the call's real cost. */
  settle(reservationId: string, actualCost: MicroDollars): BudgetState;

  /** Returns a reservation to the pool for a call that failed or was blocked. */
  release(reservationId: string): BudgetState;

  read(scope: BudgetScope): BudgetState | undefined;

  /** Frees the pool once its run is over. */
  close(scope: BudgetScope): void;
};
