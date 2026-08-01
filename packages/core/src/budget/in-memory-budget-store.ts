import {
  type MicroDollars,
  subtractMicroDollars,
  sumMicroDollars,
  ZERO_MICRO_DOLLARS,
} from "../money/micro-dollars.js";
import { type BudgetScope, type BudgetState, scopeId } from "./budget-state.js";
import type { BudgetStore, Reservation, ReserveOutcome } from "./budget-store.js";

/**
 * A run that ends without `close` — an uncaught throw, a stream abandoned mid-flight — would
 * otherwise keep its pool forever, turning a long-lived server into a slow leak. Evicting the
 * oldest pool past this bound trades exact accounting for a stale run against staying up.
 */
const DEFAULT_MAX_TRACKED_RUNS = 10_000;

export type InMemoryBudgetStoreOptions = {
  maxTrackedRuns?: number;
};

type Pool = {
  scope: BudgetScope;
  cap: MicroDollars | null;
  settled: MicroDollars;
  reservations: Map<string, MicroDollars>;
  reserved: MicroDollars;
};

/**
 * The v1 ledger: per-process, per-run, in memory.
 *
 * Caps are therefore per-process. Running N replicas means N independent caps, and a $5 cap across
 * four of them can spend $20 in parallel. That is acceptable only because caps are per-run and a
 * single run does not span processes — see architecture/budget-scope-and-state.md.
 */
export function createInMemoryBudgetStore(options: InMemoryBudgetStoreOptions = {}): BudgetStore {
  const maxTrackedRuns = options.maxTrackedRuns ?? DEFAULT_MAX_TRACKED_RUNS;

  // Insertion-ordered, so the first key is always the oldest pool.
  const pools = new Map<string, Pool>();
  const reservationPools = new Map<string, string>();

  let nextReservation = 0;

  function snapshot(pool: Pool): BudgetState {
    return {
      scope: pool.scope,
      cap: pool.cap,
      settled: pool.settled,
      reserved: pool.reserved,
    };
  }

  function poolFor(reservationId: string): { pool: Pool; amount: MicroDollars } {
    const id = reservationPools.get(reservationId);
    const pool = id === undefined ? undefined : pools.get(id);
    const amount = pool?.reservations.get(reservationId);

    if (pool === undefined || amount === undefined) {
      // Silently ignoring would drop the reservation's hold on the budget without recording its
      // cost, quietly under-reporting spend — worse than surfacing the bug.
      throw new Error(`unknown or already-resolved reservation: ${reservationId}`);
    }

    return { pool, amount };
  }

  function evictOldestIfFull(): void {
    while (pools.size >= maxTrackedRuns) {
      const oldest = pools.keys().next();
      if (oldest.done === true) return;

      const evicted = pools.get(oldest.value);
      for (const reservationId of evicted?.reservations.keys() ?? []) {
        reservationPools.delete(reservationId);
      }
      pools.delete(oldest.value);
    }
  }

  return {
    open(scope, cap) {
      const id = scopeId(scope);
      const existing = pools.get(id);
      if (existing !== undefined) return snapshot(existing);

      evictOldestIfFull();

      const pool: Pool = {
        scope,
        cap,
        settled: ZERO_MICRO_DOLLARS,
        reservations: new Map(),
        reserved: ZERO_MICRO_DOLLARS,
      };
      pools.set(id, pool);
      return snapshot(pool);
    },

    reserve(scope, amount) {
      const pool = pools.get(scopeId(scope));
      if (pool === undefined) {
        throw new Error(`no budget open for run ${scope.runId} (${scope.budgetKey})`);
      }

      // Read, modify and write in one synchronous block: nothing may observe or interleave with a
      // half-applied reservation, which is what stops parallel calls sharing one remainder.
      nextReservation += 1;
      const reservation: Reservation = {
        id: `${scopeId(scope)}#${nextReservation}`,
        scope,
        amount,
      };
      pool.reservations.set(reservation.id, amount);
      pool.reserved = sumMicroDollars(pool.reserved, amount);
      reservationPools.set(reservation.id, scopeId(scope));

      const state = snapshot(pool);
      const exceedsCap =
        pool.cap !== null && sumMicroDollars(pool.settled, pool.reserved) > pool.cap;

      return { reservation, state, exceedsCap } satisfies ReserveOutcome;
    },

    settle(reservationId, actualCost) {
      const { pool, amount } = poolFor(reservationId);

      pool.reservations.delete(reservationId);
      reservationPools.delete(reservationId);
      pool.reserved = subtractMicroDollars(pool.reserved, amount);
      pool.settled = sumMicroDollars(pool.settled, actualCost);

      return snapshot(pool);
    },

    release(reservationId) {
      const { pool, amount } = poolFor(reservationId);

      pool.reservations.delete(reservationId);
      reservationPools.delete(reservationId);
      pool.reserved = subtractMicroDollars(pool.reserved, amount);

      return snapshot(pool);
    },

    read(scope) {
      const pool = pools.get(scopeId(scope));
      return pool === undefined ? undefined : snapshot(pool);
    },

    close(scope) {
      const id = scopeId(scope);
      const pool = pools.get(id);
      if (pool === undefined) return;

      for (const reservationId of pool.reservations.keys()) {
        reservationPools.delete(reservationId);
      }
      pools.delete(id);
    },
  };
}
