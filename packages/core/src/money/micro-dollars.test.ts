import { describe, expect, test } from "bun:test";
import {
  MICRO_DOLLARS_PER_USD,
  type MicroDollars,
  microDollarsSchema,
  microDollarsToUsd,
  nonNegativeMicroDollarsSchema,
  subtractMicroDollars,
  sumMicroDollars,
  usdToMicroDollars,
  ZERO_MICRO_DOLLARS,
} from "./micro-dollars.js";

describe("usdToMicroDollars", () => {
  test.each([
    [0, 0],
    [5, 5_000_000],
    [0.01, 10_000],
    [1e-6, 1],
    [-2.5, -2_500_000],
  ])("converts %p USD to %p", (usd, expected) => {
    expect(Number(usdToMicroDollars(usd))).toBe(expected);
  });

  test("rounds below micro-dollar resolution rather than producing a float", () => {
    expect(Number(usdToMicroDollars(1e-7))).toBe(0);
    expect(Number(usdToMicroDollars(1.5e-6))).toBe(2);
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects %p",
    (value) => {
      expect(() => usdToMicroDollars(value)).toThrow();
    },
  );
});

describe("summing", () => {
  // The reason the whole representation exists: 0.1 + 0.2 !== 0.3 in floats, so a cap comparison
  // after enough additions would depend on accumulated error.
  test("is exact across additions that would drift as floats", () => {
    const tenth = usdToMicroDollars(0.1);
    const total = sumMicroDollars(...Array<typeof tenth>(10).fill(tenth));

    expect(Number(total)).toBe(MICRO_DOLLARS_PER_USD);
    expect(microDollarsToUsd(total)).toBe(1);
  });

  test("of nothing is zero", () => {
    expect(sumMicroDollars()).toBe(ZERO_MICRO_DOLLARS);
  });
});

test("subtraction goes negative, because an overspent budget does", () => {
  const remaining = subtractMicroDollars(usdToMicroDollars(5), usdToMicroDollars(5.02));

  expect(Number(remaining)).toBe(-20_000);
});

test("microDollarsToUsd round-trips", () => {
  expect(microDollarsToUsd(usdToMicroDollars(42.18))).toBe(42.18);
});

test("type-level: a plain dollar amount is not assignable to MicroDollars", () => {
  // @ts-expect-error — the 1,000,000x mix-up the brand exists to make impossible
  const cap: MicroDollars = 5;

  expect(Number(cap)).toBe(5);
});

describe("schemas", () => {
  test("reject non-integers", () => {
    expect(microDollarsSchema.safeParse(1.5).success).toBe(false);
  });

  test("accept negatives, which a budget remainder needs", () => {
    expect(microDollarsSchema.safeParse(-20_000).success).toBe(true);
  });

  test("nonNegative variant rejects negatives, which a cost may never be", () => {
    expect(nonNegativeMicroDollarsSchema.safeParse(-1).success).toBe(false);
    expect(nonNegativeMicroDollarsSchema.safeParse(0).success).toBe(true);
  });
});
