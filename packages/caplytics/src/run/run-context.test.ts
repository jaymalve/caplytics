import { describe, expect, test } from "bun:test";
import { currentRun, newRunId, type RunContext, withRun } from "./run-context.js";

function context(overrides: Partial<RunContext> = {}): RunContext {
  return {
    runId: newRunId(),
    budgetKey: "support-agent",
    metadata: {},
    startedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("newRunId", () => {
  test("is unique across calls", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newRunId()));

    expect(ids.size).toBe(1000);
  });

  test("is prefixed, so a run is identifiable in a log line", () => {
    expect(newRunId()).toMatch(/^run_[0-9a-f-]{36}$/);
  });
});

describe("withRun", () => {
  test("exposes the context to everything it calls", () => {
    const ctx = context();

    const seen = withRun(ctx, () => currentRun());

    expect(seen).toBe(ctx);
  });

  test("returns the callback's value", () => {
    expect(withRun(context(), () => 42)).toBe(42);
  });

  test("reaches through async boundaries", async () => {
    const ctx = context();

    const seen = await withRun(ctx, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return currentRun()?.runId;
    });

    expect(seen).toBe(ctx.runId);
  });

  test("does not leak outside its callback", () => {
    withRun(context(), () => currentRun());

    expect(currentRun()).toBeUndefined();
  });

  test("restores the outer context after a nested run", () => {
    const outer = context({ budgetKey: "outer" });

    const seen = withRun(outer, () => {
      withRun(context({ budgetKey: "inner" }), () => currentRun());
      return currentRun()?.budgetKey;
    });

    expect(seen).toBe("outer");
  });

  // A sub-agent spawned from a tool runs inside its parent; the innermost context is the one that
  // owns the call being made.
  test("a nested run shadows its parent", () => {
    const seen = withRun(context({ budgetKey: "outer" }), () =>
      withRun(context({ budgetKey: "inner" }), () => currentRun()?.budgetKey),
    );

    expect(seen).toBe("inner");
  });

  test("survives a throw without leaking the context", () => {
    expect(() =>
      withRun(context(), () => {
        throw new Error("run failed");
      }),
    ).toThrow("run failed");

    expect(currentRun()).toBeUndefined();
  });
});

/**
 * The reason this is AsyncLocalStorage and not a module-level "current run" variable: concurrent
 * runs interleave at every await, and a shared slot would attribute one run's spend to another.
 */
test("concurrent runs do not see each other's context", async () => {
  const observed = await Promise.all(
    ["run-a", "run-b", "run-c"].map((budgetKey, index) =>
      withRun(context({ budgetKey }), async () => {
        // Stagger the resumption order so the runs genuinely interleave.
        await new Promise((resolve) => setTimeout(resolve, (3 - index) * 10));
        return currentRun()?.budgetKey;
      }),
    ),
  );

  expect(observed).toEqual(["run-a", "run-b", "run-c"]);
});

test("carries metadata for the call sites that merge it", () => {
  const seen = withRun(context({ metadata: { customerId: "cus_18213" } }), () => currentRun());

  expect(seen?.metadata.customerId).toBe("cus_18213");
});

test("currentRun is undefined outside any run", () => {
  expect(currentRun()).toBeUndefined();
});
