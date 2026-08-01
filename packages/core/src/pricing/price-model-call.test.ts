import { describe, expect, test } from "bun:test";
import { formatUsd } from "../money/format-usd.js";
import { usdToMicroDollars } from "../money/micro-dollars.js";
import { priceModelCall } from "./price-model-call.js";
import type { TokenUsage } from "./token-usage.js";

const NOW = "2026-08-01T00:00:00.000Z";

function usage(overrides: Partial<TokenUsage> = {}): TokenUsage {
  return {
    uncachedInput: 0,
    cacheReadInput: 0,
    cacheWriteInput: 0,
    output: 0,
    cacheWriteTtl: "5m",
    ...overrides,
  };
}

test("prices uncached input and output at their own rates", () => {
  // Opus 4.8: $5/M in, $25/M out. 1M in + 1M out = $30.
  const priced = priceModelCall(
    "claude-opus-4-8",
    usage({ uncachedInput: 1_000_000, output: 1_000_000 }),
    NOW,
  );

  expect(priced.cost).toBe(usdToMicroDollars(30));
  expect(priced.priceUnknown).toBe(false);
});

test("prices a realistic call to sub-cent precision", () => {
  const priced = priceModelCall(
    "anthropic/claude-opus-4-8",
    usage({ uncachedInput: 1200, output: 340 }),
    NOW,
  );

  // 1200 * $5/M = $0.006; 340 * $25/M = $0.0085.
  expect(formatUsd(priced.cost)).toBe("$0.0145");
});

describe("cache traffic", () => {
  test("bills reads at a tenth of the input rate", () => {
    const cached = priceModelCall("claude-opus-4-8", usage({ cacheReadInput: 1_000_000 }), NOW);
    const uncached = priceModelCall("claude-opus-4-8", usage({ uncachedInput: 1_000_000 }), NOW);

    expect(cached.cost).toBe(usdToMicroDollars(0.5));
    expect(Number(uncached.cost)).toBe(Number(cached.cost) * 10);
  });

  test("bills a 1h write above a 5m write", () => {
    const fiveMinutes = priceModelCall(
      "claude-opus-4-8",
      usage({ cacheWriteInput: 1_000_000, cacheWriteTtl: "5m" }),
      NOW,
    );
    const oneHour = priceModelCall(
      "claude-opus-4-8",
      usage({ cacheWriteInput: 1_000_000, cacheWriteTtl: "1h" }),
      NOW,
    );

    expect(fiveMinutes.cost).toBe(usdToMicroDollars(6.25));
    expect(oneHour.cost).toBe(usdToMicroDollars(10));
  });

  // The reason §3's flat tokensIn is not enough to audit a cost: a mostly-cached call is an order
  // of magnitude cheaper than an uncached one with the same token count.
  test("a cached call costs far less than an uncached call of the same size", () => {
    const mostlyCached = priceModelCall(
      "claude-opus-4-8",
      usage({ uncachedInput: 10_000, cacheReadInput: 90_000 }),
      NOW,
    );
    const allFresh = priceModelCall("claude-opus-4-8", usage({ uncachedInput: 100_000 }), NOW);

    expect(Number(mostlyCached.cost)).toBeLessThan(Number(allFresh.cost) / 3);
  });
});

describe("unknown models", () => {
  test("report priceUnknown rather than a guess", () => {
    const priced = priceModelCall(
      "some-model-we-have-never-seen",
      usage({ uncachedInput: 5000, output: 5000 }),
      NOW,
    );

    expect(priced.priceUnknown).toBe(true);
    expect(priced.cost).toBe(usdToMicroDollars(0));
  });

  test("are distinguishable from a genuinely free call", () => {
    const unknown = priceModelCall("mystery-model", usage({ uncachedInput: 1000 }), NOW);
    const free = priceModelCall("claude-opus-4-8", usage(), NOW);

    expect(unknown.cost).toBe(free.cost);
    expect(unknown.priceUnknown).not.toBe(free.priceUnknown);
  });
});

test("zero usage costs nothing", () => {
  expect(priceModelCall("claude-opus-4-8", usage(), NOW).cost).toBe(usdToMicroDollars(0));
});

test("prices Sonnet 5 at the introductory rate today", () => {
  const priced = priceModelCall("claude-sonnet-5", usage({ uncachedInput: 1_000_000 }), NOW);

  expect(priced.cost).toBe(usdToMicroDollars(2));
});
