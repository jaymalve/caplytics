import { beforeEach, describe, expect, test } from "bun:test";
import { CaplyticsBudgetExceededError, type CaplyticsEvent, toPriceTable } from "@caplytics/core";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createCaplytics } from "../../caplytics.js";
import { staticPriceSource } from "../../pricing/price-source.js";
import { resetRunIdentityWarning } from "./run-identity.js";

// $1/M in, $1/M out — 1M tokens per call makes each call cost exactly $1.
const TABLE = toPriceTable(
  { "stub-model": { mode: "chat", input_cost_per_token: 1e-6, output_cost_per_token: 1e-6 } },
  { fetchedAt: "2026-08-01T00:00:00.000Z", source: "test" },
);

function buildAgent(steps: number, tokensPerCall = 1_000_000) {
  let calls = 0;
  const model = {
    specificationVersion: "v2" as const,
    provider: "stub",
    modelId: "stub-model",
    supportedUrls: {},
    async doGenerate() {
      calls += 1;
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
        usage: { inputTokens: tokensPerCall, outputTokens: 0 },
        warnings: [],
      };
    },
    async doStream() {
      throw new Error("unused");
    },
  };
  const echoTool = createTool({
    id: "echoTool",
    description: "Echoes",
    inputSchema: z.object({}),
    execute: async () => ({ ok: true }),
  });
  return new Agent({
    id: "support-agent",
    name: "support-agent",
    instructions: "test",
    model: model as never,
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

/** §4.1: a block surfaces as an ordinary call failure, so the run itself rejects. */
async function runExpectingStop(run: () => Promise<unknown>): Promise<void> {
  await expect(run()).rejects.toThrow();
}

function captureWarnings(): { messages: string[]; restore: () => void } {
  const messages: string[] = [];
  const original = console.warn;
  console.warn = (message: string) => messages.push(message);
  return { messages, restore: () => (console.warn = original) };
}

beforeEach(() => {
  resetRunIdentityWarning();
});

describe("block", () => {
  test("stops the run once the cap is spent", async () => {
    const { instance, events } = await setup();
    const agent = instance.attach(buildAgent(10), { cap: 2, onLimit: "block" });

    await runExpectingStop(() => instance.run(() => agent.generate("go")));

    // Two calls fit inside $2; the third is refused rather than fired.
    expect(events.filter((event) => event.type === "model_call")).toHaveLength(2);
  });

  test("an uncapped run is never stopped", async () => {
    const { instance, events } = await setup();
    const agent = instance.attach(buildAgent(4), { cap: "unlimited", onLimit: "block" });

    await instance.run(() => agent.generate("go"));

    expect(events.filter((event) => event.type === "model_call")).toHaveLength(4);
  });

  test("a run that fits is untouched", async () => {
    const { instance, events } = await setup();
    const agent = instance.attach(buildAgent(2), { cap: 100, onLimit: "block" });

    await instance.run(() => agent.generate("go"));

    expect(events.filter((event) => event.type === "model_call")).toHaveLength(2);
  });
});

/**
 * §4.2: hard-stop output must report spend at stop time, not the configured cap. Rounding to the
 * cap would hide the very overage the mechanism exists to bound.
 */
describe("the error", () => {
  test("reports actual spend and the cap, and carries both as data", async () => {
    const { instance } = await setup();
    const agent = instance.attach(buildAgent(5), { cap: 2, onLimit: "block" });

    let caught: unknown;
    try {
      await instance.run(() => agent.generate("go"));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect(String((caught as Error).message)).toContain("$2.00");
  });

  test("formats spend at stop time, including an overage", () => {
    const error = new CaplyticsBudgetExceededError({
      runId: "run_1",
      budget: "support-agent",
      spent: 5_020_000 as never,
      cap: 5_000_000 as never,
    });

    expect(error.message).toContain("stopped after $5.02 of $5.00");
    expect(error.name).toBe("CaplyticsBudgetExceededError");
  });
});

describe("warn", () => {
  test("is the default, and lets the run continue past its cap", async () => {
    const { instance, events } = await setup();
    const agent = instance.attach(buildAgent(4), { cap: 1 });
    const warnings = captureWarnings();

    try {
      await instance.run(() => agent.generate("go"));
    } finally {
      warnings.restore();
    }

    expect(events.filter((event) => event.type === "model_call")).toHaveLength(4);
    expect(warnings.messages.some((message) => message.includes("exhausted"))).toBe(true);
  });

  // A run that keeps going past its cap would otherwise bury the one warning that mattered.
  test("warns once per run, not once per call", async () => {
    const { instance } = await setup();
    const agent = instance.attach(buildAgent(6), { cap: 1 });
    const warnings = captureWarnings();

    try {
      await instance.run(() => agent.generate("go"));
    } finally {
      warnings.restore();
    }

    expect(warnings.messages.filter((message) => message.includes("exhausted"))).toHaveLength(1);
  });

  test("says how to make it stop", async () => {
    const { instance } = await setup();
    const agent = instance.attach(buildAgent(3), { cap: 1 });
    const warnings = captureWarnings();

    try {
      await instance.run(() => agent.generate("go"));
    } finally {
      warnings.restore();
    }

    expect(warnings.messages.join(" ")).toContain('onLimit: "block"');
  });
});
