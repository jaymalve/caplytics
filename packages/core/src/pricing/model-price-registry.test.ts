import { describe, expect, test } from "bun:test";
import { findModelRates, normaliseModelId, pricedModelIds } from "./model-price-registry.js";
import { usdPerMillionTokens } from "./model-rates.js";

const NOW = "2026-08-01T00:00:00.000Z";

describe("normaliseModelId", () => {
  test.each([
    ["anthropic/claude-sonnet-5", "claude-sonnet-5"],
    ["claude-sonnet-5", "claude-sonnet-5"],
    ["claude-haiku-4-5-20251001", "claude-haiku-4-5"],
    ["anthropic/claude-haiku-4-5-20251001", "claude-haiku-4-5"],
    ["  Claude-Opus-4-8  ", "claude-opus-4-8"],
  ])("%p normalises to %p", (input, expected) => {
    expect(normaliseModelId(input)).toBe(expected);
  });

  test("keeps a version that is not a dated snapshot", () => {
    expect(normaliseModelId("claude-opus-4-8")).toBe("claude-opus-4-8");
  });
});

describe("findModelRates", () => {
  test("prices a model reached through its provider prefix", () => {
    const rates = findModelRates("anthropic/claude-opus-4-8", NOW);

    expect(rates?.uncachedInput).toBe(usdPerMillionTokens(5));
    expect(rates?.output).toBe(usdPerMillionTokens(25));
  });

  test("prices a dated snapshot at its alias rate", () => {
    expect(findModelRates("claude-haiku-4-5-20251001", NOW)).toEqual(
      // biome-ignore lint/style/noNonNullAssertion: the alias is asserted present by the sibling test
      findModelRates("claude-haiku-4-5", NOW)!,
    );
  });

  test("returns undefined for an unknown model, which becomes priceUnknown", () => {
    expect(findModelRates("openai/gpt-5", NOW)).toBeUndefined();
    expect(findModelRates("", NOW)).toBeUndefined();
  });

  test("derives Anthropic cache rates from the input rate", () => {
    const rates = findModelRates("claude-opus-4-8", NOW);

    // $5 input -> $0.50 cache read, $6.25 cache write (5m), $10 cache write (1h).
    expect(rates?.cacheReadInput).toBe(usdPerMillionTokens(0.5));
    expect(rates?.cacheWrite5mInput).toBe(usdPerMillionTokens(6.25));
    expect(rates?.cacheWrite1hInput).toBe(usdPerMillionTokens(10));
  });

  test("every registered model resolves", () => {
    for (const id of pricedModelIds()) {
      expect(findModelRates(id, NOW)).toBeDefined();
    }
  });
});

// Sonnet 5 runs introductory pricing through 2026-08-31. Pricing a July call at the September rate
// would overstate it by 50%, which is exactly the error a cost tracker exists to not make.
describe("effective-dated pricing", () => {
  test("uses the introductory rate during the introductory window", () => {
    const rates = findModelRates("claude-sonnet-5", "2026-08-31T23:59:59.000Z");

    expect(rates?.uncachedInput).toBe(usdPerMillionTokens(2));
    expect(rates?.output).toBe(usdPerMillionTokens(10));
  });

  test("uses list price from the day the window closes", () => {
    const rates = findModelRates("claude-sonnet-5", "2026-09-01T00:00:00.000Z");

    expect(rates?.uncachedInput).toBe(usdPerMillionTokens(3));
    expect(rates?.output).toBe(usdPerMillionTokens(15));
  });

  test("a model with one period prices identically either side of that boundary", () => {
    expect(findModelRates("claude-opus-4-8", "2026-08-31T23:59:59.000Z")).toEqual(
      // biome-ignore lint/style/noNonNullAssertion: asserted present by the sibling test above
      findModelRates("claude-opus-4-8", "2026-09-01T00:00:00.000Z")!,
    );
  });
});
