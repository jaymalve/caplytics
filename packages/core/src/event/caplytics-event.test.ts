import { describe, expect, test } from "bun:test";
import { usdToMicroDollars } from "../money/micro-dollars.js";
import { type CaplyticsEvent, caplyticsEventSchema } from "./caplytics-event.js";

function validEvent(): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    runId: "run_1",
    agentId: "support-agent",
    type: "model_call",
    name: "anthropic/claude-sonnet-5",
    costEstimate: usdToMicroDollars(0.012),
    costActual: usdToMicroDollars(0.0134),
    priceUnknown: false,
    tokensIn: 1200,
    tokensOut: 340,
    budgetRemaining: usdToMicroDollars(4.98),
    timestamp: "2026-07-31T10:00:00.000Z",
    metadata: { customerId: "cus_18213", channel: "chat" },
  };
}

test("accepts a complete model_call event", () => {
  const parsed = caplyticsEventSchema.parse(validEvent());

  expect(parsed.type).toBe("model_call");
  expect(parsed.costActual).toBe(usdToMicroDollars(0.0134));
});

test("token counts are optional, because a tool_call has none of its own", () => {
  const { tokensIn: _in, tokensOut: _out, ...event } = validEvent();

  const parsed = caplyticsEventSchema.parse({ ...event, type: "tool_call", name: "refundTool" });

  expect(parsed.tokensIn).toBeUndefined();
});

test("budgetRemaining may be negative, recording a run that overspent", () => {
  const parsed = caplyticsEventSchema.parse({
    ...validEvent(),
    budgetRemaining: usdToMicroDollars(-0.02),
  });

  expect(Number(parsed.budgetRemaining)).toBe(-20_000);
});

describe("rejects", () => {
  test.each([
    ["a negative cost", { costActual: -1 }],
    ["a float cost, which would drift when summed", { costActual: 1.5 }],
    ["an unknown call type", { type: "sub_agent_call" }],
    ["a non-ISO timestamp", { timestamp: "31/07/2026" }],
    ["a non-uuid id", { id: "1" }],
    ["an empty runId", { runId: "" }],
    ["non-string metadata values", { metadata: { customerId: 18213 } }],
    ["fractional token counts", { tokensIn: 1.5 }],
  ])("%s", (_case, override) => {
    expect(caplyticsEventSchema.safeParse({ ...validEvent(), ...override }).success).toBe(false);
  });

  test.each(["id", "runId", "agentId", "type", "name", "priceUnknown", "metadata"])(
    "a missing %s",
    (field) => {
      const { [field]: _omitted, ...incomplete } = validEvent();

      expect(caplyticsEventSchema.safeParse(incomplete).success).toBe(false);
    },
  );
});

test("priceUnknown is required, so an unpriced call cannot masquerade as a free one", () => {
  const { priceUnknown: _flag, ...event } = validEvent();

  expect(caplyticsEventSchema.safeParse(event).success).toBe(false);
});

// The schema is the boundary narrowing point required by §9.2: unknown in, concrete type out.
test("narrows unknown input to CaplyticsEvent", () => {
  const fromDatabase: unknown = validEvent();

  const event: CaplyticsEvent = caplyticsEventSchema.parse(fromDatabase);

  expect(event.agentId).toBe("support-agent");
});
