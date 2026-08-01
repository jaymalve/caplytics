import { describe, expect, test } from "bun:test";
import { usdToMicroDollars } from "../money/micro-dollars.js";
import { priceToolResult } from "./price-tool-result.js";

const NOW = "2026-08-01T00:00:00.000Z";
const PARENT = "anthropic/claude-opus-4-8";

test("charges a tool for the tokens its result adds to the next turn", () => {
  const priced = priceToolResult({
    result: { status: "ok", refundId: "re_123" },
    parentModelId: PARENT,
    at: NOW,
  });

  expect(priced.priceUnknown).toBe(false);
  expect(Number(priced.cost)).toBeGreaterThan(0);
});

// The property that makes derivation better than a hardcoded per-tool number: a tool that dumps a
// large payload into context is charged for it, with nobody having configured anything.
test("charges a chatty tool more than a terse one", () => {
  const terse = priceToolResult({ result: { ok: true }, parentModelId: PARENT, at: NOW });
  const chatty = priceToolResult({
    result: {
      ok: true,
      rows: Array.from({ length: 500 }, (_, i) => ({ id: i, name: `row ${i}` })),
    },
    parentModelId: PARENT,
    at: NOW,
  });

  expect(Number(chatty.cost)).toBeGreaterThan(Number(terse.cost) * 50);
});

test("prices at the parent model's input rate, since that is how the result is billed", () => {
  const onOpus = priceToolResult({ result: { a: 1 }, parentModelId: "claude-opus-4-8", at: NOW });
  const onHaiku = priceToolResult({ result: { a: 1 }, parentModelId: "claude-haiku-4-5", at: NOW });

  // Opus input is $5/M, Haiku $1/M — the same payload costs five times as much on Opus.
  expect(Number(onOpus.cost)).toBe(Number(onHaiku.cost) * 5);
});

describe("declared external cost", () => {
  test("is added on top of the derived token cost", () => {
    const derivedOnly = priceToolResult({ result: { ok: true }, parentModelId: PARENT, at: NOW });
    const withDeclared = priceToolResult({
      result: { ok: true },
      parentModelId: PARENT,
      declaredCost: usdToMicroDollars(0.005),
      at: NOW,
    });

    expect(Number(withDeclared.cost)).toBe(Number(derivedOnly.cost) + 5000);
  });

  test("still applies when the parent model is unpriced, flagged as incomplete", () => {
    const priced = priceToolResult({
      result: { ok: true },
      parentModelId: "unknown-model",
      declaredCost: usdToMicroDollars(0.005),
      at: NOW,
    });

    expect(priced.cost).toBe(usdToMicroDollars(0.005));
    expect(priced.priceUnknown).toBe(true);
  });
});

describe("unpriceable results", () => {
  test("an unknown parent model reports priceUnknown", () => {
    const priced = priceToolResult({ result: { ok: true }, parentModelId: "nope", at: NOW });

    expect(priced.priceUnknown).toBe(true);
    expect(priced.cost).toBe(usdToMicroDollars(0));
  });

  test("a circular result reports priceUnknown rather than throwing", () => {
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;

    const priced = priceToolResult({ result: circular, parentModelId: PARENT, at: NOW });

    expect(priced.priceUnknown).toBe(true);
  });

  test("an undefined result reports priceUnknown", () => {
    expect(
      priceToolResult({ result: undefined, parentModelId: PARENT, at: NOW }).priceUnknown,
    ).toBe(true);
  });
});
