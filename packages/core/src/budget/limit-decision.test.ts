import { describe, expect, test } from "bun:test";
import { usdToMicroDollars, ZERO_MICRO_DOLLARS } from "../money/micro-dollars.js";
import type { BudgetState } from "./budget-state.js";
import { decideLimit, isExhausted } from "./limit-decision.js";

function state(spentUsd: number, capUsd: number | null): BudgetState {
  return {
    scope: { runId: "run_1", budgetKey: "support-agent" },
    cap: capUsd === null ? null : usdToMicroDollars(capUsd),
    settled: usdToMicroDollars(spentUsd),
    reserved: ZERO_MICRO_DOLLARS,
  };
}

describe("within budget", () => {
  test.each(["warn", "block", "degrade"] as const)("allows under any policy (%s)", (policy) => {
    expect(decideLimit(state(2, 5), policy)).toBe("allow");
  });

  test("allows right up to the cap", () => {
    expect(decideLimit(state(4.99, 5), "block")).toBe("allow");
  });
});

describe("exhausted", () => {
  test("blocks under `block`", () => {
    expect(decideLimit(state(5, 5), "block")).toBe("block");
  });

  // §10 item 2: a new agent should never silently die on its first run.
  test("only warns under `warn`", () => {
    expect(decideLimit(state(5, 5), "warn")).toBe("warn");
  });

  // Silently upgrading a soft policy to a hard stop would kill runs nobody asked to kill.
  test("degrade warns rather than blocking until §5's ladder lands", () => {
    expect(decideLimit(state(6, 5), "degrade")).toBe("warn");
  });

  test("treats exactly-at-cap as exhausted, since the next call cannot fit", () => {
    expect(decideLimit(state(5, 5), "block")).toBe("block");
    expect(isExhausted(state(5, 5))).toBe(true);
  });

  test("stays blocked once overspent", () => {
    expect(decideLimit(state(5.02, 5), "block")).toBe("block");
  });
});

describe("uncapped", () => {
  test.each(["warn", "block", "degrade"] as const)("never limits (%s)", (policy) => {
    expect(decideLimit(state(10_000, null), policy)).toBe("allow");
  });

  test("is never exhausted", () => {
    expect(isExhausted(state(10_000, null))).toBe(false);
  });
});

describe("a zero cap", () => {
  test("blocks immediately, which is what asking for zero means", () => {
    expect(decideLimit(state(0, 0), "block")).toBe("block");
  });
});
