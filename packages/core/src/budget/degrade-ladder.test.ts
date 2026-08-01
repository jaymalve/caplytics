import { describe, expect, test } from "bun:test";
import {
  assertValidLadder,
  type DegradeLadder,
  REQUIRED_HEADROOM,
  resolveRung,
} from "./degrade-ladder.js";

// §5's own example ladder, expressed as data.
const LADDER: DegradeLadder = [
  { at: 0.7, model: "anthropic/claude-haiku-4-5" },
  { at: 0.85, maxTokens: 500 },
];

describe("resolveRung", () => {
  test("applies nothing below the lowest rung", () => {
    expect(resolveRung(0.5, LADDER)).toBeUndefined();
  });

  test("applies a rung from exactly its threshold", () => {
    expect(resolveRung(0.7, LADDER)).toEqual({ at: 0.7, model: "anthropic/claude-haiku-4-5" });
  });

  test("the highest applicable rung wins", () => {
    expect(resolveRung(0.9, LADDER)).toEqual({ at: 0.85, maxTokens: 500 });
  });

  // §5: a run moves between rungs in either direction as its trajectory changes.
  test("moves back down when spend is settled lower", () => {
    expect(resolveRung(0.86, LADDER)).toEqual({ at: 0.85, maxTokens: 500 });
    expect(resolveRung(0.72, LADDER)).toEqual({ at: 0.7, model: "anthropic/claude-haiku-4-5" });
  });

  test("an uncapped run has no fraction and so no rung", () => {
    expect(resolveRung(null, LADDER)).toBeUndefined();
  });

  test("an empty ladder never applies", () => {
    expect(resolveRung(0.99, [])).toBeUndefined();
  });

  test("still applies the top rung past the cap", () => {
    expect(resolveRung(1.5, LADDER)).toEqual({ at: 0.85, maxTokens: 500 });
  });
});

/**
 * §5.1 is explicit that this is required, not optional: without it a run degrades on one call and
 * blocks on the next, having paid to switch models for no benefit.
 */
describe("assertValidLadder", () => {
  test("accepts §5's ladder when blocking", () => {
    expect(() => assertValidLadder(LADDER, true)).not.toThrow();
  });

  test("rejects a top rung with no headroom before the block", () => {
    expect(() => assertValidLadder([{ at: 0.95, maxTokens: 500 }], true)).toThrow(/no room/);
  });

  test("names the threshold it will accept", () => {
    expect(() => assertValidLadder([{ at: 0.95, maxTokens: 500 }], true)).toThrow(
      String(1 - REQUIRED_HEADROOM),
    );
  });

  // Nothing to flap against when the policy never blocks.
  test("allows a high rung when the policy does not block", () => {
    expect(() => assertValidLadder([{ at: 0.95, maxTokens: 500 }], false)).not.toThrow();
  });

  test.each([0, 1, 1.5, -0.2])("rejects a threshold of %p", (at) => {
    expect(() => assertValidLadder([{ at, maxTokens: 500 }], false)).toThrow(/between 0 and 1/);
  });

  test("rejects two rungs at the same threshold", () => {
    expect(() =>
      assertValidLadder(
        [
          { at: 0.7, maxTokens: 100 },
          { at: 0.7, model: "m" },
        ],
        false,
      ),
    ).toThrow(/distinct/);
  });

  test.each([0, -1])("rejects a maxTokens of %p", (maxTokens) => {
    expect(() => assertValidLadder([{ at: 0.7, maxTokens }], false)).toThrow(/positive/);
  });

  test("rejects an empty model id", () => {
    expect(() => assertValidLadder([{ at: 0.7, model: "  " }], false)).toThrow(/non-empty/);
  });

  test("an empty ladder is valid — it simply never applies", () => {
    expect(() => assertValidLadder([], true)).not.toThrow();
  });
});
