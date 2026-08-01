import { expect, test } from "bun:test";
import { estimateTokenCount } from "./estimate-token-count.js";

test("is zero for empty text", () => {
  expect(estimateTokenCount("")).toBe(0);
});

test("grows with length", () => {
  expect(estimateTokenCount("x".repeat(350))).toBeGreaterThan(estimateTokenCount("x".repeat(35)));
});

// Under-reserving lets a run exceed its cap; over-reserving only throttles it briefly.
test("never rounds a non-empty payload down to zero tokens", () => {
  expect(estimateTokenCount("a")).toBeGreaterThanOrEqual(1);
});

test("lands within a plausible band for a JSON payload", () => {
  const payload = JSON.stringify({ status: "ok", rows: [1, 2, 3], note: "a short message" });

  const estimate = estimateTokenCount(payload);

  expect(estimate).toBeGreaterThan(payload.length / 6);
  expect(estimate).toBeLessThan(payload.length);
});
