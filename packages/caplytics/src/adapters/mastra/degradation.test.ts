import { beforeEach, describe, expect, test } from "bun:test";
import { toPriceTable } from "@caplytics/core";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createCaplytics } from "../../caplytics.js";
import { staticPriceSource } from "../../pricing/price-source.js";
import { resetRunIdentityWarning } from "./run-identity.js";

// $1/M so a 1M-token call costs exactly $1, making budget fractions easy to reason about.
const TABLE = toPriceTable(
  { "stub-model": { mode: "chat", input_cost_per_token: 1e-6, output_cost_per_token: 1e-6 } },
  { fetchedAt: "2026-08-01T00:00:00.000Z", source: "test" },
);

type Observed = { maxOutputTokens: unknown };

function buildAgent(steps: number, observed: Observed[]) {
  let calls = 0;
  const model = {
    specificationVersion: "v2" as const,
    provider: "stub",
    modelId: "stub-model",
    supportedUrls: {},
    async doGenerate(options: Record<string, unknown>) {
      calls += 1;
      observed.push({ maxOutputTokens: options.maxOutputTokens });
      const more = calls < steps;
      return {
        content: more
          ? [
              {
                type: "tool-call" as const,
                toolCallId: `c${calls}`,
                toolName: "echoTool",
                input: "{}",
              },
            ]
          : [{ type: "text" as const, text: "done" }],
        finishReason: more ? ("tool-calls" as const) : ("stop" as const),
        usage: { inputTokens: 1_000_000, outputTokens: 0 },
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
    tools: {
      echoTool: createTool({
        id: "echoTool",
        description: "Echoes",
        inputSchema: z.object({}),
        execute: async () => ({ ok: true }),
      }),
    },
  });
}

async function setup() {
  const instance = createCaplytics({
    priceSource: staticPriceSource(TABLE),
    onHandlerError: () => {},
  });
  await instance.warmPricing();
  return instance;
}

beforeEach(() => {
  resetRunIdentityWarning();
});

/**
 * The ladder is consulted per model call, which only works because it lives in the proxy. Mastra
 * resolves a model twice per run and reuses it — see architecture/mastra-interception-points.md.
 */
describe("the ladder applies as a run spends", () => {
  test("leaves an unspent run alone", async () => {
    const observed: Observed[] = [];
    const instance = await setup();
    const agent = instance.attach(buildAgent(2, observed), {
      cap: 100,
      degrade: [{ at: 0.7, maxTokens: 500 }],
    });

    await instance.run(() => agent.generate("go"));

    expect(observed.every((call) => call.maxOutputTokens !== 500)).toBe(true);
  });

  // $4 cap at $1 a call: calls 1–3 start under 70%, call 4 starts at 75%.
  test("clamps output once the run crosses a rung", async () => {
    const observed: Observed[] = [];
    const instance = await setup();
    const agent = instance.attach(buildAgent(4, observed), {
      cap: 4,
      degrade: [{ at: 0.7, maxTokens: 500 }],
    });

    await instance.run(() => agent.generate("go"));

    expect(observed).toHaveLength(4);
    expect(observed.slice(0, 3).every((call) => call.maxOutputTokens !== 500)).toBe(true);
    expect(observed[3]?.maxOutputTokens).toBe(500);
  });

  test("a fresh run starts back at the top of the ladder", async () => {
    const observed: Observed[] = [];
    const instance = await setup();
    const agent = instance.attach(buildAgent(4, observed), {
      cap: 4,
      degrade: [{ at: 0.7, maxTokens: 500 }],
    });

    await instance.run(() => agent.generate("one"));
    const firstRun = observed.length;
    await instance.run(() => agent.generate("two"));

    expect(observed[firstRun]?.maxOutputTokens).not.toBe(500);
  });

  test("an uncapped run never degrades, having no fraction to measure", async () => {
    const observed: Observed[] = [];
    const instance = await setup();
    const agent = instance.attach(buildAgent(4, observed), {
      cap: "unlimited",
      degrade: [{ at: 0.7, maxTokens: 500 }],
    });

    await instance.run(() => agent.generate("go"));

    expect(observed.every((call) => call.maxOutputTokens !== 500)).toBe(true);
  });

  test("no ladder means nothing is clamped", async () => {
    const observed: Observed[] = [];
    const instance = await setup();
    const agent = instance.attach(buildAgent(4, observed), { cap: 4 });

    await instance.run(() => agent.generate("go"));

    expect(observed.every((call) => call.maxOutputTokens !== 500)).toBe(true);
  });
});

/**
 * §5.1 calls this required, not optional: rejecting at attach time turns a misconfigured ladder
 * into a startup error rather than a run that degrades and then blocks on the very next call.
 */
describe("attach-time validation", () => {
  test("rejects a ladder with no headroom before the block", async () => {
    const instance = await setup();

    expect(() =>
      instance.attach(buildAgent(1, []), {
        cap: 5,
        onLimit: "block",
        degrade: [{ at: 0.95, maxTokens: 500 }],
      }),
    ).toThrow(/no room/);
  });

  test("accepts the same ladder when the policy does not block", async () => {
    const instance = await setup();

    expect(() =>
      instance.attach(buildAgent(1, []), {
        cap: 5,
        onLimit: "warn",
        degrade: [{ at: 0.95, maxTokens: 500 }],
      }),
    ).not.toThrow();
  });

  test("rejects a threshold that is not a fraction of the cap", async () => {
    const instance = await setup();

    expect(() =>
      instance.attach(buildAgent(1, []), { cap: 5, degrade: [{ at: 5, maxTokens: 500 }] }),
    ).toThrow(/between 0 and 1/);
  });
});
