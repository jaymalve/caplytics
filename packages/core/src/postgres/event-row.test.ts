import { describe, expect, test } from "bun:test";
import { usdToMicroDollars } from "../money/micro-dollars.js";
import { toCaplyticsEvent } from "./event-row.js";

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    timestamp: "2026-08-01T10:00:00.000Z",
    run_id: "run_1",
    agent_id: "support-agent",
    type: "model_call",
    name: "claude-opus-4-8",
    cost_estimate: "5700",
    cost_actual: "5700",
    price_unknown: false,
    tokens_in: 1000,
    tokens_out: 100,
    budget_remaining: "994300",
    metadata: { customerId: "cus_18213" },
    ...overrides,
  };
}

/**
 * Drivers disagree, and the query layer absorbs it rather than every call site guessing. Both
 * shapes were observed against a real database in PR 13.
 */
describe("driver differences", () => {
  test("accepts BIGINT as a string, which is how pg returns it", () => {
    const event = toCaplyticsEvent(row({ cost_actual: "5700" }));

    expect(event.costActual).toBe(usdToMicroDollars(0.0057));
  });

  test.each([5700, BigInt(5700)])("accepts BIGINT as %p", (cost_actual) => {
    expect(toCaplyticsEvent(row({ cost_actual })).costActual).toBe(usdToMicroDollars(0.0057));
  });

  test("accepts jsonb already parsed into an object", () => {
    const event = toCaplyticsEvent(row({ metadata: { channel: "chat" } }));

    expect(event.metadata).toEqual({ channel: "chat" });
  });

  test("accepts jsonb as raw text, which is how Bun's SQL returns it", () => {
    const event = toCaplyticsEvent(row({ metadata: '{"channel":"chat"}' }));

    expect(event.metadata).toEqual({ channel: "chat" });
  });

  test("accepts a timestamp as a Date or a string", () => {
    const asDate = toCaplyticsEvent(row({ timestamp: new Date("2026-08-01T10:00:00.000Z") }));
    const asString = toCaplyticsEvent(row({ timestamp: "2026-08-01T10:00:00.000Z" }));

    expect(asDate.timestamp).toBe(asString.timestamp);
  });
});

describe("nullable columns", () => {
  test("a null budget_remaining becomes null, meaning an uncapped run", () => {
    expect(toCaplyticsEvent(row({ budget_remaining: null })).budgetRemaining).toBeNull();
  });

  // Absent is different from zero: a tool call has no tokens of its own to report.
  test("null token counts are omitted rather than reported as zero", () => {
    const event = toCaplyticsEvent(row({ tokens_in: null, tokens_out: null }));

    expect(event.tokensIn).toBeUndefined();
    expect(event.tokensOut).toBeUndefined();
  });
});

/**
 * Re-validated against the same schema the SDK emits against, so a drifted column or a hand-edited
 * row fails here rather than surfacing as a wrong number in a dashboard cell (§9.2).
 */
describe("rejects rows that are not events", () => {
  test.each([
    ["an unknown type", { type: "sub_agent_call" }],
    ["a negative cost", { cost_actual: "-1" }],
    ["a non-uuid id", { id: "1" }],
    ["an empty run id", { run_id: "" }],
    ["a missing column", { price_unknown: undefined }],
    ["non-string metadata values", { metadata: { retries: 3 } }],
  ])("%s", (_case, override) => {
    expect(() => toCaplyticsEvent(row(override))).toThrow();
  });

  test("a malformed jsonb payload", () => {
    expect(() => toCaplyticsEvent(row({ metadata: "{ not json" }))).toThrow();
  });
});

test("round-trips a complete row", () => {
  const event = toCaplyticsEvent(row());

  expect(event.agentId).toBe("support-agent");
  expect(event.type).toBe("model_call");
  expect(event.tokensIn).toBe(1000);
  expect(event.metadata).toEqual({ customerId: "cus_18213" });
});
