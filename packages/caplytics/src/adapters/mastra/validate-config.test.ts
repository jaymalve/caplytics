import { describe, expect, test } from "bun:test";
import type { AnyAgent, CaplyticsConfig } from "./agent-types.js";
import { validateConfig } from "./validate-config.js";

function check(config: CaplyticsConfig<AnyAgent>): () => void {
  return () => validateConfig(config);
}

describe("cap", () => {
  test.each(["unlimited" as const, 0.01, 5, 1000])("accepts %p", (cap) => {
    expect(check({ cap })).not.toThrow();
  });

  test("accepts an omitted cap, which falls back to the default", () => {
    expect(check({})).not.toThrow();
  });

  // Zero blocks the first call under `block`, and warns forever while spending freely under `warn`.
  test.each([0, -1, -0.5])("rejects %p", (cap) => {
    expect(check({ cap })).toThrow(/greater than zero/);
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY])("rejects %p", (cap) => {
    expect(check({ cap })).toThrow(/finite/);
  });

  // Opting out of spend control should be a visible, greppable choice rather than a magic number.
  test("points at the explicit opt-out rather than just refusing", () => {
    expect(check({ cap: 0 })).toThrow(/"unlimited"/);
  });
});

describe("budget key", () => {
  test("accepts a real key", () => {
    expect(check({ budget: "shared-pool" })).not.toThrow();
  });

  test.each(["", "   "])("rejects %p, which would group nothing", (budget) => {
    expect(check({ budget })).toThrow(/non-empty key/);
  });

  test("says to omit it rather than pass a placeholder", () => {
    expect(check({ budget: "" })).toThrow(/agent's id/);
  });
});

describe("tool budgets", () => {
  test("accepts a positive cap and cost", () => {
    expect(check({ tools: { refundTool: { cap: 1, cost: 0.005 } } })).not.toThrow();
  });

  test.each([0, -1])("rejects a cap of %p", (cap) => {
    expect(check({ tools: { refundTool: { cap } } })).toThrow(/greater than zero/);
  });

  test("names the offending tool", () => {
    expect(check({ tools: { refundTool: { cap: 0 } } })).toThrow(/refundTool/);
  });

  // A negative declared cost would credit the budget, letting a tool fund the run.
  test("rejects a negative declared cost", () => {
    expect(check({ tools: { refundTool: { cap: 1, cost: -0.01 } } })).toThrow(/credit the budget/);
  });

  test("accepts a zero declared cost, which simply charges nothing", () => {
    expect(check({ tools: { refundTool: { cap: 1, cost: 0 } } })).not.toThrow();
  });
});

describe("metadata", () => {
  test("accepts string values", () => {
    expect(check({ metadata: { customerId: "cus_18213", channel: "chat" } })).not.toThrow();
  });

  test("rejects an empty key", () => {
    expect(check({ metadata: { "": "value" } })).toThrow(/non-empty/);
  });

  // §6.1: values are queried as strings. A number survives an untyped JS call site and then fails
  // when the event is persisted, long after the call that produced it.
  test("rejects a non-string value at the call site rather than at persistence", () => {
    expect(check({ metadata: { retries: 3 as unknown as string } })).toThrow(/must be a string/);
  });

  test("names the offending key", () => {
    expect(check({ metadata: { retries: 3 as unknown as string } })).toThrow(/retries/);
  });
});

describe("degrade ladder", () => {
  // §5.1's rule, applied through the same entry point so one call validates the whole config.
  test("rejects a ladder with no headroom when the policy blocks", () => {
    expect(check({ onLimit: "block", degrade: [{ at: 0.95, maxTokens: 500 }] })).toThrow(/no room/);
  });

  test("accepts the same ladder when the policy only warns", () => {
    expect(check({ onLimit: "warn", degrade: [{ at: 0.95, maxTokens: 500 }] })).not.toThrow();
  });

  test("treats an omitted policy as warn, since that is the default", () => {
    expect(check({ degrade: [{ at: 0.95, maxTokens: 500 }] })).not.toThrow();
  });
});

test("an empty config is valid — zero-config is the documented path", () => {
  expect(check({})).not.toThrow();
});
