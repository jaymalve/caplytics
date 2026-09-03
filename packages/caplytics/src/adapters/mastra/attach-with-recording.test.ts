import { beforeEach, describe, expect, test } from "bun:test";
import { type CaplyticsEvent, toPriceTable, usdToMicroDollars } from "@caplytics/core";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createCaplytics } from "../../caplytics.js";
import { staticPriceSource } from "../../pricing/price-source.js";
import { resetRunIdentityWarning } from "./run-identity.js";

const TABLE = toPriceTable(
  {
    "stub-model": {
      mode: "chat",
      input_cost_per_token: 0.000005,
      output_cost_per_token: 0.000025,
      cache_read_input_token_cost: 5e-7,
    },
  },
  { fetchedAt: "2026-08-01T00:00:00.000Z", source: "test" },
);

function stubModel({ toolCall = false }: { toolCall?: boolean } = {}) {
  let calls = 0;
  return {
    specificationVersion: "v2" as const,
    provider: "stub",
    modelId: "stub-model",
    supportedUrls: {},
    async doGenerate() {
      calls += 1;
      const wantsTool = toolCall && calls === 1;
      return {
        content: wantsTool
          ? [
              {
                type: "tool-call" as const,
                toolCallId: "c1",
                toolName: "echoTool",
                input: "{}",
              },
            ]
          : [{ type: "text" as const, text: "done" }],
        finishReason: wantsTool ? ("tool-calls" as const) : ("stop" as const),
        usage: { inputTokens: 1000, outputTokens: 100, cachedInputTokens: 400 },
        warnings: [],
      };
    },
    async doStream() {
      throw new Error("unused");
    },
  };
}

