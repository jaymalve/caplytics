import { describe, expect, test } from "bun:test";
import { usdToMicroDollars, ZERO_MICRO_DOLLARS } from "../money/micro-dollars.js";
import {
  type BudgetState,
  budgetRemaining,
  budgetSpent,
  budgetUsedFraction,
  scopeId,
} from "./budget-state.js";

function state(overrides: Partial<BudgetState> = {}): BudgetState {
  return {
    scope: { runId: "run_1", budgetKey: "support-agent" },
    cap: usdToMicroDollars(5),
    settled: ZERO_MICRO_DOLLARS,
    reserved: ZERO_MICRO_DOLLARS,
    ...overrides,
  };
}

describe("budgetSpent", () => {
  // If in-flight reservations did not count, every parallel call would read the same untouched
  // remainder and they would collectively overshoot the cap.
  test("counts in-flight reservations alongside settled cost", () => {
    const spent = budgetSpent(
      state({ settled: usdToMicroDollars(1), reserved: usdToMicroDollars(0.5) }),
    );

    expect(spent).toBe(usdToMicroDollars(1.5));
  });

  test("is zero for an untouched budget", () => {
    expect(budgetSpent(state())).toBe(ZERO_MICRO_DOLLARS);
  });
});

describe("budgetRemaining", () => {
  test("subtracts everything committed or promised", () => {
    const remaining = budgetRemaining(
      state({ settled: usdToMicroDollars(3), reserved: usdToMicroDollars(1) }),
    );

    expect(remaining).toBe(usdToMicroDollars(1));
  });

  // §4.2 requires reporting spend at stop time, not the configured cap.
  test("goes negative on overspend rather than clamping", () => {
    const remaining = budgetRemaining(state({ settled: usdToMicroDollars(5.02) }));

    expect(remaining).toBe(usdToMicroDollars(-0.02));
  });

  test("is null for an uncapped run, which has no remainder to report", () => {
    expect(budgetRemaining(state({ cap: null, settled: usdToMicroDollars(500) }))).toBeNull();
  });
});

describe("budgetUsedFraction", () => {
  test.each([
    [0, 0],
    [2.5, 0.5],
    [5, 1],
    [6, 1.2],
  ])("reports %p spent of a $5 cap as %p", (spentUsd, expected) => {
    expect(budgetUsedFraction(state({ settled: usdToMicroDollars(spentUsd) }))).toBe(expected);
  });

  test("is null for an uncapped run, so no degradation rung applies", () => {
    expect(budgetUsedFraction(state({ cap: null }))).toBeNull();
  });

  // A zero cap has no ratio; handing the §5 ladder a NaN would make every comparison false and
  // silently disable degradation.
  test("handles a zero cap without producing NaN", () => {
    expect(budgetUsedFraction(state({ cap: ZERO_MICRO_DOLLARS }))).toBe(0);
    expect(
      budgetUsedFraction(state({ cap: ZERO_MICRO_DOLLARS, settled: usdToMicroDollars(1) })),
    ).toBe(1);
  });
});

describe("scopeId", () => {
  test("separates runs from one another", () => {
    expect(scopeId({ runId: "run_1", budgetKey: "a" })).not.toBe(
      scopeId({ runId: "run_2", budgetKey: "a" }),
    );
  });

  test("separates budget keys within one run", () => {
    expect(scopeId({ runId: "run_1", budgetKey: "a" })).not.toBe(
      scopeId({ runId: "run_1", budgetKey: "b" }),
    );
  });

  // Two agents in one run declaring the same key draw on one pool, per §2.2.
  test("is stable, so a shared key shares a pool", () => {
    expect(scopeId({ runId: "run_1", budgetKey: "shared" })).toBe(
      scopeId({ runId: "run_1", budgetKey: "shared" }),
    );
  });

  // budgetKey is user-supplied, so a key spelling the separator must not reach another run's pool.
  test.each([
    [
      { runId: "run_1:support", budgetKey: "agent" },
      { runId: "run_1", budgetKey: "support:agent" },
    ],
    [
      { runId: "run", budgetKey: "1:a" },
      { runId: "run:1", budgetKey: "a" },
    ],
  ])("cannot be forged by a key spelling the separator (%p vs %p)", (left, right) => {
    expect(scopeId(left)).not.toBe(scopeId(right));
  });
});
