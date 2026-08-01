import { beforeEach, describe, expect, test } from "bun:test";
import { type CaplyticsEvent, toPriceTable } from "@caplytics/core";
import { Agent } from "@mastra/core/agent";
import { createCaplytics } from "../../caplytics.js";
import { staticPriceSource } from "../../pricing/price-source.js";
import { createRequestContext, mergeMetadata, readCallMetadata } from "./call-metadata.js";
import { resetRunIdentityWarning } from "./run-identity.js";

const TABLE = toPriceTable(
  { "stub-model": { mode: "chat", input_cost_per_token: 1e-6, output_cost_per_token: 1e-6 } },
  { fetchedAt: "2026-08-01T00:00:00.000Z", source: "test" },
);

function buildAgent() {
  const model = {
    specificationVersion: "v2" as const,
    provider: "stub",
    modelId: "stub-model",
    supportedUrls: {},
    async doGenerate() {
      return {
        content: [{ type: "text" as const, text: "done" }],
        finishReason: "stop" as const,
        usage: { inputTokens: 100, outputTokens: 10 },
        warnings: [],
      };
    },
    async doStream() {
      throw new Error("unused");
    },
  };
  return new Agent({
    id: "support-agent",
    name: "support-agent",
    instructions: "test",
    model: model as never,
  });
}

async function setup() {
  const instance = createCaplytics({
    priceSource: staticPriceSource(TABLE),
    onHandlerError: () => {},
  });
  await instance.warmPricing();
  const events: CaplyticsEvent[] = [];
  instance.on("support-agent", (event) => {
    events.push(event);
  });
  return { instance, events };
}

beforeEach(() => {
  resetRunIdentityWarning();
});

describe("mergeMetadata", () => {
  // §6.1: "Two levels, merged, not exclusive."
  test("keeps agent-level defaults alongside per-call keys", () => {
    expect(
      mergeMetadata({ category: "customer-support" }, undefined, { customerId: "cus_18213" }),
    ).toEqual({ category: "customer-support", customerId: "cus_18213" });
  });

  test("per-call wins over agent-level for the same key", () => {
    expect(mergeMetadata({ channel: "email" }, undefined, { channel: "chat" })).toEqual({
      channel: "chat",
    });
  });

  test("run-level sits between the two", () => {
    expect(mergeMetadata({ tier: "a" }, { tier: "b" }, { tier: "c" })).toEqual({ tier: "c" });
    expect(mergeMetadata({ tier: "a" }, { tier: "b" }, {})).toEqual({ tier: "b" });
  });

  test("an absent level contributes nothing", () => {
    expect(mergeMetadata(undefined, undefined, {})).toEqual({});
  });
});

describe("readCallMetadata", () => {
  test("round-trips through a request context", () => {
    const context = createRequestContext({ customerId: "cus_18213" }, "run_1");

    expect(readCallMetadata(context)).toEqual({ customerId: "cus_18213" });
  });

  // Narrowed at the boundary (§9.2): junk yields nothing rather than propagating inward.
  test.each([undefined, null, {}, "not a context", 42])("yields nothing for %p", (input) => {
    expect(readCallMetadata(input)).toEqual({});
  });

  test("yields nothing for a malformed payload rather than throwing", () => {
    const context = { get: () => "{ not json" };

    expect(readCallMetadata(context)).toEqual({});
  });

  test("rejects non-string values that slipped past typing", () => {
    const context = { get: () => JSON.stringify({ retries: 3 }) };

    expect(readCallMetadata(context)).toEqual({});
  });
});

describe("metadata reaches the event", () => {
  test("agent-level metadata is attached to every call", async () => {
    const { instance, events } = await setup();
    const agent = instance.attach(buildAgent(), { metadata: { category: "customer-support" } });

    await instance.run(() => agent.generate("hi"));

    expect(events[0]?.metadata).toEqual({ category: "customer-support" });
  });

  test("run-level metadata merges over agent-level", async () => {
    const { instance, events } = await setup();
    const agent = instance.attach(buildAgent(), { metadata: { category: "support" } });

    await instance.run(() => agent.generate("hi"), { metadata: { customerId: "cus_1" } });

    expect(events[0]?.metadata).toEqual({ category: "support", customerId: "cus_1" });
  });

  // §6.1's worked example: an agent-level default plus per-call business data.
  test("per-call metadata merges over both", async () => {
    const { instance, events } = await setup();
    const agent = instance.attach(buildAgent(), { metadata: { category: "customer-support" } });

    await agent.generate("hi", {
      requestContext: instance.context({ customerId: "cus_18213", channel: "chat" }),
    } as never);

    expect(events[0]?.metadata).toEqual({
      category: "customer-support",
      customerId: "cus_18213",
      channel: "chat",
    });
  });

  // The context carries run identity too, so passing it groups calls without run().
  test("a caller-supplied context scopes the run as well", async () => {
    const { instance, events } = await setup();
    const agent = instance.attach(buildAgent());
    const context = instance.context({ customerId: "cus_1" });

    await agent.generate("one", { requestContext: context } as never);
    await agent.generate("two", { requestContext: context } as never);

    expect(new Set(events.map((event) => event.runId)).size).toBe(1);
  });

  test("a call with no metadata anywhere records an empty object, not undefined", async () => {
    const { instance, events } = await setup();
    const agent = instance.attach(buildAgent());

    await instance.run(() => agent.generate("hi"));

    expect(events[0]?.metadata).toEqual({});
  });
});
