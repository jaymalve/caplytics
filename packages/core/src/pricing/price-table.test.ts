import { describe, expect, test } from "bun:test";
import { toPriceTable } from "./litellm-pricing.js";
import { usdPerMillionTokens } from "./model-rates.js";
import { EMPTY_PRICE_TABLE, findModelRates, modelIdCandidates } from "./price-table.js";

const table = toPriceTable(
  {
    "claude-opus-4-8": {
      mode: "chat",
      input_cost_per_token: 0.000005,
      output_cost_per_token: 0.000025,
    },
    "gpt-5": { mode: "chat", input_cost_per_token: 0.000001, output_cost_per_token: 0.000002 },
    "claude-haiku-4-5": {
      mode: "chat",
      input_cost_per_token: 0.000001,
      output_cost_per_token: 0.000005,
    },
  },
  { fetchedAt: "2026-08-01T00:00:00.000Z", source: "test" },
);

describe("resolving framework model ids", () => {
  // Mastra addresses models as "anthropic/claude-sonnet-5"; the feed keys them bare.
  test.each([
    ["anthropic/claude-opus-4-8", 5],
    ["claude-opus-4-8", 5],
    ["openai/gpt-5", 1],
    ["Anthropic/Claude-Opus-4-8", 5],
    ["  anthropic/claude-opus-4-8  ", 5],
  ])("%p resolves to a $%p/M input rate", (modelId, expectedUsd) => {
    expect(findModelRates(table, modelId)?.uncachedInput).toBe(usdPerMillionTokens(expectedUsd));
  });

  test("resolves a dated snapshot to its alias", () => {
    expect(findModelRates(table, "claude-haiku-4-5-20251001")).toEqual(
      // biome-ignore lint/style/noNonNullAssertion: asserted present by the sibling case above
      findModelRates(table, "claude-haiku-4-5")!,
    );
  });

  test("resolves a regional Bedrock alias, which prices identically", () => {
    expect(findModelRates(table, "us.anthropic.claude-opus-4-8")).toBeUndefined();
    expect(findModelRates(table, "bedrock/us.claude-opus-4-8")?.uncachedInput).toBe(
      usdPerMillionTokens(5),
    );
  });
});

describe("unknown models", () => {
  test.each(["", "   ", "totally-made-up-model", "anthropic/not-a-model"])(
    "%p yields undefined, which becomes priceUnknown",
    (modelId) => {
      expect(findModelRates(table, modelId)).toBeUndefined();
    },
  );

  test("an empty table knows nothing", () => {
    expect(findModelRates(EMPTY_PRICE_TABLE, "claude-opus-4-8")).toBeUndefined();
  });
});

describe("modelIdCandidates", () => {
  test("peels one naming convention at a time, most specific first", () => {
    expect(modelIdCandidates("anthropic/us.claude-haiku-4-5-20251001")).toEqual([
      "anthropic/us.claude-haiku-4-5-20251001",
      "us.claude-haiku-4-5-20251001",
      "us.claude-haiku-4-5",
      "claude-haiku-4-5-20251001",
      "claude-haiku-4-5",
    ]);
  });

  test("never emits duplicates or empties", () => {
    const candidates = modelIdCandidates("gpt-5");

    expect(candidates).toEqual(["gpt-5"]);
  });
});
