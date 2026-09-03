import { describe, expect, test } from "bun:test";
import { usdToMicroDollars } from "../money/micro-dollars.js";
import { toPriceTable } from "./litellm-pricing.js";
import type { ModelRates } from "./model-rates.js";
import { findModelRates } from "./price-table.js";
import { priceToolResult } from "./price-tool-result.js";

const table = toPriceTable(
  {
    "claude-opus-4-8": {
      mode: "chat",
      input_cost_per_token: 0.000005,
      output_cost_per_token: 0.000025,
    },
    "claude-haiku-4-5": {
      mode: "chat",
      input_cost_per_token: 0.000001,
      output_cost_per_token: 0.000005,
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
const HAIKU = ratesFor("claude-haiku-4-5");

test("charges a tool for the tokens its result adds to the next turn", () => {
  const priced = priceToolResult({
    result: { status: "ok", refundId: "re_123" },
    parentRates: OPUS,
  });

  expect(priced.priceUnknown).toBe(false);
  expect(Number(priced.cost)).toBeGreaterThan(0);
});

// The property that makes derivation better than a hardcoded per-tool number: a tool that dumps a
// large payload into context is charged for it, with nobody having configured anything.
test("charges a chatty tool more than a terse one", () => {
  const terse = priceToolResult({ result: { ok: true }, parentRates: OPUS });
  const chatty = priceToolResult({
    result: {
      ok: true,
      rows: Array.from({ length: 500 }, (_, i) => ({ id: i, name: `row ${i}` })),
    },
    parentRates: OPUS,
  });

  expect(Number(chatty.cost)).toBeGreaterThan(Number(terse.cost) * 50);
});

test("prices at the parent model's input rate, since that is how the result is billed", () => {
  const onOpus = priceToolResult({ result: { a: 1 }, parentRates: OPUS });
  const onHaiku = priceToolResult({ result: { a: 1 }, parentRates: HAIKU });

  // Opus input is $5/M, Haiku $1/M — the same payload costs five times as much on Opus.
  expect(Number(onOpus.cost)).toBe(Number(onHaiku.cost) * 5);
});

describe("declared external cost", () => {
  test("is added on top of the derived token cost", () => {
    const derivedOnly = priceToolResult({ result: { ok: true }, parentRates: OPUS });
    const withDeclared = priceToolResult({
      result: { ok: true },
      parentRates: OPUS,
      declaredCost: usdToMicroDollars(0.005),
    });

    expect(Number(withDeclared.cost)).toBe(Number(derivedOnly.cost) + 5000);
  });

  test("still applies when the parent model is unpriced, flagged as incomplete", () => {
    const priced = priceToolResult({
      result: { ok: true },
      parentRates: undefined,
      declaredCost: usdToMicroDollars(0.005),
    });

    expect(priced.cost).toBe(usdToMicroDollars(0.005));
    expect(priced.priceUnknown).toBe(true);
  });
});

describe("unpriceable results", () => {
  test("an unpriced parent model reports priceUnknown", () => {
    const priced = priceToolResult({ result: { ok: true }, parentRates: undefined });

    expect(priced.priceUnknown).toBe(true);
    expect(priced.cost).toBe(usdToMicroDollars(0));
  });

  test("a circular result reports priceUnknown rather than throwing", () => {
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;

    const priced = priceToolResult({ result: circular, parentRates: OPUS });

    expect(priced.priceUnknown).toBe(true);
  });

  test("an undefined result reports priceUnknown", () => {
    expect(priceToolResult({ result: undefined, parentRates: OPUS }).priceUnknown).toBe(true);
  });
});
