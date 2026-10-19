const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
] as const;

/**
 * Colour by position in the full agent list, not the filtered one, so an agent keeps its colour
 * as filters narrow the chart — a colour that shifts with the filter reads as a different agent.
 */
export function agentColor(agent: string, allAgents: readonly string[]): string {
  const index = allAgents.indexOf(agent);
  return PALETTE[(index < 0 ? 0 : index) % PALETTE.length] ?? PALETTE[0];
}
