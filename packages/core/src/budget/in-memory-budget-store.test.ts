import { beforeEach, describe, expect, test } from "bun:test";
import { usdToMicroDollars, ZERO_MICRO_DOLLARS } from "../money/micro-dollars.js";
import { type BudgetScope, budgetRemaining, budgetSpent } from "./budget-state.js";
import type { BudgetStore } from "./budget-store.js";
import { createInMemoryBudgetStore } from "./in-memory-budget-store.js";

const SCOPE: BudgetScope = { runId: "run_1", budgetKey: "support-agent" };
const CAP = usdToMicroDollars(5);

let store: BudgetStore;

beforeEach(() => {
  store = createInMemoryBudgetStore();
});

describe("open", () => {
  test("starts an untouched pool", () => {
    const state = store.open(SCOPE, CAP);

    expect(state.settled).toBe(ZERO_MICRO_DOLLARS);
    expect(state.reserved).toBe(ZERO_MICRO_DOLLARS);
    expect(budgetRemaining(state)).toBe(CAP);
  });

  // Re-opening mid-run must not wipe spend, or a second agent joining a shared pool would reset it.
  test("is idempotent and preserves spend", () => {
    store.open(SCOPE, CAP);
    const { reservation } = store.reserve(SCOPE, usdToMicroDollars(2));
    store.settle(reservation.id, usdToMicroDollars(2));

    const reopened = store.open(SCOPE, CAP);

    expect(reopened.settled).toBe(usdToMicroDollars(2));
  });

  // Otherwise a later call could silently lift a cap partway through a run.
  test("keeps the original cap when reopened with a different one", () => {
    store.open(SCOPE, CAP);

    const reopened = store.open(SCOPE, usdToMicroDollars(1000));

    expect(reopened.cap).toBe(CAP);
  });
});

describe("reserve", () => {
  test("holds an estimate against the budget before the call runs", () => {
    store.open(SCOPE, CAP);

    const { state } = store.reserve(SCOPE, usdToMicroDollars(2));

    expect(state.reserved).toBe(usdToMicroDollars(2));
    expect(budgetRemaining(state)).toBe(usdToMicroDollars(3));
  });

  test("reports breaching the cap without refusing to record it", () => {
    store.open(SCOPE, CAP);

    const outcome = store.reserve(SCOPE, usdToMicroDollars(6));

    // Reported, not enforced — whether that warns, blocks, or degrades is §4/§5 policy.
    expect(outcome.exceedsCap).toBe(true);
    expect(outcome.state.reserved).toBe(usdToMicroDollars(6));
  });

  test("never breaches an uncapped budget", () => {
    store.open(SCOPE, null);

    expect(store.reserve(SCOPE, usdToMicroDollars(10_000)).exceedsCap).toBe(false);
  });

  test("reserving exactly the cap does not breach it", () => {
    store.open(SCOPE, CAP);

    expect(store.reserve(SCOPE, CAP).exceedsCap).toBe(false);
  });

  test("throws when no budget was opened, rather than silently not enforcing", () => {
    expect(() => store.reserve(SCOPE, usdToMicroDollars(1))).toThrow(/no budget open/);
  });
});

describe("settle", () => {
  test("replaces the estimate with the real cost", () => {
    store.open(SCOPE, CAP);
    const { reservation } = store.reserve(SCOPE, usdToMicroDollars(2));

    const state = store.settle(reservation.id, usdToMicroDollars(1.5));

    expect(state.reserved).toBe(ZERO_MICRO_DOLLARS);
    expect(state.settled).toBe(usdToMicroDollars(1.5));
    expect(budgetRemaining(state)).toBe(usdToMicroDollars(3.5));
  });

  test("accepts an actual cost above the estimate", () => {
    store.open(SCOPE, CAP);
    const { reservation } = store.reserve(SCOPE, usdToMicroDollars(1));

    const state = store.settle(reservation.id, usdToMicroDollars(4));

    expect(budgetSpent(state)).toBe(usdToMicroDollars(4));
  });

  // Silently ignoring would drop the hold without recording cost, under-reporting spend.
  test("throws when settled twice", () => {
    store.open(SCOPE, CAP);
    const { reservation } = store.reserve(SCOPE, usdToMicroDollars(1));
    store.settle(reservation.id, usdToMicroDollars(1));

    expect(() => store.settle(reservation.id, usdToMicroDollars(1))).toThrow(/unknown/);
  });
});

describe("release", () => {
  test("returns the estimate for a call that never ran", () => {
    store.open(SCOPE, CAP);
    const { reservation } = store.reserve(SCOPE, usdToMicroDollars(2));

    const state = store.release(reservation.id);

    expect(budgetSpent(state)).toBe(ZERO_MICRO_DOLLARS);
    expect(budgetRemaining(state)).toBe(CAP);
  });

  test("leaves other reservations untouched", () => {
    store.open(SCOPE, CAP);
    const first = store.reserve(SCOPE, usdToMicroDollars(1)).reservation;
    store.reserve(SCOPE, usdToMicroDollars(2));

    const state = store.release(first.id);

    expect(state.reserved).toBe(usdToMicroDollars(2));
  });
});

