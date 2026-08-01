import { expect, test } from "bun:test";
import { toolResultTokens } from "./tool-result-tokens.js";

test("grows with payload size, so a chatty tool is visible", () => {
  const terse = toolResultTokens({ ok: true }) ?? 0;
  const chatty =
    toolResultTokens({
      rows: Array.from({ length: 500 }, (_, i) => ({ id: i, name: `row ${i}` })),
    }) ?? 0;

  expect(chatty).toBeGreaterThan(terse * 50);
});

test("is undefined for a result that will not serialise", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;

  expect(toolResultTokens(circular)).toBeUndefined();
  expect(toolResultTokens(undefined)).toBeUndefined();
});

test("counts a small result as at least one token", () => {
  expect(toolResultTokens({ a: 1 })).toBeGreaterThanOrEqual(1);
});
