import { describe, expect, test } from "bun:test";
import { findModelRates } from "@caplytics/core";
import { createLiteLlmPriceSource } from "./litellm-price-source.js";

const FEED = {
  "claude-opus-4-8": {
    mode: "chat",
    input_cost_per_token: 0.000005,
    output_cost_per_token: 0.000025,
  },
};

type FetchStub = {
  impl: typeof fetch;
  calls: () => number;
};

function respondWith(body: unknown, init: { status?: number } = {}): FetchStub {
  let calls = 0;
  return {
    calls: () => calls,
    impl: (() => {
      calls++;
      return Promise.resolve(new Response(JSON.stringify(body), { status: init.status ?? 200 }));
    }) as unknown as typeof fetch,
  };
}

function failWith(message: string): FetchStub {
  let calls = 0;
  return {
    calls: () => calls,
    impl: (() => {
      calls++;
      return Promise.reject(new Error(message));
    }) as unknown as typeof fetch,
  };
}

const silent = () => {};

test("loads rates from the feed", async () => {
  const source = createLiteLlmPriceSource({ fetchImpl: respondWith(FEED).impl, onError: silent });

  const table = await source.load();

  expect(findModelRates(table, "anthropic/claude-opus-4-8")).toBeDefined();
  expect(table.source).toContain("litellm");
});

describe("caching", () => {
  test("reuses a loaded table within its ttl", async () => {
    const stub = respondWith(FEED);
    const source = createLiteLlmPriceSource({ fetchImpl: stub.impl, onError: silent });

    await source.load();
    await source.load();
    await source.load();

    expect(stub.calls()).toBe(1);
  });

  test("refetches once the ttl has elapsed", async () => {
    const stub = respondWith(FEED);
    const source = createLiteLlmPriceSource({ fetchImpl: stub.impl, ttlMs: 0, onError: silent });

    await source.load();
    await source.load();

    expect(stub.calls()).toBe(2);
  });

  // Parallel tool calls mean concurrent first loads are the normal case, not an edge case.
  test("collapses concurrent first loads into one request", async () => {
    const stub = respondWith(FEED);
    const source = createLiteLlmPriceSource({ fetchImpl: stub.impl, onError: silent });

    await Promise.all([source.load(), source.load(), source.load()]);

    expect(stub.calls()).toBe(1);
  });
});

describe("when the feed is unreachable", () => {
  // The failure mode that matters: with no rates, every call reports priceUnknown and stops
  // counting against any budget, so spend control is off while the agent keeps running.
  test("reports the failure rather than failing silently", async () => {
    const errors: Error[] = [];
    const source = createLiteLlmPriceSource({
      fetchImpl: failWith("network down").impl,
      onError: (error) => errors.push(error),
    });

    const table = await source.load();

    expect(table.rates.size).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe("network down");
  });

  test("keeps serving the last good table, since stale rates beat none", async () => {
    let shouldFail = false;
    let calls = 0;
    const flaky = (() => {
      calls++;
      if (shouldFail) return Promise.reject(new Error("network down"));
      return Promise.resolve(new Response(JSON.stringify(FEED)));
    }) as unknown as typeof fetch;

    const source = createLiteLlmPriceSource({ fetchImpl: flaky, ttlMs: 0, onError: silent });
    await source.load();
    shouldFail = true;

    const table = await source.load();

    expect(calls).toBe(2);
    expect(findModelRates(table, "claude-opus-4-8")).toBeDefined();
  });

  test("treats a non-2xx response as a failure", async () => {
    const errors: Error[] = [];
    const source = createLiteLlmPriceSource({
      fetchImpl: respondWith({}, { status: 503 }).impl,
      onError: (error) => errors.push(error),
    });

    await source.load();

    expect(errors[0]?.message).toContain("503");
  });

  // A 200 carrying an empty or unrecognisable body would otherwise cache as "no model has a
  // price", disabling enforcement until the ttl expired.
  test("rejects a well-formed response that prices nothing", async () => {
    const errors: Error[] = [];
    const source = createLiteLlmPriceSource({
      fetchImpl: respondWith({ "some-embedding-model": { mode: "embedding" } }).impl,
      onError: (error) => errors.push(error),
    });

    await source.load();

    expect(errors[0]?.message).toContain("no priced chat models");
  });

  test("recovers on a later load once the feed returns", async () => {
    let shouldFail = true;
    const flaky = (() => {
      if (shouldFail) return Promise.reject(new Error("network down"));
      return Promise.resolve(new Response(JSON.stringify(FEED)));
    }) as unknown as typeof fetch;

    const source = createLiteLlmPriceSource({ fetchImpl: flaky, ttlMs: 0, onError: silent });
    expect((await source.load()).rates.size).toBe(0);

    shouldFail = false;

    expect(findModelRates(await source.load(), "claude-opus-4-8")).toBeDefined();
  });
});
