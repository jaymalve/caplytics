import { describe, expect, test } from "bun:test";
import { toPriceTable } from "./litellm-pricing.js";
import { usdPerMillionTokens } from "./model-rates.js";
import { findModelRates } from "./price-table.js";

const META = { fetchedAt: "2026-08-01T00:00:00.000Z", source: "test" };

// Verbatim entries from LiteLLM's published feed, so the parser is tested against the real shape
// rather than one invented to suit it.
const FEED = {
  "claude-opus-4-8": {
    mode: "chat",
    input_cost_per_token: 0.000005,
    output_cost_per_token: 0.000025,
    cache_read_input_token_cost: 5e-7,
    cache_creation_input_token_cost: 0.00000625,
    cache_creation_input_token_cost_above_1hr: 0.00001,
  },
  "claude-sonnet-5": {
    mode: "chat",
    input_cost_per_token: 0.000002,
    output_cost_per_token: 0.00001,
    cache_read_input_token_cost: 2e-7,
    cache_creation_input_token_cost: 0.0000025,
    cache_creation_input_token_cost_above_1hr: 0.000004,
  },
  "text-embedding-3-small": {
    mode: "embedding",
    input_cost_per_token: 2e-8,
    output_cost_per_token: 0,
  },
  "no-mode-declared": { input_cost_per_token: 0.000001 },
  "chat-without-cache-pricing": {
    mode: "chat",
    input_cost_per_token: 0.000003,
    output_cost_per_token: 0.000015,
  },
};

test("reads published cache rates rather than deriving them from a multiplier", () => {
  const table = toPriceTable(FEED, META);

  const opus = findModelRates(table, "claude-opus-4-8");

  expect(opus?.uncachedInput).toBe(usdPerMillionTokens(5));
  expect(opus?.output).toBe(usdPerMillionTokens(25));
  expect(opus?.cacheReadInput).toBe(usdPerMillionTokens(0.5));
  expect(opus?.cacheWrite5mInput).toBe(usdPerMillionTokens(6.25));
  expect(opus?.cacheWrite1hInput).toBe(usdPerMillionTokens(10));
});

// The feed quotes dollars per single token as floats: 2e-7 * 1e12 is not exactly 200000 in binary
// floating point, and an unrounded rate would carry that error into every priced call.
test("converts per-token floats to exact integer rates", () => {
  const table = toPriceTable(FEED, META);

  const sonnet = findModelRates(table, "claude-sonnet-5");

  expect(sonnet?.cacheReadInput).toBe(usdPerMillionTokens(0.2));
  expect(Number.isInteger(Number(sonnet?.cacheReadInput))).toBe(true);
});

describe("filtering", () => {
  test("keeps only chat models", () => {
    const table = toPriceTable(FEED, META);

    expect(findModelRates(table, "text-embedding-3-small")).toBeUndefined();
    expect(findModelRates(table, "no-mode-declared")).toBeUndefined();
  });

  test("falls back to the input rate when a chat model publishes no cache pricing", () => {
    const table = toPriceTable(FEED, META);

    const rates = findModelRates(table, "chat-without-cache-pricing");

    // Assuming an unpublished discount would under-report spend; assuming none cannot.
    expect(rates?.cacheReadInput).toBe(usdPerMillionTokens(3));
    expect(rates?.cacheWrite1hInput).toBe(usdPerMillionTokens(3));
  });
});

describe("malformed input", () => {
  test("skips a bad entry instead of failing the whole table", () => {
    const table = toPriceTable(
      { ...FEED, broken: { mode: "chat", input_cost_per_token: "free" }, alsoBroken: null },
      META,
    );

    expect(findModelRates(table, "broken")).toBeUndefined();
    expect(findModelRates(table, "claude-opus-4-8")).toBeDefined();
  });

  test("rejects a negative rate rather than crediting spend", () => {
    const table = toPriceTable({ sneaky: { mode: "chat", input_cost_per_token: -1 } }, META);

    expect(findModelRates(table, "sneaky")).toBeUndefined();
  });

  test("throws only when the feed itself is not a model map", () => {
    expect(() => toPriceTable("not a feed", META)).toThrow();
    expect(() => toPriceTable(null, META)).toThrow();
  });
});

test("records where and when the rates came from", () => {
  const table = toPriceTable(FEED, META);

  expect(table.fetchedAt).toBe(META.fetchedAt);
  expect(table.source).toBe("test");
});
