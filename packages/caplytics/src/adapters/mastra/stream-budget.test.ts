import { beforeEach, expect, test } from "bun:test";
import { toPriceTable } from "@caplytics/core";
import { Agent } from "@mastra/core/agent";
import { createCaplytics } from "../../caplytics.js";
import { staticPriceSource } from "../../pricing/price-source.js";
import { attach } from "./attach.js";
import { resetRunIdentityWarning } from "./run-identity.js";

// $1/M output, so 1M streamed tokens costs $1.
const TABLE = toPriceTable(
  { "stub-model": { mode: "chat", input_cost_per_token: 1e-6, output_cost_per_token: 1e-6 } },
  { fetchedAt: "2026-08-01T00:00:00.000Z", source: "test" },
);

function streamingAgent(chunksPerCall: number) {
  const model = {
    specificationVersion: "v2" as const,
    provider: "stub",
    modelId: "stub-model",
    supportedUrls: {},
    async doGenerate() {
      return {
        content: [{ type: "text" as const, text: "done" }],
        finishReason: "stop" as const,
        usage: { inputTokens: 0, outputTokens: 0 },
        warnings: [],
      };
    },
    async doStream() {
      return {
        stream: new ReadableStream({
          start(controller) {
            for (let index = 0; index < chunksPerCall; index += 1) {
              // ~28,600 estimated tokens per chunk, so a $1 cap is crossed within a few chunks.
              controller.enqueue({ type: "text-delta", delta: "x".repeat(100_000) });
            }
            controller.close();
          },
        }),
      };
    },
  };

  return new Agent({
    id: "support-agent",
    name: "support-agent",
    instructions: "test",
    model: model as never,
  });
}

async function drain(result: unknown): Promise<number> {
  const stream = Reflect.get(result as object, "stream") as ReadableStream<unknown>;
  let parts = 0;
  for await (const _part of stream) parts += 1;
  return parts;
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
 * Driven through the resolved model directly rather than `.stream()`, so the assertion is about
 * caplytics' guard rather than Mastra's stream plumbing.
 */
async function resolvedModel(agent: Agent): Promise<{ doStream(o: unknown): Promise<unknown> }> {
  const resolve = agent.model as (context: unknown) => Promise<unknown>;
  return (await resolve({})) as { doStream(o: unknown): Promise<unknown> };
}

test("stops a stream that would take the run past its cap", async () => {
  const instance = await setup();
  const agent = instance.attach(streamingAgent(200), { cap: 1, onLimit: "block" });

  const parts = await instance.run(async () =>
    drain(await (await resolvedModel(agent)).doStream({})),
  );

  // 200 chunks were on offer; the guard cut it off once the projected spend crossed $1.
  expect(parts).toBeLessThan(100);
});

test("lets a stream that fits inside the cap run to completion", async () => {
  const instance = await setup();
  const agent = instance.attach(streamingAgent(5), { cap: 1000, onLimit: "block" });

  const parts = await instance.run(async () =>
    drain(await (await resolvedModel(agent)).doStream({})),
  );

  expect(parts).toBe(5);
});

// A soft policy must not kill a stream in flight — §10 item 2's reasoning applies mid-stream too.
test("never stops a stream under `warn`", async () => {
  const instance = await setup();
  const agent = instance.attach(streamingAgent(20), { cap: 1, onLimit: "warn" });

  const parts = await instance.run(async () =>
    drain(await (await resolvedModel(agent)).doStream({})),
  );

  expect(parts).toBe(20);
});

test("never stops an uncapped run", async () => {
  const instance = await setup();
  const agent = instance.attach(streamingAgent(20), { cap: "unlimited", onLimit: "block" });

  const parts = await instance.run(async () =>
    drain(await (await resolvedModel(agent)).doStream({})),
  );

  expect(parts).toBe(20);
});

test("does not guard a model whose price is unknown", async () => {
  const instance = createCaplytics({ onHandlerError: () => {} });
  const agent = instance.attach(streamingAgent(20), { cap: 1, onLimit: "block" });

  const parts = await instance.run(async () =>
    drain(await (await resolvedModel(agent)).doStream({})),
  );

  // No rates means no honest projection; guessing would stop a stream on a number we invented.
  expect(parts).toBe(20);
});

test("the raw adapter guards nothing without a progress hook", async () => {
  const agent = attach(streamingAgent(20), {});

  const parts = await drain(await (await resolvedModel(agent)).doStream({}));

  expect(parts).toBe(20);
});
