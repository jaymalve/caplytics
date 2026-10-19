import { describe, expect, test } from "bun:test";
import { agentColor } from "./agent-colors";

describe("agentColor", () => {
  const agents = ["a", "b", "c", "d", "e", "f", "g"];

  test("follows the agent's position in the full list", () => {
    expect(agentColor("b", agents)).toBe("var(--chart-2)");
  });

  test("is stable however the visible set is filtered", () => {
    expect(agentColor("c", agents)).toBe(agentColor("c", agents));
  });

  test("wraps once the palette runs out", () => {
    expect(agentColor("g", agents)).toBe("var(--chart-1)");
  });

  test("falls back to the first colour for an agent outside the list", () => {
    expect(agentColor("unknown", agents)).toBe("var(--chart-1)");
  });
});
