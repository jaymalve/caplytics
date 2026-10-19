import { describe, expect, test } from "bun:test";
import { formatTimestamp, formatTokens } from "./format-event";

describe("formatTimestamp", () => {
  test("renders UTC to the second", () => {
    expect(formatTimestamp("2026-10-18T22:31:07.512+02:00")).toBe("2026-10-18 20:31:07");
  });
});

describe("formatTokens", () => {
  test("shows a dash rather than zero when there are no tokens to report", () => {
    expect(formatTokens(undefined)).toBe("—");
  });

  test("groups thousands", () => {
    expect(formatTokens(12_345)).toBe("12,345");
  });
});