describe("pool isolation", () => {
  test("separate runs do not share a budget", () => {
    store.open({ runId: "run_1", budgetKey: "a" }, CAP);
    store.open({ runId: "run_2", budgetKey: "a" }, CAP);
    store.reserve({ runId: "run_1", budgetKey: "a" }, usdToMicroDollars(4));

    const other = store.read({ runId: "run_2", budgetKey: "a" });

    expect(other?.reserved).toBe(ZERO_MICRO_DOLLARS);
  });

  // §2.2: several agents in one run declaring the same key draw on one allowance.
  test("one run's agents sharing a key share a pool", () => {
    const shared: BudgetScope = { runId: "run_1", budgetKey: "shared-pool" };
    store.open(shared, CAP);

    store.reserve(shared, usdToMicroDollars(2));
    const outcome = store.reserve(shared, usdToMicroDollars(2));

    expect(outcome.state.reserved).toBe(usdToMicroDollars(4));
  });
});

/**
 * The failure this ledger exists to prevent: parallel tool calls each reading the same untouched
 * remainder, all deciding they fit, and collectively spending several times the cap.
 */
describe("concurrency", () => {
  test("parallel reservations cannot share one remainder", async () => {
    store.open(SCOPE, CAP);
    const each = usdToMicroDollars(0.5);

    const outcomes = await Promise.all(
      Array.from({ length: 50 }, () => Promise.resolve().then(() => store.reserve(SCOPE, each))),
    );

    // Nothing is lost: every reservation is held.
    expect(outcomes.at(-1)?.state.reserved).toBe(usdToMicroDollars(25));
    // And exactly the first ten fit inside the $5 cap — no two saw the same headroom.
    expect(outcomes.filter((outcome) => !outcome.exceedsCap)).toHaveLength(10);
  });

  test("every parallel reservation gets a distinct id", async () => {
    store.open(SCOPE, CAP);

    const outcomes = await Promise.all(
      Array.from({ length: 100 }, () =>
        Promise.resolve().then(() => store.reserve(SCOPE, usdToMicroDollars(0.01))),
      ),
    );

    expect(new Set(outcomes.map((outcome) => outcome.reservation.id)).size).toBe(100);
  });

  test("interleaved settles and releases leave an exact total", async () => {
    store.open(SCOPE, null);
    const outcomes = Array.from({ length: 20 }, () => store.reserve(SCOPE, usdToMicroDollars(1)));

    await Promise.all(
      outcomes.map((outcome, index) =>
        Promise.resolve().then(() =>
          index % 2 === 0
            ? store.settle(outcome.reservation.id, usdToMicroDollars(0.75))
            : store.release(outcome.reservation.id),
        ),
      ),
    );

    const state = store.read(SCOPE);
    expect(state?.reserved).toBe(ZERO_MICRO_DOLLARS);
    expect(state?.settled).toBe(usdToMicroDollars(7.5));
  });
});

describe("lifecycle", () => {
  test("close frees the pool", () => {
    store.open(SCOPE, CAP);
    store.close(SCOPE);

    expect(store.read(SCOPE)).toBeUndefined();
  });

  test("closing an unknown run is harmless", () => {
    expect(() => store.close(SCOPE)).not.toThrow();
  });

  test("a reservation cannot outlive its closed pool", () => {
    store.open(SCOPE, CAP);
    const { reservation } = store.reserve(SCOPE, usdToMicroDollars(1));
    store.close(SCOPE);

    expect(() => store.settle(reservation.id, usdToMicroDollars(1))).toThrow(/unknown/);
  });

  // A run that throws before close would otherwise leak its pool forever.
  test("evicts the oldest pool rather than growing without bound", () => {
    const bounded = createInMemoryBudgetStore({ maxTrackedRuns: 3 });
    for (let index = 0; index < 5; index += 1) {
      bounded.open({ runId: `run_${index}`, budgetKey: "a" }, CAP);
    }

    expect(bounded.read({ runId: "run_0", budgetKey: "a" })).toBeUndefined();
    expect(bounded.read({ runId: "run_4", budgetKey: "a" })).toBeDefined();
  });

  test("eviction does not strand reservation ids", () => {
    const bounded = createInMemoryBudgetStore({ maxTrackedRuns: 1 });
    bounded.open({ runId: "run_a", budgetKey: "k" }, CAP);
    const { reservation } = bounded.reserve({ runId: "run_a", budgetKey: "k" }, CAP);

    bounded.open({ runId: "run_b", budgetKey: "k" }, CAP);

    expect(() => bounded.settle(reservation.id, CAP)).toThrow(/unknown/);
  });
});
