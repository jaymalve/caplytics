import { describe, expect, test } from "bun:test";
import { proxyLanguageModel } from "./proxy-language-model.js";

/**
 * §4.2's mid-stream stop. A single long `.stream()` call can cross the cap without ever reaching a
 * call boundary, which is where §4.1's between-calls check lives.
 */

function streamingModel(chunks: number, seenSignal: { signal?: AbortSignal | undefined } = {}) {
  return {
    specificationVersion: "v2" as const,
    provider: "stub",
    modelId: "stub-model",
    supportedUrls: {},
    async doGenerate() {
      return { ok: true };
    },
    async doStream(options: { abortSignal?: AbortSignal }) {
      seenSignal.signal = options?.abortSignal;
      return {
        stream: new ReadableStream({
          start(controller) {
            for (let index = 0; index < chunks; index += 1) {
              // Long deltas so the token estimate climbs quickly.
              controller.enqueue({ type: "text-delta", delta: "x".repeat(400) });
            }
            controller.enqueue({ type: "finish", finishReason: "stop" });
            controller.close();
          },
        }),
      };
    },
  };
}

async function drain(result: unknown): Promise<unknown[]> {
  const stream = Reflect.get(result as object, "stream") as ReadableStream<unknown>;
  const parts: unknown[] = [];
  for await (const part of stream) parts.push(part);
  return parts;
}

test("passes a stream through untouched when the guard never fires", async () => {
  const proxied = proxyLanguageModel(streamingModel(3), {
    onStreamProgress: () => "continue",
  });

  const parts = await drain(await proxied.doStream({}));

  expect(parts).toHaveLength(4);
});

test("stops the stream once the guard says to", async () => {
  const proxied = proxyLanguageModel(streamingModel(50), {
    onStreamProgress: ({ estimatedOutputTokens }) =>
      estimatedOutputTokens > 300 ? "abort" : "continue",
  });

  const parts = await drain(await proxied.doStream({}));

  // Far fewer than the 51 the model offered — it was cut off, not drained.
  expect(parts.length).toBeLessThan(10);
  expect(parts.length).toBeGreaterThan(0);
});

test("cancels the provider call, not just the local stream", async () => {
  const seen: { signal?: AbortSignal | undefined } = {};
  const proxied = proxyLanguageModel(streamingModel(50, seen), {
    onStreamProgress: ({ estimatedOutputTokens }) =>
      estimatedOutputTokens > 300 ? "abort" : "continue",
  });

  await drain(await proxied.doStream({}));

  // The signal the proxy injected is what stops the provider billing further tokens.
  expect(seen.signal).toBeInstanceOf(AbortSignal);
  expect(seen.signal?.aborted).toBe(true);
});

test("injects a signal even when the caller passed none", async () => {
  const seen: { signal?: AbortSignal | undefined } = {};
  const proxied = proxyLanguageModel(streamingModel(2, seen), {
    onStreamProgress: () => "continue",
  });

  await drain(await proxied.doStream({}));

  expect(seen.signal).toBeInstanceOf(AbortSignal);
  expect(seen.signal?.aborted).toBe(false);
});

// Replacing the caller's signal would silently break their own cancellation.
test("combines with a caller-supplied signal rather than replacing it", async () => {
  const seen: { signal?: AbortSignal | undefined } = {};
  const callerAborter = new AbortController();
  const proxied = proxyLanguageModel(streamingModel(2, seen), {
    onStreamProgress: () => "continue",
  });

  await drain(await proxied.doStream({ abortSignal: callerAborter.signal }));
  callerAborter.abort();

  expect(seen.signal?.aborted).toBe(true);
});

test("leaves doGenerate alone — there is no stream to guard", async () => {
  let consulted = 0;
  const proxied = proxyLanguageModel(streamingModel(2), {
    onStreamProgress: () => {
      consulted += 1;
      return "abort";
    },
  });

  expect(await proxied.doGenerate()).toEqual({ ok: true });
  expect(consulted).toBe(0);
});

describe("results that are not streams", () => {
  test("are returned unchanged", async () => {
    const model = {
      specificationVersion: "v2" as const,
      modelId: "odd",
      async doGenerate() {
        return { ok: true };
      },
      async doStream() {
        return { notAStream: true };
      },
    };
    const proxied = proxyLanguageModel(model, { onStreamProgress: () => "abort" });

    expect(await proxied.doStream()).toEqual({ notAStream: true });
  });
});

// §4.2 is explicit that this is best-effort: tokens already streamed are billed and unrecoverable.
test("does not pretend to prevent the overage it stops", async () => {
  const proxied = proxyLanguageModel(streamingModel(50), {
    onStreamProgress: ({ estimatedOutputTokens }) =>
      estimatedOutputTokens > 300 ? "abort" : "continue",
  });

  const parts = await drain(await proxied.doStream({}));

  // Some output was already produced and paid for before the abort landed.
  expect(parts.length).toBeGreaterThan(1);
});