function buildAgent(toolCall: boolean, result: unknown = { echoed: "hi" }) {
  const echoTool = createTool({
    id: "echoTool",
    description: "Echoes",
    inputSchema: z.object({}),
    execute: async () => result,
  });
  return new Agent({
    id: "support-agent",
    name: "support-agent",
    instructions: "test",
    model: stubModel({ toolCall }) as never,
    tools: { echoTool },
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

describe("one event per call", () => {
  test("a model call emits exactly one event", async () => {
    const { instance, events } = await setup();
    const agent = instance.attach(buildAgent(false));

    await instance.run(() => agent.generate("hi"));

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("model_call");
    expect(events[0]?.name).toBe("stub-model");
  });

  test("a run with a tool emits one event per model call plus one per tool call", async () => {
    const { instance, events } = await setup();
    const agent = instance.attach(buildAgent(true));

    await instance.run(() => agent.generate("use the tool"));

    expect(events.map((event) => event.type)).toEqual(["model_call", "tool_call", "model_call"]);
  });

  test("every event validates against the §3 schema", async () => {
    const { instance, events } = await setup();
    const agent = instance.attach(buildAgent(true));

    await instance.run(() => agent.generate("use the tool"));

    for (const event of events) {
      expect(event.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(event.agentId).toBe("support-agent");
      expect(event.runId).toMatch(/^run_/);
    }
  });
});

describe("costing", () => {
  // 600 uncached at $5/M ($0.0030) + 400 cached at $0.50/M ($0.0002) + 100 out at $25/M ($0.0025).
  test("prices a model call from real usage, honouring the cache split", async () => {
    const { instance, events } = await setup();
    const agent = instance.attach(buildAgent(false));

    await instance.run(() => agent.generate("hi"));

    expect(events[0]?.costActual).toBe(usdToMicroDollars(0.0057));
    expect(events[0]?.priceUnknown).toBe(false);
  });

  test("reports token counts on the model event", async () => {
    const { instance, events } = await setup();
    const agent = instance.attach(buildAgent(false));

    await instance.run(() => agent.generate("hi"));

    expect(events[0]?.tokensIn).toBe(1000);
    expect(events[0]?.tokensOut).toBe(100);
  });

  /**
   * The correction in architecture/tool-cost-derivation.md: a tool's result tokens are billed as
   * input on the *following* model call, which is already priced in full. Charging them here too
   * would count the same tokens twice and make the ledger disagree with the invoice.
   */
  test("a tool consumes no budget for its result tokens", async () => {
    const { instance, events } = await setup();
    const agent = instance.attach(buildAgent(true));

    await instance.run(() => agent.generate("use the tool"));

    const toolEvent = events.find((event) => event.type === "tool_call");
    expect(toolEvent?.costActual).toBe(usdToMicroDollars(0));
  });

  test("but still reports them, so a chatty tool is attributable", async () => {
    const { instance, events } = await setup();
    const agent = instance.attach(
      buildAgent(true, { rows: Array.from({ length: 200 }, (_, i) => ({ id: i })) }),
    );

    await instance.run(() => agent.generate("use the tool"));

    const toolEvent = events.find((event) => event.type === "tool_call");
    expect(toolEvent?.tokensIn ?? 0).toBeGreaterThan(100);
  });

  test("a tool's declared external cost does consume budget", async () => {
    const { instance, events } = await setup();
    const agent = instance.attach(buildAgent(true), {
      tools: { echoTool: { cap: 1, cost: 0.005 } },
    });

    await instance.run(() => agent.generate("use the tool"));

    const toolEvent = events.find((event) => event.type === "tool_call");
    expect(toolEvent?.costActual).toBe(usdToMicroDollars(0.005));
  });

  test("an unpriced model reports priceUnknown rather than zero cost", async () => {
    const instance = createCaplytics({ onHandlerError: () => {} });
    const events: CaplyticsEvent[] = [];
    instance.on("support-agent", (event) => {
      events.push(event);
    });
    const agent = instance.attach(buildAgent(false));

    await instance.run(() => agent.generate("hi"));

    expect(events[0]?.priceUnknown).toBe(true);
    expect(events[0]?.costActual).toBe(usdToMicroDollars(0));
  });
});

describe("run grouping", () => {
  test("calls in one run share a runId and draw down one budget", async () => {
    const { instance, events } = await setup();
    const agent = instance.attach(buildAgent(true));

    await instance.run(() => agent.generate("use the tool"));

    const runIds = new Set(events.map((event) => event.runId));
    expect(runIds.size).toBe(1);

    // The second model call sees less remaining than the first: spend accumulated across the run.
    const models = events.filter((event) => event.type === "model_call");
    expect(Number(models[1]?.budgetRemaining)).toBeLessThan(Number(models[0]?.budgetRemaining));
  });

  test("separate runs get separate budgets", async () => {
    const { instance, events } = await setup();
    const agent = instance.attach(buildAgent(false));

    await instance.run(() => agent.generate("one"));
    await instance.run(() => agent.generate("two"));

    expect(new Set(events.map((event) => event.runId)).size).toBe(2);
    expect(events[0]?.budgetRemaining).toBe(events[1]?.budgetRemaining);
  });

  test("defaults to a $1 cap when none is configured", async () => {
    const { instance, events } = await setup();
    const agent = instance.attach(buildAgent(false));

    await instance.run(() => agent.generate("hi"));

    expect(Number(events[0]?.budgetRemaining)).toBe(
      Number(usdToMicroDollars(1)) - Number(usdToMicroDollars(0.0057)),
    );
  });

  test("an uncapped run reports no remainder rather than zero", async () => {
    const { instance, events } = await setup();
    const agent = instance.attach(buildAgent(false), { cap: "unlimited" });

    await instance.run(() => agent.generate("hi"));

    expect(events[0]?.budgetRemaining).toBeNull();
  });

  // Without a run wrapper there is nothing to group by, and pretending otherwise would hand every
  // call a fresh allowance while looking like enforcement.
  test("warns once when no run can be identified", async () => {
    const { instance, events } = await setup();
    const agent = instance.attach(buildAgent(false));
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (message: string) => warnings.push(message);

    try {
      await agent.generate("unwrapped");
      await agent.generate("also unwrapped");
    } finally {
      console.warn = original;
    }

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("per-run caps are NOT being enforced");
    expect(new Set(events.map((event) => event.runId)).size).toBe(2);
  });
});
