import { describe, expect, test } from "bun:test";
import { formatUsd } from "../money/format-usd.js";
import { usdToMicroDollars } from "../money/micro-dollars.js";
import { toPriceTable } from "./litellm-pricing.js";
import type { ModelRates } from "./model-rates.js";
import { priceModelCall } from "./price-model-call.js";
import { findModelRates } from "./price-table.js";
import type { TokenUsage } from "./token-usage.js";

const table = toPriceTable(
  {
    "claude-opus-4-8": {
      mode: "chat",
      input_cost_per_token: 0.000005,
      output_cost_per_token: 0.000025,
      cache_read_input_token_cost: 5e-7,
      cache_creation_input_token_cost: 0.00000625,
      cache_creation_input_token_cost_above_1hr: 0.00001,
    },
  },
  { fetchedAt: "2026-08-01T00:00:00.000Z", source: "test" },
);

function ratesFor(modelId: string): ModelRates {
  const rates = findModelRates(table, modelId);
  if (rates === undefined) throw new Error(`test fixture is missing ${modelId}`);
  return rates;
}

const OPUS = ratesFor("claude-opus-4-8");

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
  // $5/M in, $25/M out. 1M in + 1M out = $30.
  const priced = priceModelCall(OPUS, usage({ uncachedInput: 1_000_000, output: 1_000_000 }));

  expect(priced.cost).toBe(usdToMicroDollars(30));
  expect(priced.priceUnknown).toBe(false);
});

test("prices a realistic call to sub-cent precision", () => {
  const priced = priceModelCall(OPUS, usage({ uncachedInput: 1200, output: 340 }));

  // 1200 * $5/M = $0.006; 340 * $25/M = $0.0085.
  expect(formatUsd(priced.cost)).toBe("$0.0145");
});

describe("cache traffic", () => {
  test("bills reads at the published cache-read rate", () => {
    const cached = priceModelCall(OPUS, usage({ cacheReadInput: 1_000_000 }));
    const uncached = priceModelCall(OPUS, usage({ uncachedInput: 1_000_000 }));

    expect(cached.cost).toBe(usdToMicroDollars(0.5));
    expect(Number(uncached.cost)).toBe(Number(cached.cost) * 10);
  });

  test("bills a 1h write above a 5m write", () => {
    const fiveMinutes = priceModelCall(
      OPUS,
      usage({ cacheWriteInput: 1_000_000, cacheWriteTtl: "5m" }),
    );
    const oneHour = priceModelCall(
      OPUS,
      usage({ cacheWriteInput: 1_000_000, cacheWriteTtl: "1h" }),
    );

    expect(fiveMinutes.cost).toBe(usdToMicroDollars(6.25));
    expect(oneHour.cost).toBe(usdToMicroDollars(10));
  });

  // The reason §3's flat tokensIn is not enough to audit a cost: a mostly-cached call is an order
  // of magnitude cheaper than an uncached one with the same token count.
  test("a cached call costs far less than an uncached call of the same size", () => {
    const mostlyCached = priceModelCall(
      OPUS,
      usage({ uncachedInput: 10_000, cacheReadInput: 90_000 }),
    );
    const allFresh = priceModelCall(OPUS, usage({ uncachedInput: 100_000 }));

    expect(Number(mostlyCached.cost)).toBeLessThan(Number(allFresh.cost) / 3);
  });
});

describe("unpriced models", () => {
  test("report priceUnknown rather than a guess", () => {
    const priced = priceModelCall(undefined, usage({ uncachedInput: 5000, output: 5000 }));

    expect(priced.priceUnknown).toBe(true);
    expect(priced.cost).toBe(usdToMicroDollars(0));
  });

  test("are distinguishable from a genuinely free call", () => {
    const unknown = priceModelCall(undefined, usage({ uncachedInput: 1000 }));
    const free = priceModelCall(OPUS, usage());

    expect(unknown.cost).toBe(free.cost);
    expect(unknown.priceUnknown).not.toBe(free.priceUnknown);
  });
});

test("zero usage costs nothing", () => {
  expect(priceModelCall(OPUS, usage()).cost).toBe(usdToMicroDollars(0));
});
