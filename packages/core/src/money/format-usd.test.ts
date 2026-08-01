import { expect, test } from "bun:test";
import { formatUsd } from "./format-usd.js";
import { usdToMicroDollars, ZERO_MICRO_DOLLARS } from "./micro-dollars.js";

test.each([
  [0, "$0.00"],
  [5, "$5.00"],
  [5.02, "$5.02"],
  [42.18, "$42.18"],
  [1234.5, "$1,234.50"],
])("formats %p USD as %p", (usd, expected) => {
  expect(formatUsd(usdToMicroDollars(usd))).toBe(expected);
});

test("widens sub-cent amounts instead of reporting them as $0.00", () => {
  expect(formatUsd(usdToMicroDollars(0.000023))).toBe("$0.000023");
  expect(formatUsd(usdToMicroDollars(0.009))).toBe("$0.009");
});

// Two decimal places would render this, $0.0051, and $0.0149 all as "$0.01" — a table of per-call
// costs would then show near-identical rows that do not add up to its own total.
test("keeps precision through the cent range, where per-call costs actually land", () => {
  expect(formatUsd(usdToMicroDollars(0.0145))).toBe("$0.0145");
  expect(formatUsd(usdToMicroDollars(0.0051))).toBe("$0.0051");
});

test("trims trailing zeros, so round amounts keep their familiar shape", () => {
  expect(formatUsd(usdToMicroDollars(0.01))).toBe("$0.01");
  expect(formatUsd(usdToMicroDollars(0.5))).toBe("$0.50");
});

test("switches to plain cents at a dollar and above", () => {
  expect(formatUsd(usdToMicroDollars(1.2345))).toBe("$1.23");
  expect(formatUsd(usdToMicroDollars(0.999))).toBe("$0.999");
});

test("zero stays $0.00 rather than widening", () => {
  expect(formatUsd(ZERO_MICRO_DOLLARS)).toBe("$0.00");
});

test("formats an overspent budget as negative", () => {
  expect(formatUsd(usdToMicroDollars(-0.02))).toBe("-$0.02");
});

// §4.2: "stopped after $5.02 of $5.00" must report spend at stop time, not the configured cap.
test("reports actual spend and cap distinctly", () => {
  const spent = usdToMicroDollars(5.02);
  const cap = usdToMicroDollars(5);

  expect(`stopped after ${formatUsd(spent)} of ${formatUsd(cap)}`).toBe(
    "stopped after $5.02 of $5.00",
  );
});
